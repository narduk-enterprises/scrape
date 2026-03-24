#!/usr/bin/env -S pnpm exec tsx

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  catalogImportBundleSchema,
  computeTargetFingerprint,
  stableStringify,
  type CatalogImportBundle,
  type CatalogImportCatalogItem,
  type CatalogImportCompetitor,
} from '../packages/scrape-contract/src/index.ts'

interface CliOptions {
  appDir: string
  dbName: string
  dryRun: boolean
  local: boolean
  seedPath: string
}

type SqlScalar = boolean | null | number | string | undefined
type SqlRow = Record<string, SqlScalar>
interface ScrapeTargetSeedRow {
  row: SqlRow
  sourceKey: string
}

const DEFAULT_SEED_PATH = './seed/catalog-import.seed.json'
const DEFAULT_DB_NAME = 'scrape-db'

function getFlagValue(args: string[], name: string): string | undefined {
  const exactIndex = args.findIndex((arg) => arg === name)
  if (exactIndex >= 0) return args[exactIndex + 1]

  const prefix = `${name}=`
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name) || args.some((arg) => arg.startsWith(`${name}=`))
}

function parseArgs(args: string[]): CliOptions {
  return {
    appDir: resolve(getFlagValue(args, '--app-dir') ?? process.cwd()),
    dbName: getFlagValue(args, '--db') ?? DEFAULT_DB_NAME,
    dryRun: hasFlag(args, '--dry-run'),
    local: hasFlag(args, '--remote') ? false : true,
    seedPath: resolve(process.cwd(), getFlagValue(args, '--seed') ?? DEFAULT_SEED_PATH),
  }
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function makeStableId(prefix: string, ...parts: string[]): string {
  const digest = createHash('sha256').update(parts.join('|')).digest('hex')
  return `${prefix}_${digest.slice(0, 24)}`
}

function sqlValue(value: SqlScalar): string {
  if (value == null) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  return `'${value.replaceAll("'", "''")}'`
}

function jsonValue(value: unknown): string | null {
  if (value == null) return null
  return stableStringify(value)
}

function buildUpsertSql(
  tableName: string,
  row: SqlRow,
  conflictColumns: string[],
  updateColumns: string[],
): string {
  const columns = Object.keys(row)
  const values = columns.map((column) => sqlValue(row[column]))
  const updateSql =
    updateColumns.length > 0
      ? updateColumns.map((column) => `${column} = excluded.${column}`).join(', ')
      : 'id = id'

  return [
    `INSERT INTO ${tableName} (${columns.join(', ')})`,
    `VALUES (${values.join(', ')})`,
    `ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updateSql};`,
  ].join(' ')
}

function buildProductTitle(item: CatalogImportCatalogItem): string {
  const description = item.partDescription?.trim()
  if (description) return description

  const manufacturer = item.manufacturerName?.trim() || item.manufacturerCode?.trim() || 'Unknown'
  return `${manufacturer} ${item.partNumber}`
}

function buildProductKey(item: CatalogImportCatalogItem): string {
  return [
    normalizeText(item.manufacturerName ?? item.manufacturerCode),
    normalizeText(item.partNumber),
  ]
    .filter(Boolean)
    .join('|')
}

function readSeedBundle(seedPath: string): CatalogImportBundle {
  const input = readFileSync(seedPath, 'utf8')
  const parsed = JSON.parse(input) as unknown
  return catalogImportBundleSchema.parse(parsed)
}

function competitorOrganizationKey(competitor: CatalogImportCompetitor): string {
  return normalizeText(competitor.organization.domain || competitor.organization.name)
}

function upsertById(map: Map<string, SqlRow>, id: string, row: SqlRow): void {
  map.set(id, row)
}

function upsertByKey(map: Map<string, SqlRow>, key: string, row: SqlRow): void {
  map.set(key, row)
}

async function buildSeedSql(bundle: CatalogImportBundle): Promise<{
  sql: string
  summary: {
    catalogItems: number
    competitors: number
    products: number
    projects: number
    scrapeSeeds: number
    sources: number
  }
}> {
  const now = new Date().toISOString()
  const organizations = new Map<string, SqlRow>()
  const brands = new Map<string, SqlRow>()
  const products = new Map<string, SqlRow>()
  const productIdentifiers = new Map<string, SqlRow>()
  const projects = new Map<string, SqlRow>()
  const projectCatalogItems = new Map<string, SqlRow>()
  const sources = new Map<string, SqlRow>()
  const projectCompetitors = new Map<string, SqlRow>()
  const scrapeTargets = new Map<string, ScrapeTargetSeedRow>()
  const projectScrapeTargets = new Map<string, SqlRow>()

  let catalogItemCount = 0
  let competitorCount = 0
  let scrapeSeedCount = 0

  for (const project of bundle.projects) {
    const projectId = makeStableId('piproj', project.externalProjectId ?? project.slug)
    const projectMeta = {
      ...(project.meta ?? {}),
      importedAt: bundle.importedAt ?? now,
      seedCatalogItems: project.catalogItems.length,
      seedCompetitors: project.competitors.length,
    }

    upsertById(projects, projectId, {
      id: projectId,
      external_project_id: project.externalProjectId ?? null,
      slug: project.slug,
      name: project.name,
      description: project.description ?? null,
      customer_name: project.customerName ?? null,
      catalog_source: project.catalogSource ?? null,
      default_currency: project.defaultCurrency,
      meta_json: jsonValue(projectMeta),
      created_at: now,
      updated_at: now,
    })

    for (const item of project.catalogItems) {
      catalogItemCount += 1

      const manufacturerName = item.manufacturerName?.trim() || null
      const manufacturerCode = item.manufacturerCode?.trim() || null
      const manufacturerKey = normalizeText(manufacturerName ?? manufacturerCode)
      const manufacturerOrgId = manufacturerKey
        ? makeStableId('piorg', `manufacturer|${manufacturerKey}`)
        : null
      const brandId = manufacturerKey ? makeStableId('pibrand', `brand|${manufacturerKey}`) : null
      const productId = makeStableId('piprod', buildProductKey(item))
      const catalogItemId = makeStableId('picatalog', `${projectId}|${item.externalItemId}`)
      const itemMeta = {
        ...(item.meta ?? {}),
        importedAt: bundle.importedAt ?? now,
      }

      if (manufacturerOrgId && manufacturerName) {
        upsertById(organizations, manufacturerOrgId, {
          id: manufacturerOrgId,
          name: manufacturerName,
          normalized_name: normalizeText(manufacturerName),
          domain: null,
          org_type: 'manufacturer',
          country: null,
          region: null,
          website_url: null,
          logo_url: null,
          description: null,
          meta_json: jsonValue({
            manufacturerCode,
            seedSource: project.catalogSource ?? bundle.meta?.seedSource ?? null,
          }),
          is_verified: false,
          created_at: now,
          updated_at: now,
        })

        upsertById(brands, brandId!, {
          id: brandId!,
          name: manufacturerName,
          normalized_name: normalizeText(manufacturerName),
          owner_org_id: manufacturerOrgId,
          parent_brand_id: null,
          website_url: null,
          logo_url: null,
          description: null,
          meta_json: jsonValue({
            manufacturerCode,
            seededFromCatalogImport: true,
          }),
          is_verified: false,
          created_at: now,
          updated_at: now,
        })
      }

      upsertById(products, productId, {
        id: productId,
        title: buildProductTitle(item),
        normalized_title: normalizeText(buildProductTitle(item)),
        brand_id: brandId,
        manufacturer_org_id: manufacturerOrgId,
        category_id: null,
        model_number: null,
        part_number: item.partNumber,
        description: item.partDescription ?? null,
        short_description: null,
        unit_of_measure: null,
        pack_size: null,
        weight_value: null,
        weight_unit: null,
        image_url: null,
        product_url: null,
        is_active: true,
        attributes_json: jsonValue({
          itemType: item.itemType ?? null,
          manufacturerCode,
        }),
        meta_json: jsonValue({
          seededFromCatalogImport: true,
          manufacturerCode,
        }),
        match_status: 'auto',
        created_at: now,
        updated_at: now,
      })

      upsertByKey(productIdentifiers, `${productId}|mpn|${item.partNumber}`, {
        id: makeStableId('piident', `${productId}|mpn|${normalizeText(item.partNumber)}`),
        product_id: productId,
        identifier_type: 'mpn',
        identifier_value: item.partNumber,
        issuing_org_id: manufacturerOrgId,
        is_primary: true,
        confidence: 90,
        source_url: null,
        created_at: now,
      })

      upsertByKey(projectCatalogItems, `${projectId}|${item.externalItemId}`, {
        id: catalogItemId,
        project_id: projectId,
        product_id: productId,
        external_item_id: item.externalItemId,
        part_number: item.partNumber,
        manufacturer_code: manufacturerCode,
        manufacturer_name: manufacturerName,
        part_description: item.partDescription ?? null,
        item_type: item.itemType ?? null,
        quantity: item.quantity ?? null,
        meta_json: jsonValue(itemMeta),
        raw_import_json: jsonValue(item),
        created_at: now,
        updated_at: now,
      })
    }

    for (const competitor of project.competitors) {
      competitorCount += 1

      const competitorOrgId = makeStableId(
        'piorg',
        `competitor|${competitorOrganizationKey(competitor)}`,
      )
      const projectId = makeStableId('piproj', project.externalProjectId ?? project.slug)
      const competitorId = makeStableId('pipcomp', `${projectId}|${competitor.sourceKey}`)
      const sourceId = makeStableId('scrsrc', competitor.sourceKey)

      upsertById(organizations, competitorOrgId, {
        id: competitorOrgId,
        name: competitor.organization.name,
        normalized_name: normalizeText(competitor.organization.name),
        domain: competitor.organization.domain ?? null,
        org_type: competitor.organization.orgType,
        country: null,
        region: null,
        website_url: competitor.organization.websiteUrl ?? null,
        logo_url: null,
        description: null,
        meta_json: jsonValue({
          seededFromCatalogImport: true,
        }),
        is_verified: false,
        created_at: now,
        updated_at: now,
      })

      upsertByKey(sources, competitor.sourceKey, {
        id: sourceId,
        key: competitor.sourceKey,
        label: competitor.sourceLabel ?? competitor.organization.name,
        default_ttl_seconds: competitor.defaultTtlSeconds ?? 86_400,
        created_at: now,
      })

      upsertByKey(projectCompetitors, `${projectId}|${competitor.sourceKey}`, {
        id: competitorId,
        project_id: projectId,
        organization_id: competitorOrgId,
        source_key: competitor.sourceKey,
        source_label: competitor.sourceLabel ?? competitor.organization.name,
        default_ttl_seconds: competitor.defaultTtlSeconds ?? 86_400,
        is_active: true,
        notes: competitor.notes ?? null,
        meta_json: jsonValue(competitor.meta ?? null),
        created_at: now,
        updated_at: now,
      })

      for (const seed of competitor.scrapeSeeds) {
        scrapeSeedCount += 1

        const fingerprint = await computeTargetFingerprint({
          sourceKey: competitor.sourceKey,
          normalizedUrl: seed.normalizedUrl,
          externalKey: seed.externalKey ?? null,
        })

        const linkedCatalogItem = seed.catalogItemExternalId
          ? project.catalogItems.find((item) => item.externalItemId === seed.catalogItemExternalId)
          : null
        const linkedProductId = linkedCatalogItem
          ? makeStableId('piprod', buildProductKey(linkedCatalogItem))
          : null
        const linkedCatalogItemId = seed.catalogItemExternalId
          ? makeStableId('picatalog', `${projectId}|${seed.catalogItemExternalId}`)
          : null

        scrapeTargets.set(fingerprint, {
          sourceKey: competitor.sourceKey,
          row: {
            id: makeStableId('scrtgt', fingerprint),
            fingerprint,
            normalized_url: seed.normalizedUrl,
            external_key: seed.externalKey ?? null,
            label: seed.label ?? null,
            meta_json: jsonValue({
              seedType: seed.seedType,
              seededFromCatalogImport: true,
            }),
            created_at: now,
            updated_at: now,
          },
        })

        upsertByKey(projectScrapeTargets, `${projectId}|${competitorId}|${fingerprint}`, {
          id: makeStableId('pipseed', `${projectId}|${competitorId}|${fingerprint}`),
          project_id: projectId,
          competitor_id: competitorId,
          catalog_item_id: linkedCatalogItemId,
          product_id: linkedProductId,
          target_fingerprint: fingerprint,
          normalized_url: seed.normalizedUrl,
          external_key: seed.externalKey ?? null,
          label: seed.label ?? null,
          seed_type: seed.seedType,
          search_term: seed.searchTerm ?? null,
          is_active: true,
          meta_json: jsonValue(seed.meta ?? null),
          created_at: now,
          updated_at: now,
        })
      }
    }
  }

  const statements = [
    'PRAGMA foreign_keys = ON;',
    ...[...projects.values()].map((row) =>
      buildUpsertSql(
        'pi_projects',
        row,
        ['id'],
        [
          'external_project_id',
          'slug',
          'name',
          'description',
          'customer_name',
          'catalog_source',
          'default_currency',
          'meta_json',
          'updated_at',
        ],
      ),
    ),
    ...[...organizations.values()].map((row) =>
      buildUpsertSql(
        'pi_organizations',
        row,
        ['id'],
        ['name', 'normalized_name', 'domain', 'org_type', 'website_url', 'meta_json', 'updated_at'],
      ),
    ),
    ...[...brands.values()].map((row) =>
      buildUpsertSql(
        'pi_brands',
        row,
        ['id'],
        ['name', 'normalized_name', 'owner_org_id', 'meta_json', 'updated_at'],
      ),
    ),
    ...[...products.values()].map((row) =>
      buildUpsertSql(
        'pi_products',
        row,
        ['id'],
        [
          'title',
          'normalized_title',
          'brand_id',
          'manufacturer_org_id',
          'part_number',
          'description',
          'attributes_json',
          'meta_json',
          'updated_at',
        ],
      ),
    ),
    ...[...productIdentifiers.values()].map((row) =>
      buildUpsertSql(
        'pi_product_identifiers',
        row,
        ['product_id', 'identifier_type', 'identifier_value'],
        ['issuing_org_id', 'is_primary', 'confidence'],
      ),
    ),
    ...[...projectCatalogItems.values()].map((row) =>
      buildUpsertSql(
        'pi_project_catalog_items',
        row,
        ['project_id', 'external_item_id'],
        [
          'product_id',
          'part_number',
          'manufacturer_code',
          'manufacturer_name',
          'part_description',
          'item_type',
          'quantity',
          'meta_json',
          'raw_import_json',
          'updated_at',
        ],
      ),
    ),
    ...[...sources.values()].map((row) =>
      buildUpsertSql('scrape_sources', row, ['key'], ['label', 'default_ttl_seconds']),
    ),
    ...[...projectCompetitors.values()].map((row) =>
      buildUpsertSql(
        'pi_project_competitors',
        row,
        ['project_id', 'source_key'],
        [
          'organization_id',
          'source_label',
          'default_ttl_seconds',
          'is_active',
          'notes',
          'meta_json',
          'updated_at',
        ],
      ),
    ),
    ...[...scrapeTargets.values()].map(({ row, sourceKey }) =>
      [
        'INSERT INTO scrape_targets (id, source_id, fingerprint, normalized_url, external_key, label, meta_json, created_at, updated_at)',
        `VALUES (${sqlValue(row.id)}, (SELECT id FROM scrape_sources WHERE key = ${sqlValue(sourceKey)}), ${sqlValue(row.fingerprint)}, ${sqlValue(row.normalized_url)}, ${sqlValue(row.external_key)}, ${sqlValue(row.label)}, ${sqlValue(row.meta_json)}, ${sqlValue(row.created_at)}, ${sqlValue(row.updated_at)})`,
        'ON CONFLICT (fingerprint) DO UPDATE SET',
        `source_id = (SELECT id FROM scrape_sources WHERE key = ${sqlValue(sourceKey)}),`,
        'normalized_url = excluded.normalized_url,',
        'external_key = excluded.external_key,',
        'label = excluded.label,',
        'meta_json = excluded.meta_json,',
        'updated_at = excluded.updated_at;',
      ].join(' '),
    ),
    ...[...projectScrapeTargets.values()].map((row) =>
      buildUpsertSql(
        'pi_project_scrape_targets',
        row,
        ['project_id', 'competitor_id', 'target_fingerprint'],
        [
          'catalog_item_id',
          'product_id',
          'normalized_url',
          'external_key',
          'label',
          'seed_type',
          'search_term',
          'is_active',
          'meta_json',
          'updated_at',
        ],
      ),
    ),
  ]

  return {
    sql: `${statements.join('\n')}\n`,
    summary: {
      catalogItems: catalogItemCount,
      competitors: competitorCount,
      products: products.size,
      projects: projects.size,
      scrapeSeeds: scrapeSeedCount,
      sources: sources.size,
    },
  }
}

function runWranglerSeed(sql: string, options: CliOptions): void {
  const tempDir = mkdtempSync(join(tmpdir(), 'catalog-import-seed-'))
  const sqlPath = join(tempDir, 'seed.sql')
  writeFileSync(sqlPath, sql)

  try {
    const args = ['exec', 'wrangler', 'd1', 'execute', options.dbName]
    args.push(options.local ? '--local' : '--remote')
    args.push('--file', sqlPath)

    execFileSync('pnpm', args, {
      cwd: options.appDir,
      stdio: 'inherit',
      env: process.env,
    })
  } finally {
    rmSync(tempDir, { force: true, recursive: true })
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const bundle = readSeedBundle(options.seedPath)
  const { sql, summary } = await buildSeedSql(bundle)

  console.log(
    `Validated ${summary.projects} project(s), ${summary.catalogItems} catalog item(s), ${summary.competitors} competitor link(s), and ${summary.scrapeSeeds} scrape seed(s).`,
  )

  if (options.dryRun) {
    const preview = sql.split('\n').slice(0, 16).join('\n')
    console.log('\nDry run only. SQL preview:\n')
    console.log(preview)
    return
  }

  runWranglerSeed(sql, options)
  console.log(
    `Applied catalog import seed to ${options.dbName} (${options.local ? 'local' : 'remote'}) from ${options.seedPath}.`,
  )
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  console.error(message)
  process.exitCode = 1
})

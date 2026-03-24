import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { useAppDatabase } from '#server/utils/app-database'
import { requireAdmin } from '#layer/server/utils/auth'

const paramsSchema = z.object({
  slug: z.string().min(1).max(128),
})

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return null
  }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function deriveRunState(
  payload: Record<string, unknown> | null,
  pendingJobCount: number,
): 'http-error' | 'never-run' | 'ok' | 'queued' | 'soft-error' {
  if (pendingJobCount > 0) {
    return 'queued'
  }

  const scrapeStatus = readString(payload?.['scrapeStatus'])
  if (scrapeStatus === 'ok') {
    return 'ok'
  }
  if (scrapeStatus === 'soft-error') {
    return 'soft-error'
  }
  if (scrapeStatus === 'http-error') {
    return 'http-error'
  }

  return 'never-run'
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const parsed = paramsSchema.safeParse({
    slug: getRouterParam(event, 'slug'),
  })
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'Invalid project slug' })
  }

  const db = useAppDatabase(event)

  const projectRow = await db.get<{
    id: string
    slug: string
    name: string
    description: string | null
    customer_name: string | null
    catalog_source: string | null
    default_currency: string
    external_project_id: string | null
    meta_json: string | null
    created_at: string
    updated_at: string
    catalog_item_count: number
    competitor_count: number
    scrape_seed_count: number
  }>(sql`
    SELECT
      p.id,
      p.slug,
      p.name,
      p.description,
      p.customer_name,
      p.catalog_source,
      p.default_currency,
      p.external_project_id,
      p.meta_json,
      p.created_at,
      p.updated_at,
      (
        SELECT COUNT(*)
        FROM pi_project_catalog_items pci
        WHERE pci.project_id = p.id
      ) AS catalog_item_count,
      (
        SELECT COUNT(*)
        FROM pi_project_competitors pc
        WHERE pc.project_id = p.id
          AND COALESCE(pc.is_active, 1) = 1
      ) AS competitor_count,
      (
        SELECT COUNT(*)
        FROM pi_project_scrape_targets pst
        WHERE pst.project_id = p.id
          AND COALESCE(pst.is_active, 1) = 1
      ) AS scrape_seed_count
    FROM pi_projects p
    WHERE p.slug = ${parsed.data.slug}
    LIMIT 1
  `)

  if (!projectRow) {
    throw createError({ statusCode: 404, message: 'Project not found' })
  }

  const catalogItemRows = await db.all<{
    id: string
    external_item_id: string
    part_number: string
    manufacturer_code: string | null
    manufacturer_name: string | null
    part_description: string | null
    item_type: string | null
    quantity: number | null
    seed_count: number
  }>(sql`
    SELECT
      pci.id,
      pci.external_item_id,
      pci.part_number,
      pci.manufacturer_code,
      pci.manufacturer_name,
      pci.part_description,
      pci.item_type,
      pci.quantity,
      (
        SELECT COUNT(*)
        FROM pi_project_scrape_targets pst
        WHERE pst.catalog_item_id = pci.id
          AND COALESCE(pst.is_active, 1) = 1
      ) AS seed_count
    FROM pi_project_catalog_items pci
    WHERE pci.project_id = ${projectRow.id}
    ORDER BY
      COALESCE(pci.manufacturer_name, ''),
      pci.part_number ASC
  `)

  const competitorSeedRows = await db.all<{
    competitor_id: string
    source_key: string
    source_label: string | null
    default_ttl_seconds: number
    competitor_is_active: number | null
    notes: string | null
    competitor_meta_json: string | null
    organization_name: string
    organization_domain: string | null
    organization_website_url: string | null
    seed_id: string | null
    target_fingerprint: string | null
    normalized_url: string | null
    external_key: string | null
    label: string | null
    seed_type: string | null
    search_term: string | null
    seed_is_active: number | null
    seed_meta_json: string | null
    catalog_item_id: string | null
    catalog_item_external_id: string | null
    catalog_item_part_number: string | null
    catalog_item_manufacturer_name: string | null
    last_observed_at: string | null
    last_quality_score: number | null
    last_strategy: string | null
    last_payload_json: string | null
    pending_job_count: number
  }>(sql`
    SELECT
      pc.id AS competitor_id,
      pc.source_key,
      pc.source_label,
      pc.default_ttl_seconds,
      pc.is_active AS competitor_is_active,
      pc.notes,
      pc.meta_json AS competitor_meta_json,
      org.name AS organization_name,
      org.domain AS organization_domain,
      org.website_url AS organization_website_url,
      pst.id AS seed_id,
      pst.target_fingerprint,
      pst.normalized_url,
      pst.external_key,
      pst.label,
      pst.seed_type,
      pst.search_term,
      pst.is_active AS seed_is_active,
      pst.meta_json AS seed_meta_json,
      pci.id AS catalog_item_id,
      pci.external_item_id AS catalog_item_external_id,
      pci.part_number AS catalog_item_part_number,
      pci.manufacturer_name AS catalog_item_manufacturer_name,
      (
        SELECT o.observed_at
        FROM scrape_targets st
        INNER JOIN scrape_observations o ON o.target_id = st.id
        WHERE st.fingerprint = pst.target_fingerprint
        ORDER BY datetime(o.observed_at) DESC
        LIMIT 1
      ) AS last_observed_at,
      (
        SELECT o.quality_score
        FROM scrape_targets st
        INNER JOIN scrape_observations o ON o.target_id = st.id
        WHERE st.fingerprint = pst.target_fingerprint
        ORDER BY datetime(o.observed_at) DESC
        LIMIT 1
      ) AS last_quality_score,
      (
        SELECT o.strategy
        FROM scrape_targets st
        INNER JOIN scrape_observations o ON o.target_id = st.id
        WHERE st.fingerprint = pst.target_fingerprint
        ORDER BY datetime(o.observed_at) DESC
        LIMIT 1
      ) AS last_strategy,
      (
        SELECT o.payload_json
        FROM scrape_targets st
        INNER JOIN scrape_observations o ON o.target_id = st.id
        WHERE st.fingerprint = pst.target_fingerprint
        ORDER BY datetime(o.observed_at) DESC
        LIMIT 1
      ) AS last_payload_json,
      (
        SELECT COUNT(*)
        FROM scrape_targets st
        INNER JOIN scrape_jobs j ON j.target_id = st.id
        WHERE st.fingerprint = pst.target_fingerprint
          AND j.status IN ('pending', 'leased')
      ) AS pending_job_count
    FROM pi_project_competitors pc
    INNER JOIN pi_organizations org ON org.id = pc.organization_id
    LEFT JOIN pi_project_scrape_targets pst ON pst.competitor_id = pc.id
    LEFT JOIN pi_project_catalog_items pci ON pci.id = pst.catalog_item_id
    WHERE pc.project_id = ${projectRow.id}
    ORDER BY
      pc.source_key ASC,
      COALESCE(pst.label, pst.normalized_url, '') ASC
  `)

  const competitors = new Map<
    string,
    {
      id: string
      sourceKey: string
      sourceLabel: string | null
      defaultTtlSeconds: number
      isActive: boolean
      notes: string | null
      meta: Record<string, unknown> | null
      organizationName: string
      organizationDomain: string | null
      organizationWebsiteUrl: string | null
      scrapeSeedCount: number
      statusCounts: {
        httpError: number
        neverRun: number
        ok: number
        queued: number
        softError: number
      }
      seeds: Array<{
        id: string
        targetFingerprint: string
        normalizedUrl: string
        externalKey: string | null
        label: string | null
        seedType: string
        searchTerm: string | null
        isActive: boolean
        catalogItemId: string | null
        catalogItemExternalId: string | null
        catalogItemPartNumber: string | null
        catalogItemManufacturerName: string | null
        meta: Record<string, unknown> | null
        runState: 'http-error' | 'never-run' | 'ok' | 'queued' | 'soft-error'
        lastObservedAt: string | null
        lastScrapeStatus: string | null
        lastHttpStatus: number | null
        lastQualityScore: number | null
        lastStrategy: string | null
        lastTitle: string | null
        softErrorSignals: string[]
        pendingJobCount: number
      }>
    }
  >()

  for (const row of competitorSeedRows) {
    const existing = competitors.get(row.competitor_id)
    if (!existing) {
      competitors.set(row.competitor_id, {
        id: row.competitor_id,
        sourceKey: row.source_key,
        sourceLabel: row.source_label,
        defaultTtlSeconds: row.default_ttl_seconds,
        isActive: Boolean(row.competitor_is_active ?? 1),
        notes: row.notes,
        meta: parseJsonRecord(row.competitor_meta_json),
        organizationName: row.organization_name,
        organizationDomain: row.organization_domain,
        organizationWebsiteUrl: row.organization_website_url,
        scrapeSeedCount: 0,
        statusCounts: {
          httpError: 0,
          neverRun: 0,
          ok: 0,
          queued: 0,
          softError: 0,
        },
        seeds: [],
      })
    }

    if (!row.seed_id || !row.target_fingerprint || !row.normalized_url || !row.seed_type) {
      continue
    }

    const competitor = competitors.get(row.competitor_id)
    if (!competitor) {
      continue
    }

    const payload = parseJsonRecord(row.last_payload_json)
    const pendingJobCount = Number(row.pending_job_count ?? 0)
    const runState = deriveRunState(payload, pendingJobCount)
    const lastScrapeStatus = readString(payload?.['scrapeStatus'])
    const lastHttpStatus = readNumber(payload?.['httpStatus'])
    const lastTitle =
      readString(payload?.['title']) ??
      readString(payload?.['ogTitle']) ??
      readString(payload?.['finalUrl'])
    const softErrorSignals = readStringArray(payload?.['softErrorSignals'])

    competitor.seeds.push({
      id: row.seed_id,
      targetFingerprint: row.target_fingerprint,
      normalizedUrl: row.normalized_url,
      externalKey: row.external_key,
      label: row.label,
      seedType: row.seed_type,
      searchTerm: row.search_term,
      isActive: Boolean(row.seed_is_active ?? 1),
      catalogItemId: row.catalog_item_id,
      catalogItemExternalId: row.catalog_item_external_id,
      catalogItemPartNumber: row.catalog_item_part_number,
      catalogItemManufacturerName: row.catalog_item_manufacturer_name,
      meta: parseJsonRecord(row.seed_meta_json),
      runState,
      lastObservedAt: row.last_observed_at,
      lastScrapeStatus,
      lastHttpStatus,
      lastQualityScore: row.last_quality_score,
      lastStrategy: row.last_strategy,
      lastTitle,
      softErrorSignals,
      pendingJobCount,
    })
    competitor.scrapeSeedCount += 1

    if (runState === 'ok') {
      competitor.statusCounts.ok += 1
    } else if (runState === 'soft-error') {
      competitor.statusCounts.softError += 1
    } else if (runState === 'http-error') {
      competitor.statusCounts.httpError += 1
    } else if (runState === 'queued') {
      competitor.statusCounts.queued += 1
    } else {
      competitor.statusCounts.neverRun += 1
    }
  }

  return {
    project: {
      id: projectRow.id,
      slug: projectRow.slug,
      name: projectRow.name,
      description: projectRow.description,
      customerName: projectRow.customer_name,
      catalogSource: projectRow.catalog_source,
      defaultCurrency: projectRow.default_currency,
      externalProjectId: projectRow.external_project_id,
      createdAt: projectRow.created_at,
      updatedAt: projectRow.updated_at,
      meta: parseJsonRecord(projectRow.meta_json),
      counts: {
        catalogItems: Number(projectRow.catalog_item_count ?? 0),
        competitors: Number(projectRow.competitor_count ?? 0),
        scrapeSeeds: Number(projectRow.scrape_seed_count ?? 0),
      },
      catalogItems: catalogItemRows.map((row) => ({
        id: row.id,
        externalItemId: row.external_item_id,
        partNumber: row.part_number,
        manufacturerCode: row.manufacturer_code,
        manufacturerName: row.manufacturer_name,
        partDescription: row.part_description,
        itemType: row.item_type,
        quantity: row.quantity,
        seedCount: Number(row.seed_count ?? 0),
      })),
      competitors: [...competitors.values()],
    },
  }
})

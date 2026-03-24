import { z } from 'zod'

const catalogImportMetaSchema = z.record(z.string(), z.unknown())

const catalogProjectSlugSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

const catalogSourceKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/)

export const catalogImportOrgTypeSchema = z.enum([
  'manufacturer',
  'retailer',
  'distributor',
  'marketplace',
  'brand_owner',
  'reseller',
  'wholesaler',
  'service_provider',
  'unknown',
])

export const catalogImportSeedTypeSchema = z.enum([
  'search_results',
  'category',
  'product_detail',
  'manual',
])

export const catalogImportCatalogItemSchema = z
  .object({
    externalItemId: z.string().min(1).max(128),
    partNumber: z.string().min(1).max(256),
    manufacturerCode: z.string().min(1).max(64).optional(),
    manufacturerName: z.string().min(1).max(256).optional(),
    partDescription: z.string().min(1).max(4096).optional(),
    itemType: z.string().min(1).max(128).nullable().optional(),
    quantity: z.number().int().positive().optional(),
    meta: catalogImportMetaSchema.optional(),
  })
  .strict()

export const catalogImportCompetitorOrganizationSchema = z
  .object({
    name: z.string().min(1).max(256),
    domain: z.string().min(1).max(256).optional(),
    websiteUrl: z.string().url().max(4096).optional(),
    orgType: catalogImportOrgTypeSchema.default('distributor'),
  })
  .strict()

export const catalogImportScrapeSeedSchema = z
  .object({
    normalizedUrl: z.string().url().max(4096),
    label: z.string().min(1).max(1024).optional(),
    externalKey: z.string().min(1).max(512).optional(),
    seedType: catalogImportSeedTypeSchema,
    catalogItemExternalId: z.string().min(1).max(128).optional(),
    searchTerm: z.string().min(1).max(512).optional(),
    meta: catalogImportMetaSchema.optional(),
  })
  .strict()

export const catalogImportCompetitorSchema = z
  .object({
    sourceKey: catalogSourceKeySchema,
    sourceLabel: z.string().min(1).max(256).optional(),
    defaultTtlSeconds: z
      .number()
      .int()
      .min(60)
      .max(86_400 * 365)
      .optional(),
    organization: catalogImportCompetitorOrganizationSchema,
    notes: z.string().min(1).max(2048).optional(),
    meta: catalogImportMetaSchema.optional(),
    scrapeSeeds: z.array(catalogImportScrapeSeedSchema).min(1).max(500),
  })
  .strict()

export const catalogImportProjectSchema = z
  .object({
    externalProjectId: z.string().min(1).max(128).optional(),
    slug: catalogProjectSlugSchema,
    name: z.string().min(1).max(256),
    description: z.string().min(1).max(4096).optional(),
    customerName: z.string().min(1).max(256).optional(),
    catalogSource: z.string().min(1).max(1024).optional(),
    defaultCurrency: z.string().length(3).default('USD'),
    meta: catalogImportMetaSchema.optional(),
    catalogItems: z.array(catalogImportCatalogItemSchema).min(1).max(50_000),
    competitors: z.array(catalogImportCompetitorSchema).min(1).max(100),
  })
  .strict()

export const catalogImportBundleSchema = z
  .object({
    schemaVersion: z.literal('1'),
    importedAt: z.string().optional(),
    meta: catalogImportMetaSchema.optional(),
    projects: z.array(catalogImportProjectSchema).min(1).max(1_000),
  })
  .strict()

export const catalogImportBundleJsonSchema = z.toJSONSchema(catalogImportBundleSchema)

export type CatalogImportBundle = z.infer<typeof catalogImportBundleSchema>
export type CatalogImportProject = z.infer<typeof catalogImportProjectSchema>
export type CatalogImportCatalogItem = z.infer<typeof catalogImportCatalogItemSchema>
export type CatalogImportCompetitor = z.infer<typeof catalogImportCompetitorSchema>
export type CatalogImportScrapeSeed = z.infer<typeof catalogImportScrapeSeedSchema>

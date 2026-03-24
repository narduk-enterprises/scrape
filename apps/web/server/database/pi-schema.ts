/**
 * Price Intelligence data model — generic, category-agnostic schema for
 * multi-vertical price scraping and analytics on D1 / SQLite.
 *
 * Tables use the `pi_` prefix to separate canonical price intelligence
 * entities from the raw scraping pipeline tables (`scrape_*`).
 *
 * Layer overview:
 *   Canonical ─ organizations, brands, categories, products
 *   Identity  ─ org/brand/product aliases, product identifiers
 *   Commerce  ─ org relationships, listings
 *   History   ─ listing observations (append-only time-series)
 *   Evidence  ─ source pages, extracted facts, match candidates
 */
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// ── Organizations ────────────────────────────────────────────
// A single table for every commercial actor: manufacturer, retailer,
// distributor, marketplace, brand owner, reseller, service provider, etc.
// An org's intrinsic type is stored here; relational roles (authorized
// dealer *for* Brand X) live in pi_organization_relationships.

export const piOrganizations = sqliteTable(
  'pi_organizations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name'),
    domain: text('domain'),
    /** manufacturer | retailer | distributor | marketplace | brand_owner | reseller | wholesaler | service_provider | unknown */
    orgType: text('org_type').notNull().default('unknown'),
    country: text('country'),
    region: text('region'),
    websiteUrl: text('website_url'),
    logoUrl: text('logo_url'),
    description: text('description'),
    metaJson: text('meta_json'),
    isVerified: integer('is_verified', { mode: 'boolean' }).default(false),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    normalizedNameIdx: index('pi_orgs_normalized_name_idx').on(t.normalizedName),
    domainIdx: index('pi_orgs_domain_idx').on(t.domain),
    orgTypeIdx: index('pi_orgs_type_idx').on(t.orgType),
  }),
)

export const piOrganizationAliases = sqliteTable(
  'pi_organization_aliases',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => piOrganizations.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    normalizedAlias: text('normalized_alias').notNull(),
    /** trade_name | former_name | abbreviation | dba | scraped_name | domain_alias */
    aliasType: text('alias_type').notNull().default('scraped_name'),
    sourceUrl: text('source_url'),
    confidence: integer('confidence').default(50),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    orgIdx: index('pi_org_aliases_org_idx').on(t.orgId),
    normalizedIdx: index('pi_org_aliases_normalized_idx').on(t.normalizedAlias),
  }),
)

// Models the commercial graph between organizations. The source org "has
// the role" toward the target org.  Example: Org A distributes_for Org B.

export const piOrganizationRelationships = sqliteTable(
  'pi_organization_relationships',
  {
    id: text('id').primaryKey(),
    sourceOrgId: text('source_org_id')
      .notNull()
      .references(() => piOrganizations.id, { onDelete: 'cascade' }),
    targetOrgId: text('target_org_id')
      .notNull()
      .references(() => piOrganizations.id, { onDelete: 'cascade' }),
    /** distributes_for | authorized_dealer_for | subsidiary_of | parent_of | brand_owner_of | marketplace_host_for | supplies_to | resells_for | manufactures_for | oem_for */
    relationshipType: text('relationship_type').notNull(),
    scope: text('scope'),
    region: text('region'),
    effectiveFrom: text('effective_from'),
    effectiveUntil: text('effective_until'),
    isExclusive: integer('is_exclusive', { mode: 'boolean' }).default(false),
    evidenceUrl: text('evidence_url'),
    confidence: integer('confidence').default(50),
    /** unverified | verified | disputed | expired */
    verificationStatus: text('verification_status').default('unverified'),
    notes: text('notes'),
    metaJson: text('meta_json'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    sourceOrgIdx: index('pi_org_rels_source_idx').on(t.sourceOrgId),
    targetOrgIdx: index('pi_org_rels_target_idx').on(t.targetOrgId),
    typeIdx: index('pi_org_rels_type_idx').on(t.relationshipType),
  }),
)

// ── Brands ───────────────────────────────────────────────────
// A brand is a product-level identity, distinct from the org that owns it.
// Products reference brands; organizations represent legal/commercial entities.

export const piBrands = sqliteTable(
  'pi_brands',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    ownerOrgId: text('owner_org_id').references(() => piOrganizations.id, { onDelete: 'set null' }),
    /** Self-referencing FK for sub-brands; constraint declared in SQL migration. */
    parentBrandId: text('parent_brand_id'),
    websiteUrl: text('website_url'),
    logoUrl: text('logo_url'),
    description: text('description'),
    metaJson: text('meta_json'),
    isVerified: integer('is_verified', { mode: 'boolean' }).default(false),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    normalizedNameIdx: index('pi_brands_normalized_name_idx').on(t.normalizedName),
    ownerOrgIdx: index('pi_brands_owner_org_idx').on(t.ownerOrgId),
    parentBrandIdx: index('pi_brands_parent_idx').on(t.parentBrandId),
  }),
)

export const piBrandAliases = sqliteTable(
  'pi_brand_aliases',
  {
    id: text('id').primaryKey(),
    brandId: text('brand_id')
      .notNull()
      .references(() => piBrands.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    normalizedAlias: text('normalized_alias').notNull(),
    /** trade_name | former_name | abbreviation | regional_name | scraped_name */
    aliasType: text('alias_type').notNull().default('scraped_name'),
    confidence: integer('confidence').default(50),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    brandIdx: index('pi_brand_aliases_brand_idx').on(t.brandId),
    normalizedIdx: index('pi_brand_aliases_normalized_idx').on(t.normalizedAlias),
  }),
)

// ── Taxonomy ─────────────────────────────────────────────────
// Hierarchical product categories. Materialized `path` enables prefix
// queries; `attribute_schema_json` defines expected attributes per category.

export const piCategories = sqliteTable(
  'pi_categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    /** Self-referencing FK; constraint declared in SQL migration. */
    parentId: text('parent_id'),
    depth: integer('depth').notNull().default(0),
    /** Materialized path: 'electronics/computers/laptops' */
    path: text('path'),
    description: text('description'),
    /** JSON schema defining expected attributes for products in this category */
    attributeSchemaJson: text('attribute_schema_json'),
    metaJson: text('meta_json'),
    sortOrder: integer('sort_order').default(0),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    parentIdx: index('pi_categories_parent_idx').on(t.parentId),
    pathIdx: index('pi_categories_path_idx').on(t.path),
  }),
)

// ── Products ─────────────────────────────────────────────────
// Canonical product records. A product can exist with many fields missing.
// Vertical-specific attributes go into `attributes_json` or `pi_extracted_facts`.

export const piProducts = sqliteTable(
  'pi_products',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    normalizedTitle: text('normalized_title'),
    brandId: text('brand_id').references(() => piBrands.id, { onDelete: 'set null' }),
    manufacturerOrgId: text('manufacturer_org_id').references(() => piOrganizations.id, {
      onDelete: 'set null',
    }),
    categoryId: text('category_id').references(() => piCategories.id, { onDelete: 'set null' }),
    modelNumber: text('model_number'),
    partNumber: text('part_number'),
    description: text('description'),
    shortDescription: text('short_description'),
    /** each | pair | box | kg | liter | ft | m | roll | set | case */
    unitOfMeasure: text('unit_of_measure'),
    packSize: integer('pack_size'),
    weightValue: real('weight_value'),
    /** kg | lb | oz | g */
    weightUnit: text('weight_unit'),
    imageUrl: text('image_url'),
    productUrl: text('product_url'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    /** Flexible product attributes that vary by vertical */
    attributesJson: text('attributes_json'),
    metaJson: text('meta_json'),
    /** auto | manual_verified | needs_review | duplicate */
    matchStatus: text('match_status').default('auto'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    normalizedTitleIdx: index('pi_products_normalized_title_idx').on(t.normalizedTitle),
    brandIdx: index('pi_products_brand_idx').on(t.brandId),
    categoryIdx: index('pi_products_category_idx').on(t.categoryId),
    manufacturerIdx: index('pi_products_manufacturer_idx').on(t.manufacturerOrgId),
    modelNumberIdx: index('pi_products_model_number_idx').on(t.modelNumber),
    partNumberIdx: index('pi_products_part_number_idx').on(t.partNumber),
    activeIdx: index('pi_products_active_idx').on(t.isActive),
  }),
)

// Multi-identifier support. A product may carry UPCs, EANs, MPNs, ASINs,
// seller-specific SKUs, and arbitrary identifier schemes simultaneously.

export const piProductIdentifiers = sqliteTable(
  'pi_product_identifiers',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => piProducts.id, { onDelete: 'cascade' }),
    /** upc | ean | gtin | isbn | mpn | asin | seller_sku | internal | custom */
    identifierType: text('identifier_type').notNull(),
    identifierValue: text('identifier_value').notNull(),
    issuingOrgId: text('issuing_org_id').references(() => piOrganizations.id, {
      onDelete: 'set null',
    }),
    isPrimary: integer('is_primary', { mode: 'boolean' }).default(false),
    confidence: integer('confidence').default(50),
    sourceUrl: text('source_url'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    productTypeValueUq: uniqueIndex('pi_prod_ids_prod_type_val_uq').on(
      t.productId,
      t.identifierType,
      t.identifierValue,
    ),
    typeValueIdx: index('pi_prod_ids_type_value_idx').on(t.identifierType, t.identifierValue),
    productIdx: index('pi_prod_ids_product_idx').on(t.productId),
  }),
)

export const piProductAliases = sqliteTable(
  'pi_product_aliases',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => piProducts.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    normalizedAlias: text('normalized_alias').notNull(),
    /** scraped_title | alternate_name | former_name | regional_name | abbreviation */
    aliasType: text('alias_type').notNull().default('scraped_title'),
    sourceUrl: text('source_url'),
    confidence: integer('confidence').default(50),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    productIdx: index('pi_product_aliases_product_idx').on(t.productId),
    normalizedIdx: index('pi_product_aliases_normalized_idx').on(t.normalizedAlias),
  }),
)

// Parent/child relationships for configurable products, bundles,
// regional variants, and size/color variants.

export const piProductVariants = sqliteTable(
  'pi_product_variants',
  {
    id: text('id').primaryKey(),
    parentProductId: text('parent_product_id')
      .notNull()
      .references(() => piProducts.id, { onDelete: 'cascade' }),
    childProductId: text('child_product_id')
      .notNull()
      .references(() => piProducts.id, { onDelete: 'cascade' }),
    /** color | size | configuration | bundle | regional | voltage | material */
    variantType: text('variant_type'),
    variantLabel: text('variant_label'),
    variantValue: text('variant_value'),
    sortOrder: integer('sort_order').default(0),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    parentChildUq: uniqueIndex('pi_prod_variants_parent_child_uq').on(
      t.parentProductId,
      t.childProductId,
    ),
    parentIdx: index('pi_prod_variants_parent_idx').on(t.parentProductId),
    childIdx: index('pi_prod_variants_child_idx').on(t.childProductId),
  }),
)

// ── Projects / Catalog Imports ──────────────────────────────
// Project tables group imported catalogs and the competitor seeds used to
// expand coverage for that catalog over time.

export const piProjects = sqliteTable(
  'pi_projects',
  {
    id: text('id').primaryKey(),
    externalProjectId: text('external_project_id'),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    customerName: text('customer_name'),
    catalogSource: text('catalog_source'),
    defaultCurrency: text('default_currency').notNull().default('USD'),
    metaJson: text('meta_json'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    slugUq: uniqueIndex('pi_projects_slug_uq').on(t.slug),
    externalProjectUq: uniqueIndex('pi_projects_external_project_uq').on(t.externalProjectId),
    nameIdx: index('pi_projects_name_idx').on(t.name),
  }),
)

export const piProjectCatalogItems = sqliteTable(
  'pi_project_catalog_items',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => piProjects.id, { onDelete: 'cascade' }),
    productId: text('product_id').references(() => piProducts.id, { onDelete: 'set null' }),
    externalItemId: text('external_item_id').notNull(),
    partNumber: text('part_number').notNull(),
    manufacturerCode: text('manufacturer_code'),
    manufacturerName: text('manufacturer_name'),
    partDescription: text('part_description'),
    itemType: text('item_type'),
    quantity: integer('quantity'),
    metaJson: text('meta_json'),
    rawImportJson: text('raw_import_json'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    projectExternalItemUq: uniqueIndex('pi_project_catalog_items_proj_ext_item_uq').on(
      t.projectId,
      t.externalItemId,
    ),
    projectIdx: index('pi_project_catalog_items_project_idx').on(t.projectId),
    productIdx: index('pi_project_catalog_items_product_idx').on(t.productId),
    projectPartNumberIdx: index('pi_project_catalog_items_part_number_idx').on(
      t.projectId,
      t.partNumber,
    ),
    projectManufacturerIdx: index('pi_project_catalog_items_manufacturer_idx').on(
      t.projectId,
      t.manufacturerCode,
    ),
  }),
)

export const piProjectCompetitors = sqliteTable(
  'pi_project_competitors',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => piProjects.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => piOrganizations.id, { onDelete: 'cascade' }),
    sourceKey: text('source_key').notNull(),
    sourceLabel: text('source_label'),
    defaultTtlSeconds: integer('default_ttl_seconds').notNull().default(86_400),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    notes: text('notes'),
    metaJson: text('meta_json'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    projectSourceUq: uniqueIndex('pi_project_competitors_proj_source_uq').on(
      t.projectId,
      t.sourceKey,
    ),
    projectIdx: index('pi_project_competitors_project_idx').on(t.projectId),
    organizationIdx: index('pi_project_competitors_org_idx').on(t.organizationId),
    activeIdx: index('pi_project_competitors_active_idx').on(t.isActive),
  }),
)

export const piProjectScrapeTargets = sqliteTable(
  'pi_project_scrape_targets',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => piProjects.id, { onDelete: 'cascade' }),
    competitorId: text('competitor_id')
      .notNull()
      .references(() => piProjectCompetitors.id, { onDelete: 'cascade' }),
    catalogItemId: text('catalog_item_id').references(() => piProjectCatalogItems.id, {
      onDelete: 'set null',
    }),
    productId: text('product_id').references(() => piProducts.id, { onDelete: 'set null' }),
    targetFingerprint: text('target_fingerprint').notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    externalKey: text('external_key'),
    label: text('label'),
    seedType: text('seed_type').notNull().default('manual'),
    searchTerm: text('search_term'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    metaJson: text('meta_json'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    projectCompetitorTargetUq: uniqueIndex('pi_project_scrape_targets_proj_comp_target_uq').on(
      t.projectId,
      t.competitorId,
      t.targetFingerprint,
    ),
    projectIdx: index('pi_project_scrape_targets_project_idx').on(t.projectId),
    competitorIdx: index('pi_project_scrape_targets_competitor_idx').on(t.competitorId),
    catalogItemIdx: index('pi_project_scrape_targets_catalog_item_idx').on(t.catalogItemId),
    productIdx: index('pi_project_scrape_targets_product_idx').on(t.productId),
    fingerprintIdx: index('pi_project_scrape_targets_fingerprint_idx').on(t.targetFingerprint),
    activeIdx: index('pi_project_scrape_targets_active_idx').on(t.isActive),
  }),
)

// ── Provenance ───────────────────────────────────────────────
// Every crawled page tracked for traceability. Links observations
// back to the exact HTTP fetch that produced them.

export const piSourcePages = sqliteTable(
  'pi_source_pages',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull(),
    canonicalUrl: text('canonical_url'),
    domain: text('domain'),
    /** product_detail | product_list | search_results | category | seller_profile | pricing_page | unknown */
    pageType: text('page_type').default('unknown'),
    /** FK → scrape_runs.id; declared as FK in SQL migration (avoids circular import). */
    scrapeRunId: text('scrape_run_id'),
    fetchedAt: text('fetched_at').notNull(),
    httpStatus: integer('http_status'),
    contentHash: text('content_hash'),
    contentSizeBytes: integer('content_size_bytes'),
    /** R2 object key or external storage reference for raw HTML */
    rawStorageRef: text('raw_storage_ref'),
    extractionJson: text('extraction_json'),
    parserVersion: text('parser_version'),
    extractorVersion: text('extractor_version'),
    isSuccess: integer('is_success', { mode: 'boolean' }).default(true),
    errorMessage: text('error_message'),
    retryCount: integer('retry_count').default(0),
    metaJson: text('meta_json'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    urlIdx: index('pi_source_pages_url_idx').on(t.url),
    domainIdx: index('pi_source_pages_domain_idx').on(t.domain),
    scrapeRunIdx: index('pi_source_pages_run_idx').on(t.scrapeRunId),
    fetchedAtIdx: index('pi_source_pages_fetched_idx').on(t.fetchedAt),
    contentHashIdx: index('pi_source_pages_hash_idx').on(t.contentHash),
  }),
)

// ── Listings & Observations ──────────────────────────────────
// A listing is a seller-specific offer for a product. Observations are
// append-only snapshots of a listing's state at a point in time.
// Prices are stored in minor currency units (cents) to avoid float issues.

export const piListings = sqliteTable(
  'pi_listings',
  {
    id: text('id').primaryKey(),
    productId: text('product_id').references(() => piProducts.id, { onDelete: 'set null' }),
    sellerOrgId: text('seller_org_id')
      .notNull()
      .references(() => piOrganizations.id, { onDelete: 'cascade' }),
    sourceUrl: text('source_url').notNull(),
    sellerSku: text('seller_sku'),
    listingTitle: text('listing_title'),
    normalizedListingTitle: text('normalized_listing_title'),
    currency: text('currency').default('USD'),
    currentPriceCents: integer('current_price_cents'),
    originalPriceCents: integer('original_price_cents'),
    salePriceCents: integer('sale_price_cents'),
    minOrderQuantity: integer('min_order_quantity').default(1),
    quantityAvailable: integer('quantity_available'),
    /** in_stock | out_of_stock | backordered | preorder | discontinued | limited | unknown */
    availabilityStatus: text('availability_status').default('unknown'),
    /** new | used | refurbished | open_box | unknown */
    condition: text('condition').default('new'),
    leadTimeDays: integer('lead_time_days'),
    shippingCostCents: integer('shipping_cost_cents'),
    shippingCurrency: text('shipping_currency'),
    packSize: integer('pack_size'),
    unitOfMeasure: text('unit_of_measure'),
    marketplaceOrgId: text('marketplace_org_id').references(() => piOrganizations.id, {
      onDelete: 'set null',
    }),
    marketplaceListingId: text('marketplace_listing_id'),
    isBuyboxWinner: integer('is_buybox_winner', { mode: 'boolean' }).default(false),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    firstSeenAt: text('first_seen_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    discoverySourcePageId: text('discovery_source_page_id').references(() => piSourcePages.id, {
      onDelete: 'set null',
    }),
    metaJson: text('meta_json'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    productIdx: index('pi_listings_product_idx').on(t.productId),
    sellerIdx: index('pi_listings_seller_idx').on(t.sellerOrgId),
    sellerSkuIdx: index('pi_listings_seller_sku_idx').on(t.sellerOrgId, t.sellerSku),
    marketplaceIdx: index('pi_listings_marketplace_idx').on(t.marketplaceOrgId),
    sourceUrlIdx: index('pi_listings_source_url_idx').on(t.sourceUrl),
    activeIdx: index('pi_listings_active_idx').on(t.isActive),
    priceIdx: index('pi_listings_price_idx').on(t.productId, t.currentPriceCents),
  }),
)

// Append-only observation history. UNIQUE(listing_id, content_hash) deduplicates
// identical payloads — a new row is only created when something actually changed.

export const piListingObservations = sqliteTable(
  'pi_listing_observations',
  {
    id: text('id').primaryKey(),
    listingId: text('listing_id')
      .notNull()
      .references(() => piListings.id, { onDelete: 'cascade' }),
    /** FK → scrape_runs.id; declared in SQL migration. */
    scrapeRunId: text('scrape_run_id'),
    sourcePageId: text('source_page_id').references(() => piSourcePages.id, {
      onDelete: 'set null',
    }),
    observedAt: text('observed_at').notNull(),
    priceCents: integer('price_cents'),
    originalPriceCents: integer('original_price_cents'),
    salePriceCents: integer('sale_price_cents'),
    currency: text('currency'),
    availabilityStatus: text('availability_status'),
    quantityAvailable: integer('quantity_available'),
    leadTimeDays: integer('lead_time_days'),
    shippingCostCents: integer('shipping_cost_cents'),
    listingTitle: text('listing_title'),
    condition: text('condition'),
    isBuyboxWinner: integer('is_buybox_winner', { mode: 'boolean' }),
    sellerRating: real('seller_rating'),
    reviewCount: integer('review_count'),
    contentHash: text('content_hash').notNull(),
    rawExtractJson: text('raw_extract_json'),
    parserVersion: text('parser_version'),
    confidence: integer('confidence').default(50),
    metaJson: text('meta_json'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    listingContentUq: uniqueIndex('pi_listing_obs_listing_hash_uq').on(t.listingId, t.contentHash),
    listingObsIdx: index('pi_listing_obs_listing_observed_idx').on(t.listingId, t.observedAt),
    observedAtIdx: index('pi_listing_obs_observed_idx').on(t.observedAt),
    scrapeRunIdx: index('pi_listing_obs_run_idx').on(t.scrapeRunId),
    priceIdx: index('pi_listing_obs_price_idx').on(t.listingId, t.priceCents),
  }),
)

// ── Extracted Facts ──────────────────────────────────────────
// Flexible key-value store for scraped attributes that do not yet have a
// canonical column. Facts can be promoted to real columns once patterns
// stabilize, using `is_promoted` to mark graduated entries.

export const piExtractedFacts = sqliteTable(
  'pi_extracted_facts',
  {
    id: text('id').primaryKey(),
    /** product | organization | brand | listing | category */
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    factKey: text('fact_key').notNull(),
    factValue: text('fact_value'),
    /** string | number | boolean | date | json | url */
    factType: text('fact_type').default('string'),
    numericValue: real('numeric_value'),
    jsonValue: text('json_value'),
    sourcePageId: text('source_page_id').references(() => piSourcePages.id, {
      onDelete: 'set null',
    }),
    confidence: integer('confidence').default(50),
    extractorVersion: text('extractor_version'),
    isPromoted: integer('is_promoted', { mode: 'boolean' }).default(false),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    entityIdx: index('pi_facts_entity_idx').on(t.entityType, t.entityId),
    factKeyIdx: index('pi_facts_key_idx').on(t.entityType, t.factKey),
    sourcePageIdx: index('pi_facts_source_idx').on(t.sourcePageId),
    promotedIdx: index('pi_facts_promoted_idx').on(t.isPromoted),
  }),
)

// ── Match Candidates / Dedup Queue ───────────────────────────
// Tracks potential duplicates and product-to-listing matches for human or
// automated review. Polymorphic: entity_type selects the table pair.

export const piMatchCandidates = sqliteTable(
  'pi_match_candidates',
  {
    id: text('id').primaryKey(),
    /** product | organization | brand | listing_product (match listing → product) */
    entityType: text('entity_type').notNull(),
    sourceEntityId: text('source_entity_id').notNull(),
    targetEntityId: text('target_entity_id').notNull(),
    similarityScore: integer('similarity_score'),
    /** exact_identifier | fuzzy_title | brand_model | url_pattern | manual | ml_model */
    matchMethod: text('match_method'),
    /** pending | confirmed | rejected | merged | deferred */
    status: text('status').default('pending'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: text('reviewed_at'),
    evidenceJson: text('evidence_json'),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    entityTypeStatusIdx: index('pi_match_entity_status_idx').on(t.entityType, t.status),
    sourceEntityIdx: index('pi_match_source_idx').on(t.entityType, t.sourceEntityId),
    targetEntityIdx: index('pi_match_target_idx').on(t.entityType, t.targetEntityId),
    scoreIdx: index('pi_match_score_idx').on(t.similarityScore),
  }),
)

// ── Type Helpers ─────────────────────────────────────────────

export type PiOrganization = typeof piOrganizations.$inferSelect
export type NewPiOrganization = typeof piOrganizations.$inferInsert
export type PiOrganizationAlias = typeof piOrganizationAliases.$inferSelect
export type PiOrganizationRelationship = typeof piOrganizationRelationships.$inferSelect
export type PiBrand = typeof piBrands.$inferSelect
export type NewPiBrand = typeof piBrands.$inferInsert
export type PiBrandAlias = typeof piBrandAliases.$inferSelect
export type PiCategory = typeof piCategories.$inferSelect
export type NewPiCategory = typeof piCategories.$inferInsert
export type PiProduct = typeof piProducts.$inferSelect
export type NewPiProduct = typeof piProducts.$inferInsert
export type PiProductIdentifier = typeof piProductIdentifiers.$inferSelect
export type PiProductAlias = typeof piProductAliases.$inferSelect
export type PiProductVariant = typeof piProductVariants.$inferSelect
export type PiProject = typeof piProjects.$inferSelect
export type NewPiProject = typeof piProjects.$inferInsert
export type PiProjectCatalogItem = typeof piProjectCatalogItems.$inferSelect
export type NewPiProjectCatalogItem = typeof piProjectCatalogItems.$inferInsert
export type PiProjectCompetitor = typeof piProjectCompetitors.$inferSelect
export type NewPiProjectCompetitor = typeof piProjectCompetitors.$inferInsert
export type PiProjectScrapeTarget = typeof piProjectScrapeTargets.$inferSelect
export type NewPiProjectScrapeTarget = typeof piProjectScrapeTargets.$inferInsert
export type PiSourcePage = typeof piSourcePages.$inferSelect
export type NewPiSourcePage = typeof piSourcePages.$inferInsert
export type PiListing = typeof piListings.$inferSelect
export type NewPiListing = typeof piListings.$inferInsert
export type PiListingObservation = typeof piListingObservations.$inferSelect
export type NewPiListingObservation = typeof piListingObservations.$inferInsert
export type PiExtractedFact = typeof piExtractedFacts.$inferSelect
export type PiMatchCandidate = typeof piMatchCandidates.$inferSelect

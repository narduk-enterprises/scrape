# Price intelligence schema (implementation reference)

## B. Schema summary — what was built

### Files created/modified

| File | Action |
|------|--------|
| `apps/web/server/database/pi-schema.ts` | New — 14 tables, type exports |
| `apps/web/server/database/app-schema.ts` | Modified — enhanced `scrape_runs`, re-exports `pi-schema` |
| `apps/web/drizzle/0002_price_intelligence.sql` | New — full SQL migration |

### Table inventory (15 new tables + 1 enhanced)

| # | Table | Layer | Purpose |
|---|--------|--------|---------|
| — | `scrape_runs` (enhanced) | Pipeline | Added `run_type`, `source_domain`, `connector_key`, record counters |
| 1 | `pi_organizations` | Canonical | Every commercial actor: manufacturer, retailer, distributor, marketplace |
| 2 | `pi_organization_aliases` | Identity | Alternate names, trade names, DBAs, scraped names |
| 3 | `pi_organization_relationships` | Commerce | Commercial graph: `distributes_for`, `authorized_dealer_for`, `subsidiary_of`, etc. |
| 4 | `pi_brands` | Canonical | Product-level brand identity, linked to optional owner org |
| 5 | `pi_brand_aliases` | Identity | Brand name variants |
| 6 | `pi_categories` | Canonical | Hierarchical taxonomy with materialized paths |
| 7 | `pi_products` | Canonical | Category-agnostic canonical products |
| 8 | `pi_product_identifiers` | Identity | UPC, EAN, GTIN, ISBN, MPN, ASIN, seller SKUs, custom IDs |
| 9 | `pi_product_aliases` | Identity | Alternate product names/titles |
| 10 | `pi_product_variants` | Canonical | Parent/child for configurable products, bundles, sizes, colors |
| 11 | `pi_source_pages` | Evidence | Crawled URL provenance with HTTP status, content hash, parser version |
| 12 | `pi_listings` | Commerce | Seller-specific offers with denormalized current state |
| 13 | `pi_listing_observations` | History | Append-only price/availability time series |
| 14 | `pi_extracted_facts` | Evidence | Flexible key-value attributes for unstructured scrape data |
| 15 | `pi_match_candidates` | Evidence | Deduplication and matching review queue |

## C. Separation of concerns

The schema is organized into five clearly separated layers:

**Canonical entities** (`pi_organizations`, `pi_brands`, `pi_categories`, `pi_products`, `pi_product_variants`): Normalized, deduplicated reference data. These are the “source of truth” records that analysts query against. Foreign keys flow downward: products → brands → organizations.

**Identity / aliasing** (`pi_organization_aliases`, `pi_brand_aliases`, `pi_product_aliases`, `pi_product_identifiers`): Handle the reality that the same entity appears under many names across the web. Every alias carries a confidence score, a `normalized_*` column for matching, and a type classifier. Product identifiers are typed (`upc`, `mpn`, `asin`, etc.) and deduplicated by `(product_id, type, value)`.

**Commerce / offers** (`pi_organization_relationships`, `pi_listings`): The commercial graph and marketplace offers. Organization relationships model multi-role networks (distributor → brand, marketplace → seller, etc.) with scoping, dates, and evidence. Listings are the seller-specific representation of products with denormalized current state for fast reads.

**History / observations** (`pi_listing_observations`): Append-only time series. A new row is only created when the content actually changes (enforced by `UNIQUE(listing_id, content_hash)`). Each observation carries full provenance: scrape run, source page, parser version, raw extract, confidence.

**Evidence / intelligence** (`pi_source_pages`, `pi_extracted_facts`, `pi_match_candidates`): Provenance and deduplication infrastructure. Source pages trace every fact to a specific HTTP fetch. Extracted facts capture unstructured attributes that have not been promoted to canonical columns yet. Match candidates manage the dedup review workflow.

## D. Matching and normalization strategy

### Duplicate organizations

- **On ingest:** Normalize the org name (lowercase, strip legal suffixes like “Inc.”, “LLC”, “GmbH”, trim whitespace). Check `pi_organizations.normalized_name` and `pi_organization_aliases.normalized_alias` for exact match.
- **Fuzzy:** If no exact match, check domain overlap or Levenshtein distance. Insert a `pi_match_candidates` row with `entity_type = 'organization'` and the similarity score.
- **Resolution:** Confirmed matches merge into the canonical org. The losing org becomes an alias row. Rejected matches are marked so the same pair is not re-proposed.

### Duplicate products

- **Identifier match:** If an incoming record carries a known identifier (UPC, MPN, ASIN), look it up in `pi_product_identifiers`. An exact match on `(identifier_type, identifier_value)` links directly to the canonical product.
- **Title + brand match:** Normalize the product title. Look up `pi_products.normalized_title` filtered by `brand_id`. If the normalized titles are close, create a match candidate.
- **Model number match:** If `model_number` or `part_number` matches exactly on the same brand, it is a very high-confidence match.
- **Confidence scoring:** Each match candidate gets a `similarity_score` (0–100) and a `match_method` tag explaining how it was found. Scores above a tunable threshold are auto-confirmed; below that threshold they go to manual review.

### Listing-to-product matching

This is the `entity_type = 'listing_product'` match type. When a new listing is created and `product_id` is null, the system:

1. Extracts identifiers from the listing (seller SKU, ASIN, UPC from the page)
2. Normalizes the listing title
3. Searches `pi_product_identifiers` and `pi_products.normalized_title`
4. Creates a match candidate if a plausible link is found
5. Auto-links if confidence is high enough; otherwise queues for review

### Manual review states

The `pi_match_candidates.status` field tracks the workflow:

| Status | Meaning |
|--------|---------|
| `pending` | Awaiting review |
| `confirmed` | Approved, entities linked or merged |
| `rejected` | Not a match, will not be re-proposed |
| `merged` | Entities were actually merged (one was deleted) |
| `deferred` | Insufficient evidence, revisit later |

## E. Query examples

All examples use Drizzle ORM syntax targeting the D1/SQLite backend.

### Latest lowest price for a product

```ts
const lowestPrice = await db
  .select({
    productId: piListings.productId,
    minPrice: sql<number>`MIN(${piListings.currentPriceCents})`,
    currency: piListings.currency,
    sellerName: piOrganizations.name,
    sourceUrl: piListings.sourceUrl,
  })
  .from(piListings)
  .innerJoin(piOrganizations, eq(piOrganizations.id, piListings.sellerOrgId))
  .where(
    and(
      eq(piListings.productId, productId),
      eq(piListings.isActive, true),
      eq(piListings.availabilityStatus, 'in_stock'),
    ),
  )
  .orderBy(asc(piListings.currentPriceCents))
  .limit(1)
```

### Full price history for a product across all sellers

```ts
const priceHistory = await db
  .select({
    observedAt: piListingObservations.observedAt,
    priceCents: piListingObservations.priceCents,
    currency: piListingObservations.currency,
    sellerName: piOrganizations.name,
    listingUrl: piListings.sourceUrl,
  })
  .from(piListingObservations)
  .innerJoin(piListings, eq(piListings.id, piListingObservations.listingId))
  .innerJoin(piOrganizations, eq(piOrganizations.id, piListings.sellerOrgId))
  .where(eq(piListings.productId, productId))
  .orderBy(asc(piListingObservations.observedAt))
```

### All sellers carrying a product

```ts
const sellers = await db
  .select({
    orgId: piOrganizations.id,
    orgName: piOrganizations.name,
    orgType: piOrganizations.orgType,
    listingCount: sql<number>`COUNT(${piListings.id})`,
    minPrice: sql<number>`MIN(${piListings.currentPriceCents})`,
    maxPrice: sql<number>`MAX(${piListings.currentPriceCents})`,
  })
  .from(piListings)
  .innerJoin(piOrganizations, eq(piOrganizations.id, piListings.sellerOrgId))
  .where(and(eq(piListings.productId, productId), eq(piListings.isActive, true)))
  .groupBy(piOrganizations.id)
  .orderBy(asc(sql`MIN(${piListings.currentPriceCents})`))
```

### All products sold by an organization

```ts
const products = await db
  .select({
    productId: piProducts.id,
    title: piProducts.title,
    brandName: piBrands.name,
    currentPrice: piListings.currentPriceCents,
    currency: piListings.currency,
    availability: piListings.availabilityStatus,
  })
  .from(piListings)
  .innerJoin(piProducts, eq(piProducts.id, piListings.productId))
  .leftJoin(piBrands, eq(piBrands.id, piProducts.brandId))
  .where(and(eq(piListings.sellerOrgId, orgId), eq(piListings.isActive, true)))
  .orderBy(asc(piProducts.title))
```

### All observed identifiers for a product

```ts
const identifiers = await db
  .select({
    type: piProductIdentifiers.identifierType,
    value: piProductIdentifiers.identifierValue,
    isPrimary: piProductIdentifiers.isPrimary,
    confidence: piProductIdentifiers.confidence,
    issuingOrg: piOrganizations.name,
  })
  .from(piProductIdentifiers)
  .leftJoin(piOrganizations, eq(piOrganizations.id, piProductIdentifiers.issuingOrgId))
  .where(eq(piProductIdentifiers.productId, productId))
  .orderBy(desc(piProductIdentifiers.isPrimary), asc(piProductIdentifiers.identifierType))
```

### Channel graph for a brand

```ts
const channelGraph = await db
  .select({
    sourceOrg: sql<string>`s.name`,
    relationship: piOrganizationRelationships.relationshipType,
    targetOrg: sql<string>`t.name`,
    scope: piOrganizationRelationships.scope,
    region: piOrganizationRelationships.region,
    verified: piOrganizationRelationships.verificationStatus,
  })
  .from(piOrganizationRelationships)
  .innerJoin(sql`pi_organizations s`, sql`s.id = ${piOrganizationRelationships.sourceOrgId}`)
  .innerJoin(sql`pi_organizations t`, sql`t.id = ${piOrganizationRelationships.targetOrgId}`)
  .innerJoin(piBrands, eq(piBrands.ownerOrgId, piOrganizationRelationships.targetOrgId))
  .where(eq(piBrands.id, brandId))
```

### Unresolved duplicate candidates

```ts
const pendingMatches = await db
  .select()
  .from(piMatchCandidates)
  .where(
    and(
      eq(piMatchCandidates.status, 'pending'),
      eq(piMatchCandidates.entityType, 'product'),
    ),
  )
  .orderBy(desc(piMatchCandidates.similarityScore))
  .limit(50)
```

### Observations from a suspicious parser version

```ts
const suspiciousObs = await db
  .select({
    obsId: piListingObservations.id,
    listingId: piListingObservations.listingId,
    observedAt: piListingObservations.observedAt,
    priceCents: piListingObservations.priceCents,
    parserVersion: piListingObservations.parserVersion,
    rawExtract: piListingObservations.rawExtractJson,
  })
  .from(piListingObservations)
  .where(eq(piListingObservations.parserVersion, suspectVersion))
  .orderBy(desc(piListingObservations.observedAt))
  .limit(100)
```

## F. Migration / rollout plan

### Phase 1 — minimum viable (this migration)

Everything in `0002_price_intelligence.sql` is Phase 1. Apply with:

```bash
pnpm --filter web run db:migrate
```

This gives you:

- Full canonical entity model (orgs, brands, categories, products)
- Multi-identifier and alias support
- Organization relationship graph
- Listings with denormalized current state
- Append-only observation history
- Source page provenance
- Extracted facts for unstructured data
- Match candidate queue for dedup
- Enhanced scrape run tracking

The existing `scrape_*` pipeline tables continue to work unchanged. The new `pi_*` tables sit alongside them. Scraping pipelines can be updated incrementally to write to both layers.

### Phase 2 — next enhancements (future migrations)

| Enhancement | Rationale |
|-------------|-----------|
| FTS5 virtual tables for product title search | Enables fast fuzzy product lookup. `CREATE VIRTUAL TABLE pi_products_fts USING fts5(title, normalized_title, content=pi_products)` |
| Price alert thresholds table | User-defined alerts when a product’s price crosses a threshold |
| Scrape schedules table | Replaces TTL-based polling with explicit per-listing or per-product schedules |
| Data quality scores on canonical entities | Composite quality metric based on completeness, freshness, source diversity |
| Product comparison groups | Named sets of products for competitive analysis dashboards |
| Currency exchange rate snapshots | Enables cross-currency price comparison normalization |

### Phase 3 — advanced features (optional)

| Feature | Notes |
|---------|--------|
| ML-based matching pipeline | Feed match candidates into a classification model; write results back as `match_method = 'ml_model'` |
| Price elasticity / trend analytics views | Materialized via application code or scheduled workers, not SQLite views (D1 does not support persistent views well) |
| Multi-region partitioning | If data volume exceeds D1 per-database limits, shard by region or product category across multiple D1 databases |
| Event-driven observation ingestion | Cloudflare Queue → Worker → D1 for high-throughput observation writes |
| Graph visualization API | Expose `pi_organization_relationships` as a graph API for channel mapping UIs |

### Assumptions made

- **UUIDs for primary keys** — consistent with existing layer and app patterns. Generated at the application layer.
- **ISO 8601 text timestamps** — consistent with all existing tables. D1 does not have a native timestamp type.
- **Prices in minor currency units (cents)** — `INTEGER` columns avoid float precision issues. The currency field (ISO 4217) tells consumers how to interpret the value.
- **No soft deletes** — consistent with existing patterns. `is_active` flags on products and listings serve as the visible/hidden mechanism. Historical observations are never deleted.
- **Self-referencing FKs declared in SQL only** — `pi_brands.parent_brand_id` and `pi_categories.parent_id` use self-referencing `REFERENCES` in the migration SQL. The Drizzle schema declares them as plain text columns to avoid circular import complications. The FK constraint is enforced at the database level.
- **Cross-file FK for `scrape_run_id`** — `pi_source_pages.scrape_run_id` and `pi_listing_observations.scrape_run_id` reference `scrape_runs.id`. The FK is declared in SQL but not as a Drizzle `.references()` to avoid circular imports between `app-schema.ts` and `pi-schema.ts`.

## Summary of deliverables

All six required outputs are complete:

| | Deliverable |
|---|-------------|
| A | Data model proposal — five-layer architecture (canonical, identity, commerce, history, evidence) designed to be category-agnostic across any vertical. |
| B | Concrete schema — 14 new Drizzle tables in `pi-schema.ts`, 1 enhanced existing table in `app-schema.ts`, full SQL migration in `0002_price_intelligence.sql`. All tables have PKs, FKs, indexes, and follow existing D1/SQLite patterns. |
| C | Separation of concerns — canonical entities, raw pipeline tables, offers, observations, and provenance are in distinct table groups with clear boundaries. |
| D | Matching strategy — identifier-first matching, normalized title fallback, fuzzy scoring, and a `pi_match_candidates` review queue with five resolution states. |
| E | Query examples — eight Drizzle ORM query patterns covering price comparison, history, seller analysis, identifier lookup, channel graph, dedup review, and parser audit. |
| F | Rollout plan — three phases from MVP (this migration) through FTS/alerts/schedules to ML matching and event-driven ingestion. |

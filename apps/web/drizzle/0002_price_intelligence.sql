-- Price Intelligence: generic, category-agnostic schema for multi-vertical
-- price scraping and analytics.
--
-- Layers:
--   Canonical  — organizations, brands, categories, products
--   Identity   — aliases, identifiers
--   Commerce   — org relationships, listings
--   History    — listing observations (append-only)
--   Evidence   — source pages, extracted facts, match candidates

-- ── Enhance scrape_runs with pipeline statistics ─────────────

ALTER TABLE scrape_runs ADD COLUMN run_type TEXT;
ALTER TABLE scrape_runs ADD COLUMN source_domain TEXT;
ALTER TABLE scrape_runs ADD COLUMN connector_key TEXT;
ALTER TABLE scrape_runs ADD COLUMN records_created INTEGER;
ALTER TABLE scrape_runs ADD COLUMN records_updated INTEGER;
ALTER TABLE scrape_runs ADD COLUMN records_skipped INTEGER;
ALTER TABLE scrape_runs ADD COLUMN parse_error_count INTEGER;

CREATE INDEX scrape_runs_domain_idx ON scrape_runs (source_domain);
CREATE INDEX scrape_runs_connector_idx ON scrape_runs (connector_key);

-- ── Organizations ────────────────────────────────────────────

CREATE TABLE pi_organizations (
  id                TEXT PRIMARY KEY NOT NULL,
  name              TEXT NOT NULL,
  normalized_name   TEXT,
  domain            TEXT,
  org_type          TEXT NOT NULL DEFAULT 'unknown',
  country           TEXT,
  region            TEXT,
  website_url       TEXT,
  logo_url          TEXT,
  description       TEXT,
  meta_json         TEXT,
  is_verified       INTEGER DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX pi_orgs_normalized_name_idx ON pi_organizations (normalized_name);
CREATE INDEX pi_orgs_domain_idx ON pi_organizations (domain);
CREATE INDEX pi_orgs_type_idx ON pi_organizations (org_type);

CREATE TABLE pi_organization_aliases (
  id                TEXT PRIMARY KEY NOT NULL,
  org_id            TEXT NOT NULL REFERENCES pi_organizations (id) ON DELETE CASCADE,
  alias             TEXT NOT NULL,
  normalized_alias  TEXT NOT NULL,
  alias_type        TEXT NOT NULL DEFAULT 'scraped_name',
  source_url        TEXT,
  confidence        INTEGER DEFAULT 50,
  created_at        TEXT NOT NULL
);

CREATE INDEX pi_org_aliases_org_idx ON pi_organization_aliases (org_id);
CREATE INDEX pi_org_aliases_normalized_idx ON pi_organization_aliases (normalized_alias);

CREATE TABLE pi_organization_relationships (
  id                    TEXT PRIMARY KEY NOT NULL,
  source_org_id         TEXT NOT NULL REFERENCES pi_organizations (id) ON DELETE CASCADE,
  target_org_id         TEXT NOT NULL REFERENCES pi_organizations (id) ON DELETE CASCADE,
  relationship_type     TEXT NOT NULL,
  scope                 TEXT,
  region                TEXT,
  effective_from        TEXT,
  effective_until       TEXT,
  is_exclusive          INTEGER DEFAULT 0,
  evidence_url          TEXT,
  confidence            INTEGER DEFAULT 50,
  verification_status   TEXT DEFAULT 'unverified',
  notes                 TEXT,
  meta_json             TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX pi_org_rels_source_idx ON pi_organization_relationships (source_org_id);
CREATE INDEX pi_org_rels_target_idx ON pi_organization_relationships (target_org_id);
CREATE INDEX pi_org_rels_type_idx ON pi_organization_relationships (relationship_type);

-- ── Brands ───────────────────────────────────────────────────

CREATE TABLE pi_brands (
  id                TEXT PRIMARY KEY NOT NULL,
  name              TEXT NOT NULL,
  normalized_name   TEXT NOT NULL,
  owner_org_id      TEXT REFERENCES pi_organizations (id) ON DELETE SET NULL,
  parent_brand_id   TEXT REFERENCES pi_brands (id) ON DELETE SET NULL,
  website_url       TEXT,
  logo_url          TEXT,
  description       TEXT,
  meta_json         TEXT,
  is_verified       INTEGER DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX pi_brands_normalized_name_idx ON pi_brands (normalized_name);
CREATE INDEX pi_brands_owner_org_idx ON pi_brands (owner_org_id);
CREATE INDEX pi_brands_parent_idx ON pi_brands (parent_brand_id);

CREATE TABLE pi_brand_aliases (
  id                TEXT PRIMARY KEY NOT NULL,
  brand_id          TEXT NOT NULL REFERENCES pi_brands (id) ON DELETE CASCADE,
  alias             TEXT NOT NULL,
  normalized_alias  TEXT NOT NULL,
  alias_type        TEXT NOT NULL DEFAULT 'scraped_name',
  confidence        INTEGER DEFAULT 50,
  created_at        TEXT NOT NULL
);

CREATE INDEX pi_brand_aliases_brand_idx ON pi_brand_aliases (brand_id);
CREATE INDEX pi_brand_aliases_normalized_idx ON pi_brand_aliases (normalized_alias);

-- ── Taxonomy ─────────────────────────────────────────────────

CREATE TABLE pi_categories (
  id                      TEXT PRIMARY KEY NOT NULL,
  name                    TEXT NOT NULL,
  slug                    TEXT NOT NULL UNIQUE,
  parent_id               TEXT REFERENCES pi_categories (id) ON DELETE SET NULL,
  depth                   INTEGER NOT NULL DEFAULT 0,
  path                    TEXT,
  description             TEXT,
  attribute_schema_json   TEXT,
  meta_json               TEXT,
  sort_order              INTEGER DEFAULT 0,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

CREATE INDEX pi_categories_parent_idx ON pi_categories (parent_id);
CREATE INDEX pi_categories_path_idx ON pi_categories (path);

-- ── Products ─────────────────────────────────────────────────

CREATE TABLE pi_products (
  id                    TEXT PRIMARY KEY NOT NULL,
  title                 TEXT NOT NULL,
  normalized_title      TEXT,
  brand_id              TEXT REFERENCES pi_brands (id) ON DELETE SET NULL,
  manufacturer_org_id   TEXT REFERENCES pi_organizations (id) ON DELETE SET NULL,
  category_id           TEXT REFERENCES pi_categories (id) ON DELETE SET NULL,
  model_number          TEXT,
  part_number           TEXT,
  description           TEXT,
  short_description     TEXT,
  unit_of_measure       TEXT,
  pack_size             INTEGER,
  weight_value          REAL,
  weight_unit           TEXT,
  image_url             TEXT,
  product_url           TEXT,
  is_active             INTEGER DEFAULT 1,
  attributes_json       TEXT,
  meta_json             TEXT,
  match_status          TEXT DEFAULT 'auto',
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX pi_products_normalized_title_idx ON pi_products (normalized_title);
CREATE INDEX pi_products_brand_idx ON pi_products (brand_id);
CREATE INDEX pi_products_category_idx ON pi_products (category_id);
CREATE INDEX pi_products_manufacturer_idx ON pi_products (manufacturer_org_id);
CREATE INDEX pi_products_model_number_idx ON pi_products (model_number);
CREATE INDEX pi_products_part_number_idx ON pi_products (part_number);
CREATE INDEX pi_products_active_idx ON pi_products (is_active);

CREATE TABLE pi_product_identifiers (
  id                TEXT PRIMARY KEY NOT NULL,
  product_id        TEXT NOT NULL REFERENCES pi_products (id) ON DELETE CASCADE,
  identifier_type   TEXT NOT NULL,
  identifier_value  TEXT NOT NULL,
  issuing_org_id    TEXT REFERENCES pi_organizations (id) ON DELETE SET NULL,
  is_primary        INTEGER DEFAULT 0,
  confidence        INTEGER DEFAULT 50,
  source_url        TEXT,
  created_at        TEXT NOT NULL
);

CREATE UNIQUE INDEX pi_prod_ids_prod_type_val_uq ON pi_product_identifiers (product_id, identifier_type, identifier_value);
CREATE INDEX pi_prod_ids_type_value_idx ON pi_product_identifiers (identifier_type, identifier_value);
CREATE INDEX pi_prod_ids_product_idx ON pi_product_identifiers (product_id);

CREATE TABLE pi_product_aliases (
  id                TEXT PRIMARY KEY NOT NULL,
  product_id        TEXT NOT NULL REFERENCES pi_products (id) ON DELETE CASCADE,
  alias             TEXT NOT NULL,
  normalized_alias  TEXT NOT NULL,
  alias_type        TEXT NOT NULL DEFAULT 'scraped_title',
  source_url        TEXT,
  confidence        INTEGER DEFAULT 50,
  created_at        TEXT NOT NULL
);

CREATE INDEX pi_product_aliases_product_idx ON pi_product_aliases (product_id);
CREATE INDEX pi_product_aliases_normalized_idx ON pi_product_aliases (normalized_alias);

CREATE TABLE pi_product_variants (
  id                  TEXT PRIMARY KEY NOT NULL,
  parent_product_id   TEXT NOT NULL REFERENCES pi_products (id) ON DELETE CASCADE,
  child_product_id    TEXT NOT NULL REFERENCES pi_products (id) ON DELETE CASCADE,
  variant_type        TEXT,
  variant_label       TEXT,
  variant_value       TEXT,
  sort_order          INTEGER DEFAULT 0,
  created_at          TEXT NOT NULL
);

CREATE UNIQUE INDEX pi_prod_variants_parent_child_uq ON pi_product_variants (parent_product_id, child_product_id);
CREATE INDEX pi_prod_variants_parent_idx ON pi_product_variants (parent_product_id);
CREATE INDEX pi_prod_variants_child_idx ON pi_product_variants (child_product_id);

-- ── Provenance ───────────────────────────────────────────────

CREATE TABLE pi_source_pages (
  id                  TEXT PRIMARY KEY NOT NULL,
  url                 TEXT NOT NULL,
  canonical_url       TEXT,
  domain              TEXT,
  page_type           TEXT DEFAULT 'unknown',
  scrape_run_id       TEXT REFERENCES scrape_runs (id) ON DELETE SET NULL,
  fetched_at          TEXT NOT NULL,
  http_status         INTEGER,
  content_hash        TEXT,
  content_size_bytes  INTEGER,
  raw_storage_ref     TEXT,
  extraction_json     TEXT,
  parser_version      TEXT,
  extractor_version   TEXT,
  is_success          INTEGER DEFAULT 1,
  error_message       TEXT,
  retry_count         INTEGER DEFAULT 0,
  meta_json           TEXT,
  created_at          TEXT NOT NULL
);

CREATE INDEX pi_source_pages_url_idx ON pi_source_pages (url);
CREATE INDEX pi_source_pages_domain_idx ON pi_source_pages (domain);
CREATE INDEX pi_source_pages_run_idx ON pi_source_pages (scrape_run_id);
CREATE INDEX pi_source_pages_fetched_idx ON pi_source_pages (fetched_at);
CREATE INDEX pi_source_pages_hash_idx ON pi_source_pages (content_hash);

-- ── Listings ─────────────────────────────────────────────────

CREATE TABLE pi_listings (
  id                          TEXT PRIMARY KEY NOT NULL,
  product_id                  TEXT REFERENCES pi_products (id) ON DELETE SET NULL,
  seller_org_id               TEXT NOT NULL REFERENCES pi_organizations (id) ON DELETE CASCADE,
  source_url                  TEXT NOT NULL,
  seller_sku                  TEXT,
  listing_title               TEXT,
  normalized_listing_title    TEXT,
  currency                    TEXT DEFAULT 'USD',
  current_price_cents         INTEGER,
  original_price_cents        INTEGER,
  sale_price_cents            INTEGER,
  min_order_quantity          INTEGER DEFAULT 1,
  quantity_available          INTEGER,
  availability_status         TEXT DEFAULT 'unknown',
  condition                   TEXT DEFAULT 'new',
  lead_time_days              INTEGER,
  shipping_cost_cents         INTEGER,
  shipping_currency           TEXT,
  pack_size                   INTEGER,
  unit_of_measure             TEXT,
  marketplace_org_id          TEXT REFERENCES pi_organizations (id) ON DELETE SET NULL,
  marketplace_listing_id      TEXT,
  is_buybox_winner            INTEGER DEFAULT 0,
  is_active                   INTEGER DEFAULT 1,
  first_seen_at               TEXT NOT NULL,
  last_seen_at                TEXT NOT NULL,
  discovery_source_page_id    TEXT REFERENCES pi_source_pages (id) ON DELETE SET NULL,
  meta_json                   TEXT,
  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL
);

CREATE INDEX pi_listings_product_idx ON pi_listings (product_id);
CREATE INDEX pi_listings_seller_idx ON pi_listings (seller_org_id);
CREATE INDEX pi_listings_seller_sku_idx ON pi_listings (seller_org_id, seller_sku);
CREATE INDEX pi_listings_marketplace_idx ON pi_listings (marketplace_org_id);
CREATE INDEX pi_listings_source_url_idx ON pi_listings (source_url);
CREATE INDEX pi_listings_active_idx ON pi_listings (is_active);
CREATE INDEX pi_listings_price_idx ON pi_listings (product_id, current_price_cents);

-- ── Listing Observations ─────────────────────────────────────

CREATE TABLE pi_listing_observations (
  id                    TEXT PRIMARY KEY NOT NULL,
  listing_id            TEXT NOT NULL REFERENCES pi_listings (id) ON DELETE CASCADE,
  scrape_run_id         TEXT REFERENCES scrape_runs (id) ON DELETE SET NULL,
  source_page_id        TEXT REFERENCES pi_source_pages (id) ON DELETE SET NULL,
  observed_at           TEXT NOT NULL,
  price_cents           INTEGER,
  original_price_cents  INTEGER,
  sale_price_cents      INTEGER,
  currency              TEXT,
  availability_status   TEXT,
  quantity_available    INTEGER,
  lead_time_days        INTEGER,
  shipping_cost_cents   INTEGER,
  listing_title         TEXT,
  condition             TEXT,
  is_buybox_winner      INTEGER,
  seller_rating         REAL,
  review_count          INTEGER,
  content_hash          TEXT NOT NULL,
  raw_extract_json      TEXT,
  parser_version        TEXT,
  confidence            INTEGER DEFAULT 50,
  meta_json             TEXT,
  created_at            TEXT NOT NULL
);

CREATE UNIQUE INDEX pi_listing_obs_listing_hash_uq ON pi_listing_observations (listing_id, content_hash);
CREATE INDEX pi_listing_obs_listing_observed_idx ON pi_listing_observations (listing_id, observed_at);
CREATE INDEX pi_listing_obs_observed_idx ON pi_listing_observations (observed_at);
CREATE INDEX pi_listing_obs_run_idx ON pi_listing_observations (scrape_run_id);
CREATE INDEX pi_listing_obs_price_idx ON pi_listing_observations (listing_id, price_cents);

-- ── Extracted Facts ──────────────────────────────────────────

CREATE TABLE pi_extracted_facts (
  id                TEXT PRIMARY KEY NOT NULL,
  entity_type       TEXT NOT NULL,
  entity_id         TEXT NOT NULL,
  fact_key          TEXT NOT NULL,
  fact_value        TEXT,
  fact_type         TEXT DEFAULT 'string',
  numeric_value     REAL,
  json_value        TEXT,
  source_page_id    TEXT REFERENCES pi_source_pages (id) ON DELETE SET NULL,
  confidence        INTEGER DEFAULT 50,
  extractor_version TEXT,
  is_promoted       INTEGER DEFAULT 0,
  created_at        TEXT NOT NULL
);

CREATE INDEX pi_facts_entity_idx ON pi_extracted_facts (entity_type, entity_id);
CREATE INDEX pi_facts_key_idx ON pi_extracted_facts (entity_type, fact_key);
CREATE INDEX pi_facts_source_idx ON pi_extracted_facts (source_page_id);
CREATE INDEX pi_facts_promoted_idx ON pi_extracted_facts (is_promoted);

-- ── Match Candidates ─────────────────────────────────────────

CREATE TABLE pi_match_candidates (
  id                TEXT PRIMARY KEY NOT NULL,
  entity_type       TEXT NOT NULL,
  source_entity_id  TEXT NOT NULL,
  target_entity_id  TEXT NOT NULL,
  similarity_score  INTEGER,
  match_method      TEXT,
  status            TEXT DEFAULT 'pending',
  reviewed_by       TEXT,
  reviewed_at       TEXT,
  evidence_json     TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX pi_match_entity_status_idx ON pi_match_candidates (entity_type, status);
CREATE INDEX pi_match_source_idx ON pi_match_candidates (entity_type, source_entity_id);
CREATE INDEX pi_match_target_idx ON pi_match_candidates (entity_type, target_entity_id);
CREATE INDEX pi_match_score_idx ON pi_match_candidates (similarity_score);

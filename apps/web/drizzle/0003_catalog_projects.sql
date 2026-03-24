-- Project-scoped catalog imports and competitor scrape seeds.

CREATE TABLE pi_projects (
  id                   TEXT PRIMARY KEY NOT NULL,
  external_project_id  TEXT,
  slug                 TEXT NOT NULL,
  name                 TEXT NOT NULL,
  description          TEXT,
  customer_name        TEXT,
  catalog_source       TEXT,
  default_currency     TEXT NOT NULL DEFAULT 'USD',
  meta_json            TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE UNIQUE INDEX pi_projects_slug_uq ON pi_projects (slug);
CREATE UNIQUE INDEX pi_projects_external_project_uq ON pi_projects (external_project_id);
CREATE INDEX pi_projects_name_idx ON pi_projects (name);

CREATE TABLE pi_project_catalog_items (
  id                 TEXT PRIMARY KEY NOT NULL,
  project_id         TEXT NOT NULL REFERENCES pi_projects (id) ON DELETE CASCADE,
  product_id         TEXT REFERENCES pi_products (id) ON DELETE SET NULL,
  external_item_id   TEXT NOT NULL,
  part_number        TEXT NOT NULL,
  manufacturer_code  TEXT,
  manufacturer_name  TEXT,
  part_description   TEXT,
  item_type          TEXT,
  quantity           INTEGER,
  meta_json          TEXT,
  raw_import_json    TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE UNIQUE INDEX pi_project_catalog_items_proj_ext_item_uq
  ON pi_project_catalog_items (project_id, external_item_id);
CREATE INDEX pi_project_catalog_items_project_idx ON pi_project_catalog_items (project_id);
CREATE INDEX pi_project_catalog_items_product_idx ON pi_project_catalog_items (product_id);
CREATE INDEX pi_project_catalog_items_part_number_idx
  ON pi_project_catalog_items (project_id, part_number);
CREATE INDEX pi_project_catalog_items_manufacturer_idx
  ON pi_project_catalog_items (project_id, manufacturer_code);

CREATE TABLE pi_project_competitors (
  id                   TEXT PRIMARY KEY NOT NULL,
  project_id           TEXT NOT NULL REFERENCES pi_projects (id) ON DELETE CASCADE,
  organization_id      TEXT NOT NULL REFERENCES pi_organizations (id) ON DELETE CASCADE,
  source_key           TEXT NOT NULL,
  source_label         TEXT,
  default_ttl_seconds  INTEGER NOT NULL DEFAULT 86400,
  is_active            INTEGER DEFAULT 1,
  notes                TEXT,
  meta_json            TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE UNIQUE INDEX pi_project_competitors_proj_source_uq
  ON pi_project_competitors (project_id, source_key);
CREATE INDEX pi_project_competitors_project_idx ON pi_project_competitors (project_id);
CREATE INDEX pi_project_competitors_org_idx ON pi_project_competitors (organization_id);
CREATE INDEX pi_project_competitors_active_idx ON pi_project_competitors (is_active);

CREATE TABLE pi_project_scrape_targets (
  id                  TEXT PRIMARY KEY NOT NULL,
  project_id          TEXT NOT NULL REFERENCES pi_projects (id) ON DELETE CASCADE,
  competitor_id       TEXT NOT NULL REFERENCES pi_project_competitors (id) ON DELETE CASCADE,
  catalog_item_id     TEXT REFERENCES pi_project_catalog_items (id) ON DELETE SET NULL,
  product_id          TEXT REFERENCES pi_products (id) ON DELETE SET NULL,
  target_fingerprint  TEXT NOT NULL,
  normalized_url      TEXT NOT NULL,
  external_key        TEXT,
  label               TEXT,
  seed_type           TEXT NOT NULL DEFAULT 'manual',
  search_term         TEXT,
  is_active           INTEGER DEFAULT 1,
  meta_json           TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE UNIQUE INDEX pi_project_scrape_targets_proj_comp_target_uq
  ON pi_project_scrape_targets (project_id, competitor_id, target_fingerprint);
CREATE INDEX pi_project_scrape_targets_project_idx ON pi_project_scrape_targets (project_id);
CREATE INDEX pi_project_scrape_targets_competitor_idx ON pi_project_scrape_targets (competitor_id);
CREATE INDEX pi_project_scrape_targets_catalog_item_idx ON pi_project_scrape_targets (catalog_item_id);
CREATE INDEX pi_project_scrape_targets_product_idx ON pi_project_scrape_targets (product_id);
CREATE INDEX pi_project_scrape_targets_fingerprint_idx
  ON pi_project_scrape_targets (target_fingerprint);
CREATE INDEX pi_project_scrape_targets_active_idx ON pi_project_scrape_targets (is_active);

-- Texas Comptroller / Open Data — append-only staging loads

CREATE TABLE stg_payments_to_payee_raw (
  id                    TEXT PRIMARY KEY NOT NULL,
  agency_name           TEXT,
  payee_name            TEXT,
  payment_date          TEXT,
  payment_date_iso      TEXT,
  amount                TEXT,
  amount_numeric        REAL,
  object_category       TEXT,
  comptroller_object    TEXT,
  appropriation_number  TEXT,
  appropriation_year    TEXT,
  fund                  TEXT,
  is_confidential       INTEGER,
  raw_json              TEXT NOT NULL,
  source_file_name      TEXT NOT NULL,
  source_url            TEXT NOT NULL,
  source_loaded_at      TEXT NOT NULL,
  source_snapshot_date  TEXT NOT NULL,
  row_number            INTEGER NOT NULL
);

CREATE INDEX stg_payments_snap_idx ON stg_payments_to_payee_raw (source_snapshot_date);

CREATE TABLE stg_expenditures_by_county_raw (
  id                       TEXT PRIMARY KEY NOT NULL,
  fiscal_year              INTEGER,
  county_name              TEXT,
  county_name_normalized   TEXT,
  agency_name              TEXT,
  agency_number            TEXT,
  expenditure_type       TEXT,
  amount                   TEXT,
  amount_numeric           REAL,
  raw_json                 TEXT NOT NULL,
  source_file_name         TEXT NOT NULL,
  source_url               TEXT NOT NULL,
  source_loaded_at         TEXT NOT NULL,
  source_snapshot_date     TEXT NOT NULL,
  row_number               INTEGER NOT NULL
);

CREATE INDEX stg_county_fy_idx ON stg_expenditures_by_county_raw (fiscal_year);

CREATE TABLE stg_comptroller_objects_raw (
  id                     TEXT PRIMARY KEY NOT NULL,
  object_code            TEXT,
  title                  TEXT,
  object_group           TEXT,
  raw_json               TEXT NOT NULL,
  source_file_name       TEXT NOT NULL,
  source_url             TEXT NOT NULL,
  source_loaded_at       TEXT NOT NULL,
  source_snapshot_date   TEXT NOT NULL,
  row_number             INTEGER NOT NULL
);

CREATE TABLE stg_expenditure_categories_raw (
  id                     TEXT PRIMARY KEY NOT NULL,
  category_code          TEXT,
  category_title         TEXT,
  raw_json               TEXT NOT NULL,
  source_file_name       TEXT NOT NULL,
  source_url             TEXT NOT NULL,
  source_loaded_at       TEXT NOT NULL,
  source_snapshot_date   TEXT NOT NULL,
  row_number             INTEGER NOT NULL
);

CREATE TABLE stg_vendor_master_raw (
  id                     TEXT PRIMARY KEY NOT NULL,
  web_vendor_name        TEXT,
  web_vid                TEXT,
  web_vendor_no          TEXT,
  web_city               TEXT,
  web_county             TEXT,
  web_state              TEXT,
  web_zip                TEXT,
  web_hub_status         TEXT,
  web_small_bus_flag     TEXT,
  web_desc               TEXT,
  raw_json               TEXT NOT NULL,
  source_file_name       TEXT NOT NULL,
  source_url             TEXT NOT NULL,
  source_loaded_at       TEXT NOT NULL,
  source_snapshot_date   TEXT NOT NULL,
  row_number             INTEGER NOT NULL
);

CREATE TABLE stg_annual_cash_report_raw (
  id                     TEXT PRIMARY KEY NOT NULL,
  report_fiscal_year     INTEGER,
  sheet_name             TEXT,
  fund_number            TEXT,
  line_label             TEXT,
  amount_raw             TEXT,
  amount_numeric         REAL,
  raw_json               TEXT NOT NULL,
  source_file_name       TEXT NOT NULL,
  source_url             TEXT NOT NULL,
  source_loaded_at       TEXT NOT NULL,
  source_snapshot_date   TEXT NOT NULL,
  row_number             INTEGER NOT NULL
);

CREATE INDEX stg_cash_fy_idx ON stg_annual_cash_report_raw (report_fiscal_year);

CREATE TABLE texas_ingestion_logs (
  id               TEXT PRIMARY KEY NOT NULL,
  dataset          TEXT NOT NULL,
  source_url       TEXT NOT NULL,
  source_file_name TEXT,
  row_count        INTEGER NOT NULL,
  rows_failed      INTEGER NOT NULL DEFAULT 0,
  checksum_sha256  TEXT,
  loaded_at        TEXT NOT NULL,
  duration_ms      INTEGER,
  status           TEXT NOT NULL,
  error_message    TEXT
);

CREATE INDEX texas_ingestion_logs_dataset_idx ON texas_ingestion_logs (dataset, loaded_at);

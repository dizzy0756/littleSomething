-- Canonical schema for the Little Something For You backend.
-- The running app also self-heals via database.js (CREATE TABLE IF NOT EXISTS +
-- ALTER migrations), so this file documents the target state and can be used to
-- bootstrap a fresh PostgreSQL instance.
--
-- Media policy: store ONLY metadata + a storage key here. Bytes live in
-- Cloudflare R2. `storage` is 'r2' (key) or 'local' (path under /uploads).

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name        TEXT,
  role        TEXT DEFAULT 'customer',
  created_at  TEXT DEFAULT NOW()::TEXT,
  updated_at  TEXT DEFAULT NOW()::TEXT
);

CREATE TABLE IF NOT EXISTS creations (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  template_id TEXT NOT NULL,
  name        TEXT,
  data_json   TEXT NOT NULL,
  created_at  TEXT DEFAULT NOW()::TEXT,
  updated_at  TEXT DEFAULT NOW()::TEXT
);

CREATE TABLE IF NOT EXISTS files (
  id            TEXT PRIMARY KEY,
  user_id       TEXT,
  creation_id   TEXT,
  filename      TEXT NOT NULL,
  original_name TEXT,
  mime_type     TEXT,
  size          INTEGER,
  path          TEXT NOT NULL,
  storage       TEXT DEFAULT 'local',
  created_at    TEXT DEFAULT NOW()::TEXT
);

CREATE TABLE IF NOT EXISTS public_links (
  id          TEXT PRIMARY KEY,
  creation_id TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT DEFAULT NOW()::TEXT,
  views       INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS link_views (
  id          TEXT PRIMARY KEY,
  link_id     TEXT NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  viewed_at   TEXT DEFAULT NOW()::TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT,
  creation_id           TEXT,
  amount                REAL,
  currency              TEXT DEFAULT 'INR',
  status                TEXT DEFAULT 'created',
  razorpay_order_id     TEXT,
  razorpay_payment_id   TEXT,
  razorpay_signature    TEXT,
  webhook_verified      BOOLEAN DEFAULT false,
  created_at            TEXT DEFAULT NOW()::TEXT,
  updated_at            TEXT DEFAULT NOW()::TEXT
);

CREATE INDEX IF NOT EXISTS idx_creations_user     ON creations(user_id);
CREATE INDEX IF NOT EXISTS idx_files_user         ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_creation     ON files(creation_id);
CREATE INDEX IF NOT EXISTS idx_links_user         ON public_links(user_id);
CREATE INDEX IF NOT EXISTS idx_links_slug         ON public_links(slug);
CREATE INDEX IF NOT EXISTS idx_link_views_link    ON link_views(link_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order  ON payments(razorpay_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_payment ON payments(razorpay_payment_id);

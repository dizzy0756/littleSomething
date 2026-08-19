const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.PG_POOL_MAX || "10", 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Idle/transient connection errors surface as 'error' on the pool. Without a
// handler Node throws and the process dies, so log and let the pool recover.
pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err.message);
});

const db = {
  prepare: (sql) => ({
    run: (...params) => pool.query(sql, params),
    get: (...params) => pool.query(sql, params).then((result) => result.rows[0] || null),
    all: (...params) => pool.query(sql, params).then((result) => result.rows),
  }),
  query: (sql, params) => pool.query(sql, params),
};

// Run a callback inside a DB transaction. The callback receives the dedicated
// client to issue its queries. Commits on success, rolls back on error.
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

let migrationsRun = false;

async function runMigrations() {
  const columns = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'payments' AND table_schema = 'public'"
  );
  const columnNames = columns.rows.map((row) => row.column_name);

  if (!columnNames.includes("creation_id")) {
    await db.query("ALTER TABLE payments ADD COLUMN creation_id TEXT");
  }
  if (!columnNames.includes("razorpay_order_id")) {
    await db.query("ALTER TABLE payments ADD COLUMN razorpay_order_id TEXT");
  }
  if (!columnNames.includes("razorpay_payment_id")) {
    await db.query("ALTER TABLE payments ADD COLUMN razorpay_payment_id TEXT");
  }
  if (!columnNames.includes("razorpay_signature")) {
    await db.query("ALTER TABLE payments ADD COLUMN razorpay_signature TEXT");
  }
  if (!columnNames.includes("updated_at")) {
    await db.query("ALTER TABLE payments ADD COLUMN updated_at TEXT DEFAULT NOW()::TEXT");
  }
  // M4: guard against duplicate confirmation emails (verify + webhook).
  if (!columnNames.includes("email_sent")) {
    await db.query("ALTER TABLE payments ADD COLUMN email_sent BOOLEAN DEFAULT FALSE");
  }

  const fileColumns = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'files' AND table_schema = 'public'"
  );
  const fileColumnNames = fileColumns.rows.map((row) => row.column_name);
  if (!fileColumnNames.includes("storage")) {
    await db.query("ALTER TABLE files ADD COLUMN storage TEXT DEFAULT 'local'");
  }

  try {
    await db.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_razorpay_order ON payments(razorpay_order_id)");
  } catch (err) {
    console.warn("Could not create unique index on razorpay_order_id:", err.message);
  }

  try {
    await db.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_razorpay_payment ON payments(razorpay_payment_id)");
  } catch (err) {
    console.warn("Could not create unique index on razorpay_payment_id:", err.message);
  }

  // M3: store currency as integer paise (not REAL). Convert any legacy REAL
  // values (*100) and switch the column type. Safe to re-run (idempotent).
  try {
    await db.query(
      "ALTER TABLE payments ALTER COLUMN amount TYPE INTEGER USING (ROUND(COALESCE(amount, 0) * 100))"
    );
  } catch (err) {
    console.warn("Could not convert payments.amount to INTEGER:", err.message);
  }
}

async function init() {
  await db.query("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT, role TEXT DEFAULT 'customer', created_at TEXT DEFAULT NOW()::TEXT, updated_at TEXT DEFAULT NOW()::TEXT)");

  await db.query("CREATE TABLE IF NOT EXISTS creations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, template_id TEXT NOT NULL, name TEXT, data_json TEXT NOT NULL, created_at TEXT DEFAULT NOW()::TEXT, updated_at TEXT DEFAULT NOW()::TEXT, FOREIGN KEY (user_id) REFERENCES users(id))");

  await db.query("CREATE TABLE IF NOT EXISTS public_links (id TEXT PRIMARY KEY, creation_id TEXT NOT NULL, user_id TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL, created_at TEXT DEFAULT NOW()::TEXT, views INTEGER DEFAULT 0, FOREIGN KEY (creation_id) REFERENCES creations(id), FOREIGN KEY (user_id) REFERENCES users(id))");

  await db.query("CREATE TABLE IF NOT EXISTS link_views (id TEXT PRIMARY KEY, link_id TEXT NOT NULL, ip_address TEXT, user_agent TEXT, viewed_at TEXT DEFAULT NOW()::TEXT, FOREIGN KEY (link_id) REFERENCES public_links(id))");

  await db.query("CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, user_id TEXT, amount INTEGER, currency TEXT DEFAULT 'usd', status TEXT DEFAULT 'pending', stripe_payment_intent_id TEXT, created_at TEXT DEFAULT NOW()::TEXT)");

  await db.query("CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, user_id TEXT, creation_id TEXT, filename TEXT NOT NULL, original_name TEXT, mime_type TEXT, size INTEGER, path TEXT NOT NULL, storage TEXT DEFAULT 'local', created_at TEXT DEFAULT NOW()::TEXT)");

  await db.query("CREATE INDEX IF NOT EXISTS idx_creations_user ON creations(user_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_links_user ON public_links(user_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_links_slug ON public_links(slug)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_link_views_link ON link_views(link_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_files_creation ON files(creation_id)");

  // M1: migrations only need to run once per process; guard against repeated
  // cold-start latency and index contention across boot/seed.
  if (!migrationsRun) {
    await runMigrations();
    migrationsRun = true;
  }
}

module.exports = { db, init, pool, transaction };

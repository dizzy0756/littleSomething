const Database = require("better-sqlite3");
const path = require("path");

const isVercel = process.env.VERCEL === "1";
const dbPath = isVercel ? "/tmp/app.db" : path.join(__dirname, "../../../data/app.db");
const db = new Database(dbPath);

function init() {
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT DEFAULT 'customer',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS creations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      name TEXT,
      data_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS public_links (
      id TEXT PRIMARY KEY,
      creation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      views INTEGER DEFAULT 0,
      FOREIGN KEY (creation_id) REFERENCES creations(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS link_views (
      id TEXT PRIMARY KEY,
      link_id TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      viewed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (link_id) REFERENCES public_links(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      amount REAL,
      currency TEXT DEFAULT 'usd',
      status TEXT DEFAULT 'pending',
      stripe_payment_intent_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      creation_id TEXT,
      filename TEXT NOT NULL,
      original_name TEXT,
      mime_type TEXT,
      size INTEGER,
      path TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const idx1 = db.prepare("CREATE INDEX IF NOT EXISTS idx_creations_user ON creations(user_id)").run();
  const idx2 = db.prepare("CREATE INDEX IF NOT EXISTS idx_links_user ON public_links(user_id)").run();
  const idx3 = db.prepare("CREATE INDEX IF NOT EXISTS idx_links_slug ON public_links(slug)").run();
  const idx4 = db.prepare("CREATE INDEX IF NOT EXISTS idx_link_views_link ON link_views(link_id)").run();
  const idx5 = db.prepare("CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id)").run();
  const idx6 = db.prepare("CREATE INDEX IF NOT EXISTS idx_files_creation ON files(creation_id)").run();
}

module.exports = { db, init };

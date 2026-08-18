require("dotenv").config();
const { db } = require("./src/lib/database");
const { hashPassword, generateId } = require("./src/lib/auth");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin";

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
  process.exit(1);
}

async function seed() {
  const byEmail = await db.prepare("SELECT id FROM users WHERE email = $1").get(ADMIN_EMAIL);
  const anyAdmin = await db.prepare("SELECT id FROM users WHERE role = 'admin'").get();

  if (byEmail) {
    await db.prepare("UPDATE users SET password_hash = $1, name = $2 WHERE id = $3")
      .run(hashPassword(ADMIN_PASSWORD), ADMIN_NAME, byEmail.id);
    console.log("Admin credentials updated for", ADMIN_EMAIL);
  } else if (anyAdmin) {
    await db.prepare("UPDATE users SET email = $1, password_hash = $2, name = $3 WHERE id = $4")
      .run(ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD), ADMIN_NAME, anyAdmin.id);
    console.log("Admin migrated to", ADMIN_EMAIL);
  } else {
    const id = generateId();
    await db.prepare("INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)")
      .run(id, ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD), ADMIN_NAME, "admin");
    console.log("Admin created:", ADMIN_EMAIL);
  }

  await db.pool.end();
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});

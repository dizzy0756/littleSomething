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

function seed() {
  const byEmail = db.prepare("SELECT id FROM users WHERE email = ?").get(ADMIN_EMAIL);
  const anyAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();

  if (byEmail) {
    db.prepare("UPDATE users SET password_hash = ?, name = ? WHERE id = ?")
      .run(hashPassword(ADMIN_PASSWORD), ADMIN_NAME, byEmail.id);
    console.log("Admin credentials updated for", ADMIN_EMAIL);
  } else if (anyAdmin) {
    db.prepare("UPDATE users SET email = ?, password_hash = ?, name = ? WHERE id = ?")
      .run(ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD), ADMIN_NAME, anyAdmin.id);
    console.log("Admin migrated to", ADMIN_EMAIL);
  } else {
    const id = generateId();
    db.prepare("INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)")
      .run(id, ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD), ADMIN_NAME, "admin");
    console.log("Admin created:", ADMIN_EMAIL);
  }
}

seed();

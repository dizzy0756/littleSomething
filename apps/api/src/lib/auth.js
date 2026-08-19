const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = "7d";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

// Async bcrypt — the sync variant blocks the Node event loop (bcrypt is
// intentionally CPU-heavy), which serialises the server under concurrent
// logins/registrations. See CODE_AUDIT.md H3.
async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function generateId() {
  return require("uuid").v4();
}

module.exports = { hashPassword, comparePassword, generateToken, verifyToken, generateId, JWT_SECRET };

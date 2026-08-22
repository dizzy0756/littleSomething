const express = require("express");
const crypto = require("crypto");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { generateId, hashPassword, comparePassword, generateToken } = require("../lib/auth");
const { sendPasswordReset } = require("../lib/email");
const { db } = require("../lib/database");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  // Cloudflare overwrites CF-Connecting-IP at its edge, so it cannot be spoofed
  // through the Pages proxy. Key the limiter on the real client IP, otherwise
  // every visitor worldwide shares one counter (the proxy IP).
  keyGenerator: (req) => ipKeyGenerator(req.headers["cf-connecting-ip"] || req.ip || ""),
});

router.use(authLimiter);

function validatePassword(password) {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain letters and numbers";
  }
  return null;
}

router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (typeof email !== "string" || email.length > 254) {
      return res.status(400).json({ error: "Invalid email" });
    }
    if (typeof password !== "string" || password.length > 128) {
      return res.status(400).json({ error: "Password too long" });
    }
    if (name && (typeof name !== "string" || name.length > 80)) {
      return res.status(400).json({ error: "Name too long" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const existing = await db.prepare("SELECT id FROM users WHERE email = $1").get(email);
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const user = {
      id: generateId(),
      email: email.toLowerCase(),
      password_hash: await hashPassword(password),
      name: name || "",
      role: "customer",
    };

    await db.prepare("INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)").run(user.id, user.email, user.password_hash, user.name, user.role);

    const token = generateToken(user);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (typeof email !== "string" || email.length > 254) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    if (typeof password !== "string" || password.length > 128) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = await db.prepare("SELECT * FROM users WHERE email = $1").get(email.toLowerCase());
    if (!user || !(await comparePassword(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = generateToken(user);
    
    const response = {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };

    if (user.role === "admin") {
      res.setHeader(
        "Set-Cookie",
        `admin_session=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=None; Secure`
      );
    }

    res.json(response);
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const token = authHeader.split(" ")[1];
    const decoded = require("../lib/auth").verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const user = await db.prepare("SELECT id, email, name, role, created_at FROM users WHERE id = $1").get(decoded.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user });
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Generate a single-use, time-limited password reset token (sha256 of a random
// value is stored; the raw value is emailed). Returns the raw token.
async function createResetToken(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const hashed = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  await db
    .prepare("UPDATE users SET reset_token = $1, reset_token_expires_at = $2 WHERE id = $3")
    .run(hashed, expiresAt, userId);
  return token;
}

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await db.prepare("SELECT * FROM users WHERE email = $1").get(email.toLowerCase());
    if (user) {
      const token = await createResetToken(user.id);
      const base = (process.env.WEB_BASE_URL || "").replace(/\/$/, "");
      const resetUrl = `${base}/reset-password.html?token=${token}`;
      await sendPasswordReset(user.email, resetUrl);
    }

    // Always return the same response so callers can't probe which emails exist.
    res.json({ ok: true, message: "If that email exists, a reset link is on its way." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Could not process your request" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Invalid or missing reset token" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const hashed = crypto.createHash("sha256").update(token).digest("hex");
    const user = await db.prepare("SELECT * FROM users WHERE reset_token = $1").get(hashed);
    if (
      !user ||
      !user.reset_token_expires_at ||
      new Date(user.reset_token_expires_at).getTime() < Date.now()
    ) {
      return res.status(400).json({ error: "This reset link is invalid or has expired" });
    }

    await db
      .prepare(
        "UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL WHERE id = $2"
      )
      .run(await hashPassword(password), user.id);

    res.json({ ok: true, message: "Password updated. You can now log in." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Could not reset your password" });
  }
});

module.exports = router;

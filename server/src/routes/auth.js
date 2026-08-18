const express = require("express");
const rateLimit = require("express-rate-limit");
const { generateId, hashPassword, comparePassword, generateToken } = require("../lib/auth");
const { db } = require("../lib/database");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
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
      password_hash: hashPassword(password),
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
    if (!user || !comparePassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
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

module.exports = router;

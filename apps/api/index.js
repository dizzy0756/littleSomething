require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.warn("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — payment features will be disabled");
}

// Explicit allowlist. NEVER use `*` with credentials. Reflect the matched
// origin so the browser sends Authorization / cookies cross-origin.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    // Allow non-browser tools (curl, health checks) with no Origin header.
    if (!origin || allowedOrigins.includes(origin)) return cb(null, origin || true);
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 600,
};

const authRoutes = require("./src/routes/auth");
const creationRoutes = require("./src/routes/creations");
const uploadRoutes = require("./src/routes/upload");
const linkRoutes = require("./src/routes/links");
const templateRoutes = require("./src/routes/templates");
const dashboardRoutes = require("./src/routes/dashboard");
const adminRoutes = require("./src/routes/admin");
const analyticsRoutes = require("./src/routes/analytics");
const siteRoutes = require("./src/routes/site");
const paymentRoutes = require("./src/routes/payments");
const { adminSessionFromCookie } = require("./src/middleware/auth");

const db = require("./src/lib/database");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // preflight

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Razorpay webhook must receive the RAW body for HMAC verification.
app.use("/api/payments/webhook", express.raw({ type: "application/json" }), paymentRoutes.webhookRouter);

// Static assets served by the API:
//  - /templates : CSS for server-rendered surprise pages (/s/:slug)
//  - /uploads    : locally-stored media fallback (dev / when R2 is off)
app.use("/templates", express.static(path.join(__dirname, "templates")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/creations", creationRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/links", linkRoutes.router);
app.use("/api/templates", templateRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/payments", paymentRoutes.router);
app.use("/s", siteRoutes);

// Admin SPA is served by Cloudflare, but the API still guards the route for
// cookie-based admin sessions used by the Cloudflare-hosted admin page.
app.get("/admin", adminSessionFromCookie, (req, res) => {
  res.json({ ok: true, user: { id: req.user.id, email: req.user.email, role: req.user.role } });
});

app.use((err, req, res, next) => {
  if (err && err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "Origin not allowed" });
  }
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

async function start() {
  await db.init();
  app.listen(PORT, () => {
    console.log(`Little Something API running on http://localhost:${PORT}`);
    if (allowedOrigins.length === 0) {
      console.warn("ALLOWED_ORIGINS is empty — CORS will reject browser requests from the frontend.");
    }
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

require("dotenv").config();

const express = require("express");
const cors = require("cors");

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
if (!process.env.RAZORPAY_KEY_ID) {
  console.warn("RAZORPAY_KEY_ID is not set — payment features will be disabled");
}
if (!process.env.RAZORPAY_KEY_SECRET) {
  console.warn("RAZORPAY_KEY_SECRET is not set — payment features will be disabled");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const allowedOrigins = [process.env.FRONTEND_URL, "http://localhost:3001", "http://localhost:3000"].filter(Boolean);

const path = require("path");

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

app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api/payments/webhook", express.raw({ type: "application/json" }), paymentRoutes.webhookRouter);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/templates", express.static(path.join(__dirname, "../templates")));
app.use("/assets", express.static(path.join(__dirname, "../assets")));

const FRONTEND_DIR = path.join(__dirname, "..");

app.get("/admin", adminSessionFromCookie, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "admin.html"));
});

app.get("/admin.html", (req, res) => {
  res.redirect(301, "/admin");
});

app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});
app.get("/builder", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "builder.html"));
});
app.get("/templates.html", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "templates.html"));
});
app.get("/checkout.html", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "checkout.html"));
});
app.get("/preview.html", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "preview.html"));
});
app.get("/how-it-works.html", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "how-it-works.html"));
});
app.get("/terms.html", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "terms.html"));
});
app.get("/privacy.html", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "privacy.html"));
});

app.use(express.static(FRONTEND_DIR, { index: false }));

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

app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

async function start() {
  await db.init();
  app.listen(PORT, () => {
    console.log(`Little Something API running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

require("dotenv").config();

const express = require("express");
const cors = require("cors");

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

const db = require("./src/lib/database");

const isVercel = process.env.VERCEL === "1";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

if (!isVercel) {
  app.use("/uploads", express.static(path.join(__dirname, "uploads")));
}
app.use("/templates", express.static(path.join(__dirname, "../templates")));
app.use("/assets", express.static(path.join(__dirname, "../assets")));

const FRONTEND_DIR = path.join(__dirname, "..");
app.use(express.static(FRONTEND_DIR, { index: false }));

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
app.get("/admin.html", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "admin.html"));
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/creations", creationRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/links", linkRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/s", siteRoutes);

app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

db.init();

if (isVercel) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`Little Something API running on http://localhost:${PORT}`);
  });
}

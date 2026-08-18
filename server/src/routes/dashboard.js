const express = require("express");
const { db } = require("../lib/database");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/stats", (req, res) => {
  try {
    const creationCount = db.prepare("SELECT COUNT(*) as count FROM creations WHERE user_id = ?").get(req.user.id).count;
    const linkCount = db.prepare("SELECT COUNT(*) as count FROM public_links WHERE user_id = ?").get(req.user.id).count;
    const totalViews = db.prepare("SELECT COALESCE(SUM(views), 0) as total FROM public_links WHERE user_id = ?").get(req.user.id).total;

    const recentCreations = db.prepare(
      "SELECT id, name, template_id, updated_at FROM creations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5"
    ).all(req.user.id);

    const recentLinks = db.prepare(
      "SELECT id, slug, views, expires_at, created_at FROM public_links WHERE user_id = ? ORDER BY created_at DESC LIMIT 5"
    ).all(req.user.id);

    res.json({
      stats: {
        creations: creationCount,
        links: linkCount,
        totalViews,
      },
      recentCreations,
      recentLinks,
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

module.exports = router;

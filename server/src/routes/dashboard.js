const express = require("express");
const { db } = require("../lib/database");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/stats", async (req, res) => {
  try {
    const creationCount = await db.prepare("SELECT COUNT(*) as count FROM creations WHERE user_id = $1").get(req.user.id);
    const linkCount = await db.prepare("SELECT COUNT(*) as count FROM public_links WHERE user_id = $1").get(req.user.id);
    const totalViews = await db.prepare("SELECT COALESCE(SUM(views), 0) as total FROM public_links WHERE user_id = $1").get(req.user.id);

    const recentCreations = await db.prepare(
      "SELECT id, name, template_id, updated_at FROM creations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 5"
    ).all(req.user.id);

    const recentLinks = await db.prepare(
      "SELECT id, slug, views, expires_at, created_at FROM public_links WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5"
    ).all(req.user.id);

    res.json({
      stats: {
        creations: creationCount.count,
        links: linkCount.count,
        totalViews: totalViews.total,
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

const express = require("express");
const { db } = require("../lib/database");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/links/:linkId", async (req, res) => {
  try {
    const link = await db.prepare("SELECT * FROM public_links WHERE id = $1 AND user_id = $2").get(req.params.linkId, req.user.id);
    if (!link) {
      return res.status(404).json({ error: "Link not found" });
    }

    const views = await db.prepare("SELECT * FROM link_views WHERE link_id = $1 ORDER BY viewed_at DESC LIMIT 100").all(link.id);
    res.json({ link, views });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

module.exports = router;

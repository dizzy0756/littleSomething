const express = require("express");
const { db } = require("../lib/database");
const { authMiddleware, adminOnly } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware, adminOnly);

router.get("/stats", async (req, res) => {
  try {
    const userCount = await db.prepare("SELECT COUNT(*) as count FROM users").get();
    const creationCount = await db.prepare("SELECT COUNT(*) as count FROM creations").get();
    const linkCount = await db.prepare("SELECT COUNT(*) as count FROM public_links").get();
    const totalViews = await db.prepare("SELECT COALESCE(SUM(views), 0) as total FROM public_links").get();
    const paymentCount = await db.prepare("SELECT COUNT(*) as count FROM payments WHERE status IN ('succeeded', 'paid')").get();
    const revenue = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status IN ('succeeded', 'paid')").get();

    res.json({
      stats: {
        users: userCount.count,
        creations: creationCount.count,
        links: linkCount.count,
        totalViews: totalViews.total,
        payments: paymentCount.count,
        revenue: revenue.total,
      },
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Failed to fetch admin stats" });
  }
});

router.get("/creations", async (req, res) => {
  try {
    const creations = await db.prepare(
      "SELECT c.id, c.user_id, u.email as user_email, c.template_id, c.name, c.created_at, c.updated_at FROM creations c JOIN users u ON c.user_id = u.id ORDER BY c.updated_at DESC"
    ).all();
    res.json({ creations });
  } catch (err) {
    console.error("Admin creations error:", err);
    res.status(500).json({ error: "Failed to fetch creations" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const users = await db.prepare("SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC").all();
    res.json({ users });
  } catch (err) {
    console.error("Admin users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/links", async (req, res) => {
  try {
    const links = await db.prepare(
      "SELECT l.*, u.email as user_email FROM public_links l JOIN users u ON l.user_id = u.id ORDER BY l.created_at DESC"
    ).all();
    res.json({ links });
  } catch (err) {
    console.error("Admin links error:", err);
    res.status(500).json({ error: "Failed to fetch links" });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await db.prepare("DELETE FROM link_views WHERE link_id IN (SELECT id FROM public_links WHERE user_id = $1)").run(id);
    await db.prepare("DELETE FROM public_links WHERE user_id = $1").run(id);
    await db.prepare("DELETE FROM creations WHERE user_id = $1").run(id);
    await db.prepare("DELETE FROM users WHERE id = $1").run(id);
    res.json({ success: true });
  } catch (err) {
    console.error("Admin delete user error:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.delete("/creations/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await db.prepare("DELETE FROM public_links WHERE creation_id = $1").run(id);
    await db.prepare("DELETE FROM link_views WHERE link_id IN (SELECT id FROM public_links WHERE creation_id = $1)").run(id);
    await db.prepare("DELETE FROM creations WHERE id = $1").run(id);
    res.json({ success: true });
  } catch (err) {
    console.error("Admin delete creation error:", err);
    res.status(500).json({ error: "Failed to delete creation" });
  }
});

router.delete("/links/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await db.prepare("DELETE FROM link_views WHERE link_id = $1").run(id);
    await db.prepare("DELETE FROM public_links WHERE id = $1").run(id);
    res.json({ success: true });
  } catch (err) {
    console.error("Admin delete link error:", err);
    res.status(500).json({ error: "Failed to delete link" });
  }
});

module.exports = router;

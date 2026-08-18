const express = require("express");
const { db } = require("../lib/database");
const { authMiddleware, adminOnly } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware, adminOnly);

router.get("/stats", (req, res) => {
  try {
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    const creationCount = db.prepare("SELECT COUNT(*) as count FROM creations").get().count;
    const linkCount = db.prepare("SELECT COUNT(*) as count FROM public_links").get().count;
    const totalViews = db.prepare("SELECT COALESCE(SUM(views), 0) as total FROM public_links").get().total;
    const paymentCount = db.prepare("SELECT COUNT(*) as count FROM payments WHERE status IN ('succeeded', 'paid')").get().count;
    const revenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status IN ('succeeded', 'paid')").get().total;

    res.json({
      stats: {
        users: userCount,
        creations: creationCount,
        links: linkCount,
        totalViews,
        payments: paymentCount,
        revenue,
      },
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Failed to fetch admin stats" });
  }
});

router.get("/creations", (req, res) => {
  try {
    const creations = db.prepare(
      "SELECT c.id, c.user_id, u.email as user_email, c.template_id, c.name, c.created_at, c.updated_at FROM creations c JOIN users u ON c.user_id = u.id ORDER BY c.updated_at DESC"
    ).all();
    res.json({ creations });
  } catch (err) {
    console.error("Admin creations error:", err);
    res.status(500).json({ error: "Failed to fetch creations" });
  }
});

router.get("/users", (req, res) => {
  try {
    const users = db.prepare("SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC").all();
    res.json({ users });
  } catch (err) {
    console.error("Admin users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/links", (req, res) => {
  try {
    const links = db.prepare(
      "SELECT l.*, u.email as user_email FROM public_links l JOIN users u ON l.user_id = u.id ORDER BY l.created_at DESC"
    ).all();
    res.json({ links });
  } catch (err) {
    console.error("Admin links error:", err);
    res.status(500).json({ error: "Failed to fetch links" });
  }
});

router.delete("/users/:id", (req, res) => {
  try {
    const id = req.params.id;
    db.prepare("DELETE FROM link_views WHERE link_id IN (SELECT id FROM public_links WHERE user_id = ?)").run(id);
    db.prepare("DELETE FROM public_links WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM creations WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err) {
    console.error("Admin delete user error:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.delete("/creations/:id", (req, res) => {
  try {
    const id = req.params.id;
    db.prepare("DELETE FROM public_links WHERE creation_id = ?").run(id);
    db.prepare("DELETE FROM link_views WHERE link_id IN (SELECT id FROM public_links WHERE creation_id = ?)").run(id);
    db.prepare("DELETE FROM creations WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err) {
    console.error("Admin delete creation error:", err);
    res.status(500).json({ error: "Failed to delete creation" });
  }
});

router.delete("/links/:id", (req, res) => {
  try {
    const id = req.params.id;
    db.prepare("DELETE FROM link_views WHERE link_id = ?").run(id);
    db.prepare("DELETE FROM public_links WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err) {
    console.error("Admin delete link error:", err);
    res.status(500).json({ error: "Failed to delete link" });
  }
});

module.exports = router;

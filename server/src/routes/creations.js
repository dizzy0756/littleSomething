const express = require("express");
const { generateId } = require("../lib/auth");
const { db } = require("../lib/database");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/", (req, res) => {
  try {
    const creations = db.prepare(
      "SELECT id, user_id, template_id, name, created_at, updated_at FROM creations WHERE user_id = ? ORDER BY updated_at DESC"
    ).all(req.user.id);
    res.json({ creations });
  } catch (err) {
    console.error("List creations error:", err);
    res.status(500).json({ error: "Failed to fetch creations" });
  }
});

router.get("/:id", (req, res) => {
  try {
    const creation = db.prepare("SELECT * FROM creations WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
    if (!creation) {
      return res.status(404).json({ error: "Creation not found" });
    }
    res.json({ creation: { ...creation, data: JSON.parse(creation.data_json) } });
  } catch (err) {
    console.error("Get creation error:", err);
    res.status(500).json({ error: "Failed to fetch creation" });
  }
});

router.post("/", (req, res) => {
  try {
    const { template_id, name, data } = req.body;
    if (!template_id || !data) {
      return res.status(400).json({ error: "template_id and data are required" });
    }

    const data_json = JSON.stringify(data);
    if (data_json.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: "Creation data is too large. Try using smaller images." });
    }

    const creation = {
      id: generateId(),
      user_id: req.user.id,
      template_id,
      name: name || "Untitled",
      data_json,
    };

    db.prepare("INSERT INTO creations (id, user_id, template_id, name, data_json) VALUES (?, ?, ?, ?, ?)")
      .run(creation.id, creation.user_id, creation.template_id, creation.name, creation.data_json);

    res.status(201).json({ creation: { ...creation, data } });
  } catch (err) {
    console.error("Create creation error:", err);
    res.status(500).json({ error: "Failed to save creation" });
  }
});

router.put("/:id", (req, res) => {
  try {
    const { name, data, template_id } = req.body;
    const existing = db.prepare("SELECT id FROM creations WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: "Creation not found" });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push("name = ?"); values.push(name); }
    if (data !== undefined) { updates.push("data_json = ?"); values.push(JSON.stringify(data)); }
    if (template_id !== undefined) { updates.push("template_id = ?"); values.push(template_id); }
    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);

    db.prepare("UPDATE creations SET " + updates.join(", ") + " WHERE id = ?").run(...values);

    const updated = db.prepare("SELECT * FROM creations WHERE id = ?").get(req.params.id);
    res.json({ creation: { ...updated, data: JSON.parse(updated.data_json) } });
  } catch (err) {
    console.error("Update creation error:", err);
    res.status(500).json({ error: "Failed to update creation" });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const result = db.prepare("DELETE FROM creations WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Creation not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Delete creation error:", err);
    res.status(500).json({ error: "Failed to delete creation" });
  }
});

module.exports = router;

const express = require("express");
const { generateId } = require("../lib/auth");
const { db } = require("../lib/database");
const { authMiddleware } = require("../middleware/auth");
const { validateBody, creationSchema } = require("@little-something/shared");

const router = express.Router();

router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const creations = await db.prepare(
      "SELECT id, user_id, template_id, name, created_at, updated_at FROM creations WHERE user_id = $1 ORDER BY updated_at DESC"
    ).all(req.user.id);
    res.json({ creations });
  } catch (err) {
    console.error("List creations error:", err);
    res.status(500).json({ error: "Failed to fetch creations" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const creation = await db.prepare("SELECT * FROM creations WHERE id = $1 AND user_id = $2").get(req.params.id, req.user.id);
    if (!creation) {
      return res.status(404).json({ error: "Creation not found" });
    }
    res.json({ creation: { ...creation, data: JSON.parse(creation.data_json) } });
  } catch (err) {
    console.error("Get creation error:", err);
    res.status(500).json({ error: "Failed to fetch creation" });
  }
});

router.post("/", validateBody(creationSchema), async (req, res) => {
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

    await db.prepare("INSERT INTO creations (id, user_id, template_id, name, data_json) VALUES ($1, $2, $3, $4, $5)")
      .run(creation.id, creation.user_id, creation.template_id, creation.name, creation.data_json);

    res.status(201).json({ creation: { ...creation, data } });
  } catch (err) {
    console.error("Create creation error:", err);
    res.status(500).json({ error: "Failed to save creation" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { name, data, template_id } = req.body;
    const existing = await db.prepare("SELECT id FROM creations WHERE id = $1 AND user_id = $2").get(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: "Creation not found" });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push("name = $1"); values.push(name); }
    if (data !== undefined) { updates.push("data_json = $2"); values.push(JSON.stringify(data)); }
    if (template_id !== undefined) { updates.push("template_id = $3"); values.push(template_id); }
    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(req.params.id);

    await db.prepare("UPDATE creations SET " + updates.join(", ") + " WHERE id = $" + values.length).run(...values);

    const updated = await db.prepare("SELECT * FROM creations WHERE id = $1").get(req.params.id);
    res.json({ creation: { ...updated, data: JSON.parse(updated.data_json) } });
  } catch (err) {
    console.error("Update creation error:", err);
    res.status(500).json({ error: "Failed to update creation" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const result = await db.prepare("DELETE FROM creations WHERE id = $1 AND user_id = $2").run(req.params.id, req.user.id);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Creation not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Delete creation error:", err);
    res.status(500).json({ error: "Failed to delete creation" });
  }
});

module.exports = router;

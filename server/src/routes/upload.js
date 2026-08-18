const express = require("express");
const { generateId } = require("../lib/auth");
const { db } = require("../lib/database");
const { authMiddleware } = require("../middleware/auth");
const { upload, validateFileContent } = require("../middleware/upload");

const router = express.Router();

router.use(authMiddleware);

router.post("/file", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!validateFileContent(req.file.path, req.file.mimetype)) {
      const fs = require("fs");
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Invalid file content" });
    }

    const fileRecord = {
      id: generateId(),
      user_id: req.user.id,
      creation_id: req.body.creation_id || null,
      filename: req.file.filename,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size: req.file.size,
      path: "/uploads/" + (req.file.mimetype.startsWith("audio") ? "audio" : "images") + "/" + req.file.filename,
    };

    db.prepare(
      "INSERT INTO files (id, user_id, creation_id, filename, original_name, mime_type, size, path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      fileRecord.id,
      fileRecord.user_id,
      fileRecord.creation_id,
      fileRecord.filename,
      fileRecord.original_name,
      fileRecord.mime_type,
      fileRecord.size,
      fileRecord.path
    );

    res.status(201).json({ file: fileRecord });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

router.get("/", (req, res) => {
  try {
    const { creation_id } = req.query;
    let query = "SELECT * FROM files WHERE user_id = ?";
    const params = [req.user.id];
    if (creation_id) {
      query += " AND creation_id = ?";
      params.push(creation_id);
    }
    query += " ORDER BY created_at DESC";
    const files = db.prepare(query).all(...params);
    res.json({ files });
  } catch (err) {
    console.error("List files error:", err);
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const file = db.prepare("SELECT * FROM files WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    const fs = require("fs");
    const path = require("path");
    const fullPath = path.join(__dirname, "../../..", file.path);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    db.prepare("DELETE FROM files WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete file error:", err);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

module.exports = router;

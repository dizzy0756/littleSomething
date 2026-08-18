const express = require("express");
const { generateId } = require("../lib/auth");
const { db } = require("../lib/database");
const { authMiddleware } = require("../middleware/auth");
const { upload, validateFileContent } = require("../middleware/upload");
const { checkMedia } = require("@little-something/shared");
const r2 = require("../lib/r2");
const { toFileDTO } = require("../lib/files");

const router = express.Router();

router.use(authMiddleware);

/**
 * Step 1 — request an upload target.
 * Returns a presigned R2 PUT URL when R2 is configured, otherwise signals
 * the client to use the multipart /file fallback (local dev).
 */
router.post("/sign", async (req, res) => {
  try {
    const { kind, mime, bytes, creation_id, original_name } = req.body;
    const check = checkMedia(kind, mime, Number(bytes) || 0);
    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }

    const fileId = generateId();

    if (r2.isConfigured()) {
      const key = r2.buildKey(req.user.id, kind, original_name || `${fileId}.bin`);
      const uploadUrl = await r2.signUploadUrl({ key, mime });
      return res.status(200).json({
        file_id: fileId,
        storage: "r2",
        key,
        upload_url: uploadUrl,
        url: r2.resolveUrl("r2", key),
        method: "PUT",
      });
    }

    // Fallback: client uploads the bytes to /file (stored on local disk).
    return res.status(200).json({
      file_id: fileId,
      storage: "local",
      upload_url: null,
      method: "POST",
    });
  } catch (err) {
    console.error("Sign upload error:", err);
    res.status(500).json({ error: "Could not prepare upload" });
  }
});

/**
 * Step 2a (R2 path) — confirm metadata after the browser PUTs to R2.
 */
router.post("/confirm", async (req, res) => {
  try {
    const { file_id, key, mime, bytes, kind, original_name, creation_id } = req.body;
    if (!file_id || !key || !mime) {
      return res.status(400).json({ error: "Missing upload confirmation fields" });
    }
    const record = {
      id: file_id,
      user_id: req.user.id,
      creation_id: creation_id || null,
      filename: key.split("/").pop(),
      original_name: original_name || key.split("/").pop(),
      mime_type: mime,
      size: Number(bytes) || 0,
      path: key,
      storage: "r2",
    };
    await db.prepare(
      "INSERT INTO files (id, user_id, creation_id, filename, original_name, mime_type, size, path, storage) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
    ).run(
      record.id, record.user_id, record.creation_id, record.filename,
      record.original_name, record.mime_type, record.size, record.path, record.storage
    );
    res.status(201).json({ file: toFileDTO(record) });
  } catch (err) {
    console.error("Confirm upload error:", err);
    res.status(500).json({ error: "Failed to confirm upload" });
  }
});

/**
 * Step 2b (local fallback) — receive the bytes directly (dev only).
 */
router.post("/file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    if (!validateFileContent(req.file.path, req.file.mimetype)) {
      const fs = require("fs");
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Invalid file content" });
    }
    const record = {
      id: generateId(),
      user_id: req.user.id,
      creation_id: req.body.creation_id || null,
      filename: req.file.filename,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size: req.file.size,
      path: "/uploads/" + (req.file.mimetype.startsWith("audio") ? "audio" : "images") + "/" + req.file.filename,
      storage: "local",
    };
    await db.prepare(
      "INSERT INTO files (id, user_id, creation_id, filename, original_name, mime_type, size, path, storage) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
    ).run(
      record.id, record.user_id, record.creation_id, record.filename,
      record.original_name, record.mime_type, record.size, record.path, record.storage
    );
    res.status(201).json({ file: toFileDTO(record) });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { creation_id } = req.query;
    let query = "SELECT * FROM files WHERE user_id = $1";
    const params = [req.user.id];
    if (creation_id) {
      query += " AND creation_id = $2";
      params.push(creation_id);
    }
    query += " ORDER BY created_at DESC";
    const files = await db.query(query, params);
    const { toFileList } = require("../lib/files");
    res.json({ files: toFileList(files.rows) });
  } catch (err) {
    console.error("List files error:", err);
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const file = await db.prepare("SELECT * FROM files WHERE id = $1 AND user_id = $2").get(req.params.id, req.user.id);
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    if (file.storage === "r2") {
      await r2.deleteObject(file.path);
    } else {
      const fs = require("fs");
      const path = require("path");
      const fullPath = path.join(__dirname, "../../../uploads", file.path.replace("/uploads/", ""));
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    await db.prepare("DELETE FROM files WHERE id = $1").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete file error:", err);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

module.exports = router;

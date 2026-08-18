const express = require("express");
const crypto = require("crypto");
const { generateId } = require("../lib/auth");
const { db } = require("../lib/database");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

function generateLinkForCreation(creationId, userId, expiryDays) {
  expiryDays = expiryDays || parseInt(process.env.PRIVATE_LINK_EXPIRY_DAYS || "7", 10);
  const existing = db.prepare(
    "SELECT * FROM public_links WHERE creation_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(creationId, userId);

  if (existing && new Date(existing.expires_at) > new Date()) {
    return { link: existing, created: false };
  }

  for (var attempt = 0; attempt < 5; attempt++) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);
    const slug = crypto.randomBytes(7).toString("base64url").slice(0, 10);

    const link = {
      id: generateId(),
      creation_id: creationId,
      user_id: userId,
      slug,
      expires_at: expiresAt.toISOString(),
      views: 0,
    };

    try {
      db.prepare("INSERT INTO public_links (id, creation_id, user_id, slug, expires_at, views) VALUES (?, ?, ?, ?, ?, ?)")
        .run(link.id, link.creation_id, link.user_id, link.slug, link.expires_at, link.views);
      return { link: link, created: true };
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT" && err.message.indexOf("slug") !== -1) {
        console.warn("Slug collision, retrying...", slug);
        continue;
      }
      throw err;
    }
  }

  throw new Error("Failed to generate unique slug after multiple attempts");
}

// Generate or return existing active link for a creation.
// If a non-expired link already exists, return it unchanged (same URL).
// If expired or none, create a fresh one.
router.post("/:creationId/generate", (req, res) => {
  try {
    const creation = db.prepare("SELECT * FROM creations WHERE id = ? AND user_id = ?").get(req.params.creationId, req.user.id);
    if (!creation) {
      return res.status(404).json({ error: "Creation not found" });
    }

    const result = generateLinkForCreation(req.params.creationId, req.user.id);
    res.status(result.created ? 201 : 200).json({ link: result.link });
  } catch (err) {
    console.error("Generate link error:", err);
    res.status(500).json({ error: "Failed to generate link" });
  }
});

router.get("/", (req, res) => {
  try {
    const links = db.prepare(
      "SELECT id, creation_id, slug, expires_at, views, created_at FROM public_links WHERE user_id = ? ORDER BY created_at DESC"
    ).all(req.user.id);
    res.json({ links });
  } catch (err) {
    console.error("List links error:", err);
    res.status(500).json({ error: "Failed to fetch links" });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const result = db.prepare("DELETE FROM public_links WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Link not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Delete link error:", err);
    res.status(500).json({ error: "Failed to delete link" });
  }
});

module.exports = { router, generateLinkForCreation };

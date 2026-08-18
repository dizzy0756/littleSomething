const express = require("express");
const crypto = require("crypto");
const { generateId } = require("../lib/auth");
const { db } = require("../lib/database");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

async function generateLinkForCreation(creationId, userId, expiryDays) {
  expiryDays = expiryDays || parseInt(process.env.PRIVATE_LINK_EXPIRY_DAYS || "7", 10);
  const existing = await db.prepare(
    "SELECT * FROM public_links WHERE creation_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1"
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
      await db.prepare("INSERT INTO public_links (id, creation_id, user_id, slug, expires_at, views) VALUES ($1, $2, $3, $4, $5, $6)")
        .run(link.id, link.creation_id, link.user_id, link.slug, link.expires_at, link.views);
      return { link: link, created: true };
    } catch (err) {
      if (err.code === "23505" && err.message.toLowerCase().indexOf("slug") !== -1) {
        console.warn("Slug collision, retrying...", slug);
        continue;
      }
      throw err;
    }
  }

  throw new Error("Failed to generate unique slug after multiple attempts");
}

router.post("/:creationId/generate", async (req, res) => {
  try {
    const creation = await db.prepare("SELECT * FROM creations WHERE id = $1 AND user_id = $2").get(req.params.creationId, req.user.id);
    if (!creation) {
      return res.status(404).json({ error: "Creation not found" });
    }

    const result = await generateLinkForCreation(req.params.creationId, req.user.id);
    res.status(result.created ? 201 : 200).json({ link: result.link });
  } catch (err) {
    console.error("Generate link error:", err);
    res.status(500).json({ error: "Failed to generate link" });
  }
});

router.get("/", async (req, res) => {
  try {
    const links = await db.prepare(
      "SELECT id, creation_id, slug, expires_at, views, created_at FROM public_links WHERE user_id = $1 ORDER BY created_at DESC"
    ).all(req.user.id);
    res.json({ links });
  } catch (err) {
    console.error("List links error:", err);
    res.status(500).json({ error: "Failed to fetch links" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const result = await db.prepare("DELETE FROM public_links WHERE id = $1 AND user_id = $2").run(req.params.id, req.user.id);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Link not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Delete link error:", err);
    res.status(500).json({ error: "Failed to delete link" });
  }
});

module.exports = { router, generateLinkForCreation };

/**
 * Shared contracts between the Cloudflare frontend (apps/web) and the
 * Render backend (apps/api). Keep this package free of any Node- or
 * browser-only APIs so it can be imported by both sides.
 */
const { z } = require("zod");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Hard limits enforced server-side. Client shows its own friendlier messages.
const MEDIA_LIMITS = {
  photo: 10 * 1024 * 1024, // 10 MB
  music: 25 * 1024 * 1024, // 25 MB
  gif: 8 * 1024 * 1024, // 8 MB
};

const ALLOWED_MIME = {
  photo: ["image/jpeg", "image/png", "image/webp"],
  music: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg"],
  gif: ["image/gif", "image/webp"],
};

const MEDIA_KINDS = ["photo", "music", "gif"];

// ---------------------------------------------------------------------------
// Schemas (zod)
// ---------------------------------------------------------------------------

const userRegisterSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().max(80).optional(),
});

const userLoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

const creationSchema = z.object({
  template_id: z.string().min(1).max(64),
  name: z.string().max(120).optional(),
  // Builder config is arbitrary, user-authored JSON. Validate shape loosely.
  data: z.any(),
});

const mediaSignSchema = z.object({
  kind: z.enum(MEDIA_KINDS),
  mime: z.string().min(1).max(128),
  bytes: z.number().int().positive().max(25 * 1024 * 1024),
  creation_id: z.string().max(64).optional().nullable(),
});

const paymentOrderSchema = z.object({
  creation_id: z.string().min(1).max(64),
});

const paymentVerifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Express-style validation middleware factory.
 * Usage: router.post("/x", validateBody(creationSchema), handler)
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    req.validated = result.data;
    next();
  };
}

/**
 * Validate a media kind/mime/bytes triple against the shared limits.
 * Returns { ok, error }.
 */
function checkMedia(kind, mime, bytes) {
  if (!MEDIA_KINDS.includes(kind)) return { ok: false, error: "Invalid media kind" };
  if (!ALLOWED_MIME[kind].includes(mime)) return { ok: false, error: "Unsupported file type for " + kind };
  if (bytes > MEDIA_LIMITS[kind]) {
    return { ok: false, error: "File too large for " + kind + " (max " + MEDIA_LIMITS[kind] / 1024 / 1024 + "MB)" };
  }
  return { ok: true };
}

module.exports = {
  MEDIA_LIMITS,
  ALLOWED_MIME,
  MEDIA_KINDS,
  userRegisterSchema,
  userLoginSchema,
  creationSchema,
  mediaSignSchema,
  paymentOrderSchema,
  paymentVerifySchema,
  validateBody,
  checkMedia,
  z,
};

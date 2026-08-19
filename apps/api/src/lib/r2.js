/**
 * Cloudflare R2 (S3-compatible) object storage client.
 *
 * When R2 credentials are present the app issues short-lived presigned PUT
 * URLs so the browser uploads media DIRECTLY to R2 (never touching Render's
 * ephemeral disk). When R2 is not configured we fall back to local disk
 * uploads under /uploads (dev only) so the app still runs locally.
 */
const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // e.g. https://cdn.littlesomething.app

let client = null;
if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET) {
  client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

function isConfigured() {
  return !!client;
}

/**
 * Build a storage key for an uploaded file.
 * Layout: <ownerId>/<kind>/<uuid>.<ext>
 */
function buildKey(ownerId, kind, filename) {
  const ext = (filename.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const id = require("uuid").v4();
  return `${ownerId}/${kind}/${id}.${ext}`;
}

async function signUploadUrl({ key, mime, expiresIn = 300 }) {
  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: mime,
    // Public bucket via Cloudflare; if private, also issue a signed GET URL.
  });
  const url = await getSignedUrl(client, cmd, { expiresIn });
  return url;
}

async function deleteObject(key) {
  if (!client) return;
  await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

/**
 * Verify an object exists in R2 (used to confirm an upload actually landed
 * before we persist its metadata). Returns true when present (or when R2 is not
 * configured, in which case the check is skipped).
 */
async function headObject(key) {
  if (!client) return true;
  try {
    await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch (err) {
    return false;
  }
}

/** Resolve the public URL for a stored object (R2 key or local path). */
function resolveUrl(storage, path) {
  if (storage === "r2" && R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL.replace(/\/$/, "")}/${path}`;
  }
  return path; // local fallback, served by the API at /uploads/...
}

module.exports = {
  R2_BUCKET,
  R2_PUBLIC_URL,
  isConfigured,
  buildKey,
  signUploadUrl,
  deleteObject,
  headObject,
  resolveUrl,
};

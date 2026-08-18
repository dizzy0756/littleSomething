/**
 * Runtime config + API helpers for the Cloudflare-hosted frontend.
 *
 * Loaded as a CLASSIC script in <head> so it runs before builder.js/admin.js
 * and sets window.API_BASE etc. The __TOKEN__ placeholders are replaced at
 * build time by Vite's `define` from VITE_* env vars (never shipped as literals
 * beyond the public Razorpay key).
 */
var API_BASE = __API_BASE__;
var RAZORPAY_KEY_ID = __RZP_KEY__;
var CDN_BASE = __CDN_BASE__;

window.API_BASE = API_BASE;
window.RAZORPAY_KEY_ID = RAZORPAY_KEY_ID;
window.CDN_BASE = CDN_BASE;

// Resolve a media URL: stored URLs are already absolute (R2/CDN); when the
// backend falls back to a relative /uploads path we prefix the API origin.
function resolveMediaUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//.test(url)) return url;
  if (url.startsWith("/uploads/") && API_BASE) return API_BASE.replace(/\/$/, "") + url;
  return url;
}
window.resolveMediaUrl = resolveMediaUrl;

/**
 * Upload a file to storage (R2 via presigned PUT, or local fallback).
 * Returns a public URL suitable for storing in builder state / the DB.
 */
async function uploadFile(file, kind, opts) {
  opts = opts || {};
  var authHeaders = opts.token ? { Authorization: "Bearer " + opts.token } : {};
  var signRes = await fetch(API_BASE + "/api/upload/sign", {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, authHeaders),
    body: JSON.stringify({
      kind: kind,
      mime: file.type,
      bytes: file.size,
      creation_id: opts.creationId || null,
      original_name: file.name,
    }),
  });
  if (!signRes.ok) throw new Error("Could not prepare upload");
  var sign = await signRes.json();

  if (sign.storage === "r2" && sign.upload_url) {
    var putRes = await fetch(sign.upload_url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putRes.ok) throw new Error("Upload to storage failed");
    var confirmRes = await fetch(API_BASE + "/api/upload/confirm", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, authHeaders),
      body: JSON.stringify({
        file_id: sign.file_id,
        key: sign.key,
        mime: file.type,
        bytes: file.size,
        kind: kind,
        original_name: file.name,
        creation_id: opts.creationId || null,
      }),
    });
    if (!confirmRes.ok) throw new Error("Could not confirm upload");
    var confirmed = await confirmRes.json();
    return confirmed.file.url;
  }

  // Local fallback (dev / R2 not configured)
  var fd = new FormData();
  fd.append("file", file);
  if (opts.creationId) fd.append("creation_id", opts.creationId);
  var upRes = await fetch(API_BASE + "/api/upload/file", {
    method: "POST",
    headers: authHeaders,
    body: fd,
  });
  if (!upRes.ok) throw new Error("Upload failed");
  var data = await upRes.json();
  return data.file.url;
}
window.LS = { uploadFile: uploadFile };

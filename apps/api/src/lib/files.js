/**
 * Helpers for turning a `files` row into a frontend-friendly object that
 * includes a fully-resolvable URL (R2 public URL or local /uploads path).
 */
const r2 = require("./r2");

function toFileDTO(file) {
  if (!file) return file;
  return {
    id: file.id,
    user_id: file.user_id,
    creation_id: file.creation_id,
    filename: file.filename,
    original_name: file.original_name,
    mime_type: file.mime_type,
    size: file.size,
    storage: file.storage,
    url: r2.resolveUrl(file.storage, file.path),
  };
}

function toFileList(files) {
  return (files || []).map(toFileDTO);
}

module.exports = { toFileDTO, toFileList };

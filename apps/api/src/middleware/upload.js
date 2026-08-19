const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const UPLOAD_DIR = path.join(__dirname, "../../uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const typeDir = ext === ".mp3" || ext === ".wav" || ext === ".ogg" ? "audio" :
                    ext === ".gif" || ext === ".webp" || ext === ".png" || ext === ".jpg" || ext === ".jpeg" ? "images" :
                    "misc";
    const dir = path.join(UPLOAD_DIR, typeDir);
    require("fs").mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = uuidv4() + path.extname(file.originalname).toLowerCase();
    cb(null, unique);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg",
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Unsupported file type"), false);
  }
};

const MAGIC_SIGNATURES = {
  "image/jpeg": [Buffer.from([0xff, 0xd8, 0xff])],
  "image/png": [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  "image/webp": [Buffer.from([0x52, 0x49, 0x46, 0x46]), Buffer.from([0x57, 0x45, 0x42, 0x50])],
  "image/gif": [Buffer.from([0x47, 0x49, 0x46, 0x38])],
  "audio/mpeg": [Buffer.from([0xff, 0xfb]), Buffer.from([0x49, 0x44, 0x33])],
  "audio/mp3": [Buffer.from([0xff, 0xfb]), Buffer.from([0x49, 0x44, 0x33])],
  "audio/wav": [Buffer.from([0x52, 0x49, 0x46, 0x46]), Buffer.from([0x57, 0x41, 0x56, 0x45])],
  "audio/ogg": [Buffer.from([0x4f, 0x67, 0x67, 0x53])],
};

function validateFileContent(filePath, mimetype) {
  const fs = require("fs");
  const buffer = Buffer.alloc(16);
  const fd = fs.openSync(filePath, "r");
  fs.readSync(fd, buffer, 0, 16, 0);
  fs.closeSync(fd);

  const signatures = MAGIC_SIGNATURES[mimetype];
  if (!signatures) return true;

  return signatures.some((sig) => {
    if (buffer.length < sig.length) return false;
    let match = true;
    for (let i = 0; i < sig.length; i++) {
      if (buffer[i] !== sig[i]) {
        match = false;
        break;
      }
    }
    return match;
  });
}

// Hard ceiling is the largest allowed upload (music = 25 MB). Per-kind limits
// are enforced at the /sign + /confirm step via checkMedia; multer only guards
// against pathological sizes.
const upload = multer({ storage, fileFilter, limits: { fileSize: 25 * 1024 * 1024 } });

module.exports = { upload, UPLOAD_DIR, validateFileContent };

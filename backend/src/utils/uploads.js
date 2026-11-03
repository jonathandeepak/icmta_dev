const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config/env");

const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

function ensureUploadDirs() {
  for (const sub of [
  "member_photos",
  "event_posters",
  "payment_proofs",
  "advertisement_banners"
]) {
    fs.mkdirSync(path.join(config.uploadDir, sub), { recursive: true });
  }
}

function saveUploadedFile(file, subdir, allowedMimes, maxBytes) {
  if (!file) return null;
  if (!allowedMimes.includes(file.mimetype)) {
    const err = new Error("Unsupported file type.");
    err.statusCode = 400;
    throw err;
  }
  if (!file.buffer || file.buffer.length === 0) {
    const err = new Error("Uploaded file is empty.");
    err.statusCode = 400;
    throw err;
  }
  if (file.buffer.length > maxBytes) {
    const err = new Error(`File size must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`);
    err.statusCode = 400;
    throw err;
  }

  const originalExt = path.extname(file.originalname || "").toLowerCase();
  const ext = [".jpg", ".jpeg", ".png", ".webp", ".pdf"].includes(originalExt)
    ? originalExt
    : MIME_TO_EXT[file.mimetype];

  const filename = `${crypto.randomBytes(16).toString("hex")}${ext}`;
  const folder = path.join(config.uploadDir, subdir);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, filename), file.buffer);

  return `/uploads/${subdir}/${filename}`;
}

module.exports = { ensureUploadDirs, saveUploadedFile };

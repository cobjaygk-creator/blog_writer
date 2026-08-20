import path from "path";

/** Runtime-local image storage (Railway disk / Docker volume). */
export function localUploadsDir() {
  return path.join(process.cwd(), ".data", "uploads");
}

export function isSafeUploadFilename(name: string) {
  return /^[a-zA-Z0-9._-]+$/.test(name) && !name.includes("..");
}

export function contentTypeForUpload(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const newCutEnv = path.resolve("../new_cut/backend/.env");
const blogEnv = path.resolve(".env");

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    map.set(k, v);
  }
  return map;
}

function upsertEnv(text, updates) {
  const lines = text.split(/\r?\n/);
  const seen = new Set();
  const out = lines.map((line) => {
    const m = line.match(/^([A-Za-z0-9_]+)=/);
    if (!m) return line;
    const key = m[1];
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) out.push(`${key}=${value}`);
  }
  return out.join("\n").replace(/\n+$/, "\n");
}

if (!existsSync(newCutEnv)) {
  console.error("MISSING_NEWCUT_ENV", newCutEnv);
  process.exit(1);
}
if (!existsSync(blogEnv)) {
  console.error("MISSING_BLOG_ENV", blogEnv);
  process.exit(1);
}

const src = parseEnv(readFileSync(newCutEnv, "utf8"));
const openaiKey = (src.get("OPENAI_API_KEY") || "").trim();
const model =
  (src.get("OPENAI_METADATA_MODEL") || src.get("OPENAI_HIGHLIGHT_MODEL") || "gpt-4o-mini").trim();

console.log("OPENAI_API_KEY", openaiKey ? `set(len=${openaiKey.length})` : "empty");
console.log("MODEL", model || "empty");

if (!openaiKey) {
  console.error("NO_OPENAI_KEY");
  process.exit(2);
}

const updates = {
  LLM_API_KEY: openaiKey,
  LLM_BASE_URL: "https://api.openai.com/v1",
  LLM_MODEL: model || "gpt-4o-mini",
  VISION_API_KEY: openaiKey,
  VISION_BASE_URL: "https://api.openai.com/v1",
  VISION_MODEL: model || "gpt-4o-mini",
  INTEGRATIONS_ALLOW_FALLBACK: "false",
};

const next = upsertEnv(readFileSync(blogEnv, "utf8"), updates);
writeFileSync(blogEnv, next);
console.log("UPDATED", Object.keys(updates).join(","));

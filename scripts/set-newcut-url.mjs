import { readFileSync, writeFileSync, existsSync } from "fs";

const blogEnv = ".env";
const value = process.argv[2] || "http://127.0.0.1:5173";

if (!existsSync(blogEnv)) {
  console.error("MISSING_ENV");
  process.exit(1);
}

const text = readFileSync(blogEnv, "utf8");
const key = "NEXT_PUBLIC_NEW_CUT_URL";
let next;
if (new RegExp(`^${key}=`, "m").test(text)) {
  next = text.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
} else {
  next = `${text.trimEnd()}\n${key}=${value}\n`;
}
writeFileSync(blogEnv, next.endsWith("\n") ? next : `${next}\n`);
console.log("SET", key, value);

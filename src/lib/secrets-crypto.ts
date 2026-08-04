import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

function encryptionKey(): Buffer | null {
  const raw = process.env.SECRETS_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return createHash("sha256").update(raw).digest();
}

export function canEncryptSecrets() {
  return Boolean(encryptionKey());
}

export function encryptSecretPayload(payload: Record<string, string>): {
  ciphertext: Buffer;
  iv: Buffer;
} {
  const key = encryptionKey();
  if (!key) throw new Error("SECRETS_ENCRYPTION_KEY가 설정되지 않았습니다.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const enc = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([enc, tag]), iv };
}

export function decryptSecretPayload(ciphertext: Buffer, iv: Buffer): Record<string, string> {
  const key = encryptionKey();
  if (!key) throw new Error("SECRETS_ENCRYPTION_KEY가 설정되지 않았습니다.");
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString("utf8")) as Record<string, string>;
}

export function maskSecret(value: string) {
  const v = value.trim();
  if (v.length <= 4) return "••••";
  return `••••${v.slice(-4)}`;
}

export function hintsFromSecrets(secrets: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(secrets)) {
    if (v) out[k] = maskSecret(v);
  }
  return out;
}

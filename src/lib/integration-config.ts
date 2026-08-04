import { decryptSecretPayload } from "@/lib/secrets-crypto";
import { prisma } from "@/lib/prisma";

export const INTEGRATION_SLOTS = [
  { slot: "llm_gpt", label: "GPT (버전 A)", secretFields: ["apiKey"] },
  { slot: "llm_gemini", label: "Gemini (버전 B)", secretFields: ["apiKey"] },
  { slot: "vision", label: "Vision 캡션", secretFields: ["apiKey"] },
  { slot: "image_gen", label: "AI 이미지", secretFields: ["apiKey"] },
  { slot: "unsplash", label: "Unsplash", secretFields: ["accessKey", "secretKey"] },
  { slot: "tavily", label: "Tavily", secretFields: ["apiKey"] },
  { slot: "storage_s3", label: "S3 스토리지", secretFields: ["accessKey", "secretKey"] },
  { slot: "toss", label: "토스페이먼츠", secretFields: ["secretKey", "webhookSecret"] },
] as const;

export type IntegrationSlot = (typeof INTEGRATION_SLOTS)[number]["slot"];

type CacheEntry = { at: number; secrets: Record<string, string>; publicConfig: Record<string, unknown> };
const cache = new Map<string, CacheEntry>();
const TTL = 60_000;

export function invalidateIntegrationCache(slot?: string) {
  if (slot) cache.delete(slot);
  else cache.clear();
}

async function loadDbSlot(slot: string): Promise<CacheEntry | null> {
  const hit = cache.get(slot);
  if (hit && Date.now() - hit.at < TTL) return hit;

  const row = await prisma.integrationSecret.findUnique({ where: { slot } });
  if (!row || !row.enabled) return null;

  try {
    const secrets = decryptSecretPayload(Buffer.from(row.ciphertext), Buffer.from(row.iv));
    const entry: CacheEntry = {
      at: Date.now(),
      secrets,
      publicConfig: (row.publicConfig as Record<string, unknown>) || {},
    };
    cache.set(slot, entry);
    return entry;
  } catch {
    return null;
  }
}

export async function resolveSecret(
  slot: IntegrationSlot,
  field: string,
  envNames: string[],
): Promise<string> {
  const db = await loadDbSlot(slot);
  const fromDb = db?.secrets[field]?.trim();
  if (fromDb) return fromDb;
  for (const name of envNames) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return "";
}

export async function resolvePublicConfig(slot: IntegrationSlot) {
  const db = await loadDbSlot(slot);
  return db?.publicConfig || {};
}

export async function getLlmGptRuntime() {
  const cfg = await resolvePublicConfig("llm_gpt");
  return {
    apiKey: await resolveSecret("llm_gpt", "apiKey", ["LLM_GPT_API_KEY", "LLM_API_KEY"]),
    baseUrl: String(
      cfg.baseUrl ||
        process.env.LLM_GPT_BASE_URL ||
        process.env.LLM_BASE_URL ||
        "https://api.openai.com/v1",
    ).replace(/\/$/, ""),
    model: String(cfg.model || process.env.LLM_GPT_MODEL || process.env.LLM_MODEL || "gpt-4o-mini"),
  };
}

export async function getLlmGeminiRuntime() {
  const cfg = await resolvePublicConfig("llm_gemini");
  return {
    apiKey: await resolveSecret("llm_gemini", "apiKey", ["LLM_GEMINI_API_KEY"]),
    baseUrl: String(
      cfg.baseUrl ||
        process.env.LLM_GEMINI_BASE_URL ||
        "https://generativelanguage.googleapis.com/v1beta/openai",
    ).replace(/\/$/, ""),
    model: String(cfg.model || process.env.LLM_GEMINI_MODEL || "gemini-2.0-flash"),
  };
}

export async function getUnsplashAccessKey() {
  return resolveSecret("unsplash", "accessKey", ["UNSPLASH_ACCESS_KEY"]);
}

export async function getTavilyApiKey() {
  return resolveSecret("tavily", "apiKey", ["TAVILY_API_KEY"]);
}

export async function getTossKeys() {
  const cfg = await resolvePublicConfig("toss");
  return {
    secretKey: await resolveSecret("toss", "secretKey", ["TOSS_SECRET_KEY"]),
    webhookSecret: await resolveSecret("toss", "webhookSecret", ["TOSS_WEBHOOK_SECRET"]),
    clientKey: String(cfg.clientKey || process.env.TOSS_CLIENT_KEY || ""),
    testMode: Boolean(cfg.testMode ?? process.env.TOSS_SECRET_KEY?.includes("test")),
  };
}

export function sourceLabelForSlot(slot: string, hasDb: boolean, hasEnv: boolean) {
  if (hasDb) return "db";
  if (hasEnv) return "env";
  return "none";
}

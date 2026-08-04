import { requireAdmin, adminJson } from "@/lib/admin";
import { INTEGRATION_SLOTS, sourceLabelForSlot } from "@/lib/integration-config";
import { canEncryptSecrets } from "@/lib/secrets-crypto";
import { prisma } from "@/lib/prisma";

const ENV_HINTS: Record<string, string[]> = {
  llm_gpt: ["LLM_GPT_API_KEY", "LLM_API_KEY"],
  llm_gemini: ["LLM_GEMINI_API_KEY"],
  vision: ["VISION_API_KEY", "LLM_API_KEY"],
  image_gen: ["IMAGE_GEN_API_KEY", "LLM_API_KEY"],
  unsplash: ["UNSPLASH_ACCESS_KEY"],
  tavily: ["TAVILY_API_KEY"],
  storage_s3: ["STORAGE_ACCESS_KEY"],
  toss: ["TOSS_SECRET_KEY"],
};

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const rows = await prisma.integrationSecret.findMany();
  const bySlot = new Map(rows.map((r) => [r.slot, r]));

  const slots = INTEGRATION_SLOTS.map((meta) => {
    const row = bySlot.get(meta.slot);
    const hasEnv = (ENV_HINTS[meta.slot] || []).some((k) => Boolean(process.env[k]?.trim()));
    const hasDb = Boolean(row?.enabled && row.ciphertext);
    return {
      slot: meta.slot,
      label: meta.label,
      secretFields: meta.secretFields,
      source: sourceLabelForSlot(meta.slot, hasDb, hasEnv),
      enabled: row?.enabled ?? true,
      publicConfig: row?.publicConfig || {},
      hintJson: row?.hintJson || {},
      lastVerifiedAt: row?.lastVerifiedAt,
      lastVerifyOk: row?.lastVerifyOk,
      lastVerifyError: row?.lastVerifyError,
      updatedAt: row?.updatedAt,
    };
  });

  return adminJson({
    canEncrypt: canEncryptSecrets(),
    slots,
  });
}

import { prisma } from "@/lib/prisma";

export type ApiSlot =
  | "llm_gpt"
  | "llm_gemini"
  | "vision"
  | "unsplash"
  | "tavily"
  | "image_gen"
  | "storage_s3"
  | "toss";

function utcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function recordUserUsage(
  userId: string,
  delta: {
    postsCreated?: number;
    generates?: number;
    llmInputTokens?: number;
    llmOutputTokens?: number;
    imagesUploaded?: number;
    estCostKrw?: number;
  },
) {
  const day = utcDay();
  await prisma.usageDaily.upsert({
    where: { userId_day: { userId, day } },
    create: {
      userId,
      day,
      postsCreated: delta.postsCreated || 0,
      generates: delta.generates || 0,
      llmInputTokens: delta.llmInputTokens || 0,
      llmOutputTokens: delta.llmOutputTokens || 0,
      imagesUploaded: delta.imagesUploaded || 0,
      estCostKrw: delta.estCostKrw || 0,
    },
    update: {
      postsCreated: { increment: delta.postsCreated || 0 },
      generates: { increment: delta.generates || 0 },
      llmInputTokens: { increment: delta.llmInputTokens || 0 },
      llmOutputTokens: { increment: delta.llmOutputTokens || 0 },
      imagesUploaded: { increment: delta.imagesUploaded || 0 },
      estCostKrw: { increment: delta.estCostKrw || 0 },
    },
  });
}

export async function recordApiUsage(
  slot: ApiSlot,
  delta: {
    requests?: number;
    success?: boolean;
    inputUnits?: number;
    outputUnits?: number;
    estCostKrw?: number;
  },
) {
  const day = utcDay();
  const requests = delta.requests ?? 1;
  const successes = delta.success === false ? 0 : delta.success === true ? requests : 0;
  const failures = delta.success === false ? requests : 0;

  await prisma.apiUsageDaily.upsert({
    where: { day_slot: { day, slot } },
    create: {
      day,
      slot,
      requests,
      successes,
      failures,
      inputUnits: delta.inputUnits || 0,
      outputUnits: delta.outputUnits || 0,
      estCostKrw: delta.estCostKrw || 0,
    },
    update: {
      requests: { increment: requests },
      successes: { increment: successes },
      failures: { increment: failures },
      inputUnits: { increment: delta.inputUnits || 0 },
      outputUnits: { increment: delta.outputUnits || 0 },
      estCostKrw: { increment: delta.estCostKrw || 0 },
    },
  });
}

export async function getUserGeneratesToday(userId: string) {
  const day = utcDay();
  const row = await prisma.usageDaily.findUnique({
    where: { userId_day: { userId, day } },
    select: { generates: true },
  });
  return row?.generates || 0;
}

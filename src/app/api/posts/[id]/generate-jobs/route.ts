import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedPost, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { assertCanGenerate } from "@/lib/plan-guards";
import {
  createGenerationJob,
  toJobPublic,
  type GenerateRequest,
  type GenerateTopicRequest,
} from "@/lib/post-generate-job";
import { TOPIC_LENGTHS } from "@/lib/topic-length";

const providersSchema = z.array(z.enum(["gpt", "gemini"])).min(1).max(2).optional();

const createSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("generate"),
    keyword: z.string().trim().min(1).max(120).optional(),
    productHighlights: z.string().trim().max(2000).optional().nullable(),
    captionTone: z.string().trim().min(1).max(200).optional().nullable(),
    length: z.enum(TOPIC_LENGTHS).optional(),
    providers: providersSchema,
    mergeExistingDrafts: z.boolean().optional(),
    useLearnedSupplement: z.boolean().optional(),
    excludedSupplementPoints: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  }),
  z.object({
    kind: z.literal("generate_topic"),
    topic: z.string().trim().min(2).max(200),
    length: z.enum(TOPIC_LENGTHS).optional(),
    imageCount: z.number().int().min(1).max(6).optional(),
    imageSource: z.enum(["unsplash", "ai"]).optional(),
    replaceImages: z.boolean().optional(),
    providers: providersSchema,
    mergeExistingDrafts: z.boolean().optional(),
  }),
]);

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const genLimit = await assertCanGenerate(userId!);
  if (genLimit) return genLimit;

  const { id } = await params;
  const post = await getOwnedPost(id, userId!);
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return jsonError("요청이 올바르지 않습니다.", 400);
  }

  let requestPayload: GenerateRequest | GenerateTopicRequest;
  if (parsed.data.kind === "generate") {
    const keyword = parsed.data.keyword?.trim() || post.keyword?.trim();
    if (!keyword) return jsonError("키워드가 필요합니다.", 400);
    requestPayload = {
      keyword,
      productHighlights: parsed.data.productHighlights,
      captionTone: parsed.data.captionTone,
      length: parsed.data.length,
      providers: parsed.data.providers,
      mergeExistingDrafts: parsed.data.mergeExistingDrafts,
      useLearnedSupplement: parsed.data.useLearnedSupplement,
      excludedSupplementPoints: parsed.data.excludedSupplementPoints,
    };
  } else {
    requestPayload = {
      topic: parsed.data.topic.trim(),
      length: parsed.data.length,
      imageCount: parsed.data.imageCount,
      imageSource: parsed.data.imageSource,
      replaceImages: parsed.data.replaceImages,
      providers: parsed.data.providers,
      mergeExistingDrafts: parsed.data.mergeExistingDrafts,
    };
  }

  const job = await createGenerationJob({
    postId: id,
    userId: userId!,
    kind: parsed.data.kind,
    request: requestPayload,
  });

  return NextResponse.json({ job: toJobPublic(job) }, { status: 202 });
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedPost, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { assertCanGenerate } from "@/lib/plan-guards";
import {
  createGenerationJob,
  loadPostForJobResult,
  runGenerationJobToCompletion,
  toJobPublic,
} from "@/lib/post-generate-job";
import { TOPIC_LENGTHS } from "@/lib/topic-length";

export const maxDuration = 300;

const generateSchema = z.object({
  keyword: z.string().trim().min(1).max(120).optional(),
  productHighlights: z.string().trim().max(2000).optional().nullable(),
  captionTone: z.string().trim().min(1).max(200).optional().nullable(),
  length: z.enum(TOPIC_LENGTHS).optional(),
  useLearnedSupplement: z.boolean().optional(),
  excludedSupplementPoints: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
});

type Params = { params: Promise<{ id: string }> };

/** Sync compatibility wrapper: create job and tick until done. */
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

  const parsed = generateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return jsonError("keyword가 올바르지 않습니다.", 400);
  }

  const keyword = parsed.data.keyword?.trim() || post.keyword?.trim();
  if (!keyword) {
    return jsonError("키워드가 필요합니다.", 400);
  }

  const job = await createGenerationJob({
    postId: id,
    userId: userId!,
    kind: "generate",
    request: {
      keyword,
      productHighlights: parsed.data.productHighlights,
      captionTone: parsed.data.captionTone,
      length: parsed.data.length,
      useLearnedSupplement: parsed.data.useLearnedSupplement,
      excludedSupplementPoints: parsed.data.excludedSupplementPoints,
    },
  });

  const finished = await runGenerationJobToCompletion(job.id, userId!);
  if (finished.status === "failed") {
    return jsonError(finished.error || "초안 생성에 실패했습니다.", 502);
  }

  const updated = await loadPostForJobResult(id, userId!);
  if (!updated) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const result = toJobPublic(finished).result;
  return NextResponse.json({
    post: updated,
    needsSelection: Boolean(result?.needsSelection),
    drafts: result?.drafts || [],
    productFacts: result?.productFacts,
    meta: result?.meta || {},
    job: toJobPublic(finished),
  });
}

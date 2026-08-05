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

const schema = z.object({
  topic: z.string().trim().min(2).max(200),
  length: z.enum(TOPIC_LENGTHS).optional(),
  imageCount: z.number().int().min(1).max(6).optional(),
  imageSource: z.enum(["unsplash", "ai"]).optional(),
  replaceImages: z.boolean().optional(),
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

  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return jsonError("주제를 2자 이상 입력해 주세요.", 400);
  }

  const job = await createGenerationJob({
    postId: id,
    userId: userId!,
    kind: "generate_topic",
    request: {
      topic: parsed.data.topic.trim(),
      length: parsed.data.length,
      imageCount: parsed.data.imageCount,
      imageSource: parsed.data.imageSource,
      replaceImages: parsed.data.replaceImages,
    },
  });

  const finished = await runGenerationJobToCompletion(job.id, userId!);
  if (finished.status === "failed") {
    return jsonError(finished.error || "글 만들기에 실패했습니다.", 502);
  }

  const updated = await loadPostForJobResult(id, userId!);
  if (!updated) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const result = toJobPublic(finished).result;
  return NextResponse.json({
    post: updated,
    meta: result?.meta || {},
    job: toJobPublic(finished),
  });
}

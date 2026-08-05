import { NextResponse } from "next/server";

import { getOwnedPost, jsonError, requireUserId } from "@/lib/api-helpers";
import { logError } from "@/lib/observability";
import {
  getOwnedGenerationJob,
  tickGenerationJob,
  toJobPublic,
} from "@/lib/post-generate-job";

export const maxDuration = 60;

type Params = { params: Promise<{ id: string; jobId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id, jobId } = await params;
  const post = await getOwnedPost(id, userId!);
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const existing = await getOwnedGenerationJob(jobId, userId!);
  if (!existing || existing.postId !== id) {
    return jsonError("생성 작업을 찾을 수 없습니다.", 404);
  }

  try {
    const job = await tickGenerationJob(jobId, userId!);
    return NextResponse.json({ job: toJobPublic(job) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "생성 진행에 실패했습니다.";
    logError("generate-jobs/tick", message, e, {
      jobId,
      postId: id,
      userId: userId!,
      kind: existing.kind,
      phase: existing.phase,
    });
    return jsonError(message, 502);
  }
}

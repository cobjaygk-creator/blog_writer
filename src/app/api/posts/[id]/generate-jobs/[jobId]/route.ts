import { NextResponse } from "next/server";

import { getOwnedPost, jsonError, requireUserId } from "@/lib/api-helpers";
import {
  findActiveGenerationJob,
  getOwnedGenerationJob,
  toJobPublic,
} from "@/lib/post-generate-job";

type Params = { params: Promise<{ id: string; jobId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id, jobId } = await params;
  const post = await getOwnedPost(id, userId!);
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);

  if (jobId === "active") {
    const active = await findActiveGenerationJob(id, userId!);
    if (!active) return NextResponse.json({ job: null });
    return NextResponse.json({ job: toJobPublic(active) });
  }

  const job = await getOwnedGenerationJob(jobId, userId!);
  if (!job || job.postId !== id) {
    return jsonError("생성 작업을 찾을 수 없습니다.", 404);
  }

  return NextResponse.json({ job: toJobPublic(job) });
}

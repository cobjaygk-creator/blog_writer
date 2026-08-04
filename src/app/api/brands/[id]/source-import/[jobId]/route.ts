import { NextResponse } from "next/server";

import { getOwnedBrand, jsonError, requireUserId } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; jobId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id, jobId } = await params;
  const owned = await getOwnedBrand(id, userId!);
  if (!owned) return jsonError("테마를 찾을 수 없습니다.", 404);

  const job = await prisma.sourceImportJob.findFirst({
    where: { id: jobId, brandId: id },
  });
  if (!job) return jsonError("가져오기 작업을 찾을 수 없습니다.", 404);

  return NextResponse.json({ job });
}

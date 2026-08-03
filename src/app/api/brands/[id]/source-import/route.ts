import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedBrand, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { listRecentNaverPosts, resolveBlogIdFromUrl, toImportItems } from "@/lib/naver-blog";
import { getRemainingSourceSlots } from "@/lib/plan-guards";
import { BULK_IMPORT_TARGET } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  blogUrl: z.string().trim().url(),
  autoLearn: z.boolean().optional(),
  targetCount: z.number().int().min(1).max(BULK_IMPORT_TARGET).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedBrand(id, userId!);
  if (!owned) return jsonError("업체를 찾을 수 없습니다.", 404);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("네이버 블로그 URL이 필요합니다.", 400);
  }

  let blogId: string;
  try {
    blogId = resolveBlogIdFromUrl(parsed.data.blogUrl);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "블로그 URL이 올바르지 않습니다.", 400);
  }

  const remaining = await getRemainingSourceSlots(userId!, id);
  const wanted = Math.min(parsed.data.targetCount ?? BULK_IMPORT_TARGET, BULK_IMPORT_TARGET);
  const slotCap = remaining === null ? wanted : Math.min(wanted, remaining);
  if (slotCap <= 0) {
    return jsonError("원문 등록 한도에 도달했습니다. 플랜을 확인하거나 기존 원문을 삭제해 주세요.", 403);
  }

  let listed;
  try {
    listed = await listRecentNaverPosts(blogId, slotCap);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "글 목록을 가져오지 못했습니다.", 502);
  }

  const items = toImportItems(listed.slice(0, slotCap));
  const job = await prisma.sourceImportJob.create({
    data: {
      brandId: id,
      blogId,
      status: "fetching",
      targetCount: items.length,
      listedCount: items.length,
      itemsJson: items,
      autoLearn: parsed.data.autoLearn ?? true,
    },
  });

  return NextResponse.json({ job }, { status: 201 });
}

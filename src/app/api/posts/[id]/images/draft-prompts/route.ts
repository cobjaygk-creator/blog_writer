import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedPost, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import {
  draftImagePromptsBatch,
  pickSequenceStage,
} from "@/lib/image-prompt-draft";
import {
  filterSameProductSources,
  matchParagraphsToImagePrompts,
  resolveProductKey,
} from "@/lib/learned-supplement";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  keyword: z.string().trim().min(1).max(120).optional(),
  productHighlights: z.string().trim().max(2000).optional().nullable(),
  imageIds: z.array(z.string().min(1)).max(40).optional(),
  overwriteAll: z.boolean().optional(),
  /** Original vision scene text per image (before prompt overwrite). */
  visionByImageId: z.record(z.string(), z.string().max(500)).optional(),
});

type Params = { params: Promise<{ id: string }> };

/**
 * Draft sequence-aware photo prompts (distinct per image).
 * Does not consume generate quota.
 */
export async function POST(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedPost(id, userId!);
  if (!owned) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) return jsonError("요청이 올바르지 않습니다.", 400);

  const post = await prisma.post.findFirst({
    where: { id, brand: { userId: userId! } },
    include: {
      images: { orderBy: { orderIndex: "asc" } },
    },
  });
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);
  if (!post.images.length) {
    return NextResponse.json({ prompts: [], updated: 0 });
  }

  const keyword = parsed.data.keyword?.trim() || post.keyword?.trim() || "";
  if (!keyword) return jsonError("키워드가 필요합니다.", 400);
  const notes =
    parsed.data.productHighlights !== undefined
      ? parsed.data.productHighlights?.trim() || null
      : post.productHighlights;

  const overwriteAll = parsed.data.overwriteAll === true;
  const onlyIds = new Set(parsed.data.imageIds || []);
  const targets = post.images.filter(
    (img) => overwriteAll || onlyIds.size === 0 || onlyIds.has(img.id),
  );
  if (!targets.length) {
    return NextResponse.json({ prompts: [], updated: 0 });
  }

  const sources = await prisma.sourcePost.findMany({
    where: { brandId: post.brandId },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: { id: true, title: true, rawText: true },
  });

  const productKey = resolveProductKey({
    keyword,
    notes,
    productName: keyword,
  });
  const same =
    productKey && productKey.confidence >= 0.55
      ? filterSameProductSources(sources, productKey)
      : [];

  const total = post.images.length;
  const visionMap = parsed.data.visionByImageId || {};

  const batchInputs = post.images.map((img, i) => {
    const stage = pickSequenceStage(i, total);
    const visionCaption = visionMap[img.id]?.trim() || null;
    let learnedHint: string | null = null;
    if (same.length >= 2) {
      const matched = matchParagraphsToImagePrompts(same, [
        `${stage.label} ${stage.intents.join(" ")} ${visionCaption || ""}`,
      ]);
      const pick = matched[i % Math.max(1, matched.length)] || matched[0];
      if (pick?.text) learnedHint = pick.text;
    }
    return {
      id: img.id,
      visionCaption,
      learnedHint,
    };
  });

  const allDrafted = draftImagePromptsBatch({
    keyword,
    notes,
    images: batchInputs,
  });

  const targetIds = new Set(targets.map((t) => t.id));
  const prompts = allDrafted.filter((p) => targetIds.has(p.imageId));

  await prisma.$transaction(
    prompts.map((p) =>
      prisma.postImage.update({
        where: { id: p.imageId },
        data: { caption: p.prompt || null },
      }),
    ),
  );

  return NextResponse.json({ prompts, updated: prompts.length });
}

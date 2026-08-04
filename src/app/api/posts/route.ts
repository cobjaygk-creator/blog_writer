import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { BRAND_CAPTION_TONE } from "@/lib/caption-tones";
import { resolveThemeForPost, USE_DEFAULT_THEME_ID } from "@/lib/default-theme";
import { assertCanCreatePost } from "@/lib/plan-guards";
import { POST_MODES } from "@/lib/post-modes";
import { prisma } from "@/lib/prisma";
import { recordUserUsage } from "@/lib/usage-meter";

const createSchema = z.object({
  brandId: z.string().min(1).optional().nullable(),
  mode: z.enum(POST_MODES).optional(),
  keyword: z.string().trim().min(1).max(120).optional(),
  productHighlights: z.string().trim().min(1).max(2000).optional().nullable(),
  captionTone: z.string().trim().min(1).max(200).optional().nullable(),
});

export async function POST(request: Request) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "요청 형식이 올바르지 않습니다.",
      400,
    );
  }

  let brand;
  try {
    brand = await resolveThemeForPost(
      userId!,
      parsed.data.brandId || USE_DEFAULT_THEME_ID,
    );
  } catch (e) {
    const message =
      e instanceof Error
        ? e.message
        : "테마를 준비하지 못했습니다.";
    return jsonError(message, 400);
  }
  if (!brand) {
    return jsonError("테마를 찾을 수 없습니다.", 404);
  }

  const limitError = await assertCanCreatePost(userId!);
  if (limitError) return limitError;

  const post = await prisma.post.create({
    data: {
      brandId: brand.id,
      mode: parsed.data.mode || "worklog",
      keyword: parsed.data.keyword,
      productHighlights: parsed.data.productHighlights?.trim() || null,
      captionTone: parsed.data.captionTone?.trim() || BRAND_CAPTION_TONE,
      status: "collecting",
    },
  });

  await recordUserUsage(userId!, { postsCreated: 1 }).catch(() => undefined);

  return NextResponse.json({ post }, { status: 201 });
}

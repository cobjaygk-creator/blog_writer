import { NextResponse } from "next/server";

import { getOwnedPost, jsonError, requireUserId } from "@/lib/api-helpers";
import { fetchSourceFromUrl } from "@/lib/fetch-source";
import { assertCanAddSourcePost } from "@/lib/plan-guards";
import { prisma } from "@/lib/prisma";
import { runStyleLearnForBrand } from "@/lib/style-learn";

type Params = { params: Promise<{ id: string }> };

/**
 * Add publishedUrl (or post body) as a brand source, then re-run style learn.
 */
export async function POST(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const post = await prisma.post.findFirst({
    where: { id, brand: { userId: userId! } },
    select: {
      id: true,
      brandId: true,
      title: true,
      body: true,
      publishedUrl: true,
      status: true,
    },
  });
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);
  if (!post.publishedUrl?.trim() && !post.body?.trim()) {
    return jsonError("올린 URL이 없거나 본문이 비어 있습니다.", 400);
  }

  const owned = await getOwnedPost(id, userId!);
  if (!owned) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const limitError = await assertCanAddSourcePost(userId!, post.brandId);
  if (limitError) return limitError;

  let rawText = "";
  let sourceUrl: string | null = post.publishedUrl?.trim() || null;
  let fetchedTitle: string | null = post.title;

  if (sourceUrl) {
    try {
      const fetched = await fetchSourceFromUrl(sourceUrl);
      rawText = fetched.text;
      fetchedTitle = fetched.title || post.title;
      sourceUrl = fetched.sourceUrl;
    } catch (e) {
      // Fall back to editor body if live fetch fails.
      console.warn("[learn-from-publish] fetch failed, using post body:", e);
      rawText = stripHtml(post.body || "");
    }
  } else {
    rawText = stripHtml(post.body || "");
  }

  if (rawText.trim().length < 20) {
    return jsonError("학습에 쓸 본문이 너무 짧습니다.", 400);
  }

  const existing = sourceUrl
    ? await prisma.sourcePost.findFirst({
        where: { brandId: post.brandId, sourceUrl },
        select: { id: true },
      })
    : null;

  let sourcePostId = existing?.id;
  if (!existing) {
    const created = await prisma.sourcePost.create({
      data: {
        brandId: post.brandId,
        rawText,
        sourceUrl,
        title: fetchedTitle,
        publishedAt: new Date(),
      },
    });
    sourcePostId = created.id;
  }

  try {
    const learned = await runStyleLearnForBrand(post.brandId);
    return NextResponse.json({
      ok: true,
      sourcePostId,
      sampleCount: learned.sampleCount,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "스타일 학습에 실패했습니다.";
    return jsonError(message, 502);
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedBrand, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { fetchSourceFromUrl } from "@/lib/fetch-source";
import { indexFieldsFromSourceText } from "@/lib/learned-supplement";
import { assertCanAddSourcePost } from "@/lib/plan-guards";
import { prisma } from "@/lib/prisma";

const createSchema = z
  .object({
    rawText: z.string().trim().max(20000).optional(),
    url: z.string().trim().url().optional(),
  })
  .refine((v) => Boolean(v.rawText?.trim() || v.url?.trim()), {
    message: "rawText 또는 url이 필요합니다.",
  });

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedBrand(id, userId!);
  if (!owned) return jsonError("테마를 찾을 수 없습니다.", 404);

  const sourcePosts = await prisma.sourcePost.findMany({
    where: { brandId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ sourcePosts });
}

export async function POST(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedBrand(id, userId!);
  if (!owned) return jsonError("테마를 찾을 수 없습니다.", 404);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("원문 텍스트(20자+) 또는 블로그 URL이 필요합니다.", 400);
  }

  const limitError = await assertCanAddSourcePost(userId!, id);
  if (limitError) return limitError;

  let rawText = parsed.data.rawText?.trim() || "";
  let sourceUrl: string | null = null;
  let fetchedTitle: string | null = null;

  if (parsed.data.url?.trim()) {
    try {
      const fetched = await fetchSourceFromUrl(parsed.data.url.trim());
      sourceUrl = fetched.sourceUrl;
      fetchedTitle = fetched.title;
      // URL 우선. 텍스트를 같이 보내면 URL 본문 뒤에 보완 텍스트로 붙이지 않고 URL 본문만 사용.
      rawText = fetched.text;
    } catch (e) {
      const message = e instanceof Error ? e.message : "URL에서 원문을 가져오지 못했습니다.";
      return jsonError(message, 502);
    }
  }

  if (rawText.length < 20) {
    return jsonError("원문은 20자 이상이어야 합니다.", 400);
  }

  const sourcePost = await prisma.sourcePost.create({
    data: {
      brandId: id,
      rawText,
      sourceUrl,
      title: fetchedTitle,
    },
  });

  // Best-effort product index (raw SQL — safe if Prisma client is stale).
  const productIndex = indexFieldsFromSourceText(fetchedTitle, rawText);
  if (productIndex.productKey) {
    try {
      await prisma.$executeRaw`
        UPDATE "SourcePost"
        SET vehicle = ${productIndex.vehicle},
            part = ${productIndex.part},
            "productKey" = ${productIndex.productKey}
        WHERE id = ${sourcePost.id}
      `;
    } catch {
      /* optional index */
    }
  }

  return NextResponse.json(
    {
      sourcePost,
      meta: fetchedTitle ? { title: fetchedTitle } : undefined,
    },
    { status: 201 },
  );
}

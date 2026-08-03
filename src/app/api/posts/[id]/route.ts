import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedPost, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().max(100000).optional(),
  keyword: z.string().trim().min(1).max(120).optional().nullable(),
  productHighlights: z.string().trim().max(2000).optional().nullable(),
  /** Ignored — brand learned tone is always used. */
  captionTone: z.string().trim().min(1).max(200).optional().nullable(),
  status: z.enum(["collecting", "draft", "published", "archived"]).optional(),
  headerTemplateId: z.string().min(1).nullable().optional(),
  footerTemplateId: z.string().min(1).nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const post = await getOwnedPost(id, userId!);
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);

  return NextResponse.json({ post });
}

export async function PATCH(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedPost(id, userId!);
  if (!owned) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("유효하지 않은 수정 요청입니다.", 400);
  }

  if (parsed.data.headerTemplateId) {
    const tpl = await prisma.brandTemplate.findFirst({
      where: {
        id: parsed.data.headerTemplateId,
        brandId: owned.brandId,
        kind: "header",
      },
    });
    if (!tpl) return jsonError("머리말 템플릿을 찾을 수 없습니다.", 400);
  }
  if (parsed.data.footerTemplateId) {
    const tpl = await prisma.brandTemplate.findFirst({
      where: {
        id: parsed.data.footerTemplateId,
        brandId: owned.brandId,
        kind: "footer",
      },
    });
    if (!tpl) return jsonError("꼬리말 템플릿을 찾을 수 없습니다.", 400);
  }

  const post = await prisma.post.update({
    where: { id },
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      keyword: parsed.data.keyword === undefined ? undefined : parsed.data.keyword,
      productHighlights:
        parsed.data.productHighlights === undefined
          ? undefined
          : parsed.data.productHighlights?.trim() || null,
      status: parsed.data.status,
      headerTemplateId:
        parsed.data.headerTemplateId === undefined ? undefined : parsed.data.headerTemplateId,
      footerTemplateId:
        parsed.data.footerTemplateId === undefined ? undefined : parsed.data.footerTemplateId,
    },
    include: {
      images: { orderBy: { orderIndex: "asc" } },
      brand: { select: { id: true, name: true } },
      headerTemplate: { select: { id: true, name: true, kind: true, html: true } },
      footerTemplate: { select: { id: true, name: true, kind: true, html: true } },
    },
  });

  return NextResponse.json({ post });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedPost(id, userId!);
  if (!owned) return jsonError("포스트를 찾을 수 없습니다.", 404);

  await prisma.post.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

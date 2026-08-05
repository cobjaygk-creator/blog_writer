import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedPost, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { POST_MODES } from "@/lib/post-modes";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().max(100000).optional(),
  keyword: z.string().trim().min(1).max(120).optional().nullable(),
  productHighlights: z.string().trim().max(2000).optional().nullable(),
  captionTone: z.string().trim().min(1).max(200).optional().nullable(),
  mode: z.enum(POST_MODES).optional(),
  brandId: z.string().min(1).optional(),
  status: z.enum(["collecting", "draft", "published", "archived"]).optional(),
  headerTemplateId: z.string().min(1).nullable().optional(),
  footerTemplateId: z.string().min(1).nullable().optional(),
  publishedUrl: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .refine((v) => v == null || v === "" || /^https?:\/\//i.test(v), {
      message: "URL 형식",
    }),
  publishPlatform: z.enum(["naver", "tistory", "other"]).optional().nullable(),
  clearPublishArchive: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const post = await prisma.post.findFirst({
    where: { id, brand: { userId: userId! } },
    include: {
      images: { orderBy: { orderIndex: "asc" } },
      brand: { select: { id: true, name: true } },
      drafts: { orderBy: { createdAt: "asc" } },
    },
  });
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

  if (parsed.data.brandId && parsed.data.brandId !== owned.brandId) {
    const brand = await prisma.brand.findFirst({
      where: { id: parsed.data.brandId, userId: userId! },
      select: { id: true },
    });
    if (!brand) return jsonError("테마를 찾을 수 없습니다.", 404);
  }

  const nextStatus = parsed.data.status;
  const clearingArchive =
    parsed.data.clearPublishArchive === true || nextStatus === "draft";
  const urlValue =
    parsed.data.publishedUrl === undefined
      ? undefined
      : parsed.data.publishedUrl?.trim() || null;

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
      captionTone:
        parsed.data.captionTone === undefined
          ? undefined
          : parsed.data.captionTone?.trim() || null,
      mode: parsed.data.mode,
      brandId: parsed.data.brandId,
      status: parsed.data.status,
      headerTemplateId:
        parsed.data.headerTemplateId === undefined ? undefined : parsed.data.headerTemplateId,
      footerTemplateId:
        parsed.data.footerTemplateId === undefined ? undefined : parsed.data.footerTemplateId,
      publishedUrl: clearingArchive ? null : urlValue,
      publishPlatform: clearingArchive
        ? null
        : parsed.data.publishPlatform === undefined
          ? undefined
          : parsed.data.publishPlatform,
      publishedAt:
        nextStatus === "published"
          ? new Date()
          : clearingArchive
            ? null
            : undefined,
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

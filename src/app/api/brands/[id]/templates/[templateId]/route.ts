import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedBrand, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

const MAX_TEMPLATE_HTML = 5_000_000;

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  kind: z.enum(["header", "footer"]).optional(),
  html: z.string().min(1).max(MAX_TEMPLATE_HTML).optional(),
});

type Params = { params: Promise<{ id: string; templateId: string }> };

async function getOwnedTemplate(brandId: string, templateId: string, userId: string) {
  const brand = await getOwnedBrand(brandId, userId);
  if (!brand) return null;
  return prisma.brandTemplate.findFirst({
    where: { id: templateId, brandId },
  });
}

export async function GET(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id, templateId } = await params;
  const template = await getOwnedTemplate(id, templateId, userId!);
  if (!template) return jsonError("템플릿을 찾을 수 없습니다.", 404);

  return NextResponse.json({ template });
}

export async function PATCH(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id, templateId } = await params;
  const owned = await getOwnedTemplate(id, templateId, userId!);
  if (!owned) return jsonError("템플릿을 찾을 수 없습니다.", 404);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path.includes("html") && issue.code === "too_big") {
      return jsonError("본문(이미지 포함)이 너무 큽니다. 이미지를 줄이거나 URL로 넣어 주세요.", 400);
    }
    return jsonError("유효하지 않은 수정 요청입니다.", 400);
  }

  const template = await prisma.brandTemplate.update({
    where: { id: templateId },
    data: {
      name: parsed.data.name,
      kind: parsed.data.kind,
      html: parsed.data.html,
    },
  });

  return NextResponse.json({ template });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id, templateId } = await params;
  const owned = await getOwnedTemplate(id, templateId, userId!);
  if (!owned) return jsonError("템플릿을 찾을 수 없습니다.", 404);

  await prisma.brandTemplate.delete({ where: { id: templateId } });
  return NextResponse.json({ ok: true });
}

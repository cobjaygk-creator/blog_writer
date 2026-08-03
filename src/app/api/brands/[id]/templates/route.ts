import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedBrand, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

const MAX_TEMPLATE_HTML = 5_000_000;

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["header", "footer"]),
  // Base64 images in the rich editor can be large.
  html: z.string().min(1).max(MAX_TEMPLATE_HTML),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedBrand(id, userId!);
  if (!owned) return jsonError("업체를 찾을 수 없습니다.", 404);

  const templates = await prisma.brandTemplate.findMany({
    where: { brandId: id },
    orderBy: [{ kind: "asc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json({ templates });
}

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
    const issue = parsed.error.issues[0];
    if (issue?.path.includes("html") && issue.code === "too_big") {
      return jsonError("본문(이미지 포함)이 너무 큽니다. 이미지를 줄이거나 URL로 넣어 주세요.", 400);
    }
    if (issue?.path.includes("name")) {
      return jsonError("템플릿 이름을 입력해 주세요.", 400);
    }
    if (issue?.path.includes("kind")) {
      return jsonError("머리말 또는 꼬리말을 선택해 주세요.", 400);
    }
    if (issue?.path.includes("html")) {
      return jsonError("본문 내용을 입력해 주세요.", 400);
    }
    return jsonError("이름·종류·본문이 필요합니다.", 400);
  }

  const template = await prisma.brandTemplate.create({
    data: {
      brandId: id,
      name: parsed.data.name,
      kind: parsed.data.kind,
      html: parsed.data.html,
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}

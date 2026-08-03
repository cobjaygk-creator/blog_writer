import { NextResponse } from "next/server";

import { getOwnedBrand, jsonError, requireUserId } from "@/lib/api-helpers";
import { runStyleLearnForBrand } from "@/lib/style-learn";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedBrand(id, userId!);
  if (!owned) return jsonError("업체를 찾을 수 없습니다.", 404);

  try {
    const { styleProfile, meta } = await runStyleLearnForBrand(id);
    return NextResponse.json({ styleProfile, meta });
  } catch (e) {
    const message = e instanceof Error ? e.message : "스타일 학습에 실패했습니다.";
    const status = message.includes("원문이 없습니다") ? 400 : 502;
    return jsonError(message, status);
  }
}

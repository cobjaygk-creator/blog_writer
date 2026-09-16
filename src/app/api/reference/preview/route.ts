import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { fetchSourceFromUrl } from "@/lib/fetch-source";
import { summarizeReferenceStructure } from "@/lib/reference-source";

const bodySchema = z.object({
  url: z.string().trim().url().max(2000),
});

export async function POST(request: Request) {
  const { error } = await requireUserId();
  if (error) return error;

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("올바른 URL을 입력해 주세요.", 400);
  }

  try {
    const fetched = await fetchSourceFromUrl(parsed.data.url);
    const structure = summarizeReferenceStructure(fetched.text, fetched.imageCount);
    return NextResponse.json({
      title: fetched.title,
      sourceUrl: fetched.sourceUrl,
      ...structure,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "글을 읽지 못했습니다.";
    return jsonError(message, 422);
  }
}

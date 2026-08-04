import { NextResponse } from "next/server";

import { jsonError, requireUserId } from "@/lib/api-helpers";
import { getUserPlan } from "@/lib/plan-guards";
import { buildNewCutDeepLink } from "@/lib/newcut";
import { signHandoffToken } from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";

/**
 * Issue a short-lived handoff JWT for New Cut (shorts.ditodio.com).
 * Optionally returns a deep link with ?handoff=…
 */
export async function POST(request: Request) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: userId! },
    select: { id: true, email: true, role: true, suspendedAt: true },
  });
  if (!user || user.suspendedAt) return jsonError("사용할 수 없는 계정입니다.", 403);

  const { planCode } = await getUserPlan(user.id);
  let token: string;
  try {
    token = signHandoffToken({
      sub: user.id,
      email: user.email,
      plan: planCode,
      role: user.role,
      ttlSec: 300,
    });
  } catch {
    return jsonError("HANDOFF 서명이 구성되지 않았습니다. AUTH_SECRET을 확인하세요.", 503);
  }

  const url = new URL(request.url);
  const withLink = url.searchParams.get("link") === "1";
  const brandId = url.searchParams.get("brandId") || undefined;
  const postId = url.searchParams.get("postId") || undefined;

  const deepLink = withLink
    ? (() => {
        const base = buildNewCutDeepLink({ from: "ditodio", brandId, postId });
        const u = new URL(base);
        u.searchParams.set("handoff", token);
        return u.toString();
      })()
    : undefined;

  return NextResponse.json({
    handoff: token,
    expiresInSec: 300,
    deepLink,
  });
}

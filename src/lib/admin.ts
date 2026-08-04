import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function requireAdmin() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      user: null,
      error: jsonError("로그인이 필요합니다.", 401),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      plan: true,
      suspendedAt: true,
    },
  });

  if (!user) {
    return { user: null, error: jsonError("사용자를 찾을 수 없습니다.", 401) };
  }

  const isAdmin =
    user.role === "admin" || adminEmails().has(user.email.trim().toLowerCase());

  if (!isAdmin) {
    return { user: null, error: jsonError("관리자 권한이 필요합니다.", 403) };
  }

  if (user.role !== "admin" && adminEmails().has(user.email.trim().toLowerCase())) {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: "admin" },
    });
  }

  return { user: { ...user, role: "admin" as const }, error: null };
}

export async function writeAdminAudit(input: {
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  ip?: string | null;
}) {
  await prisma.adminAuditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      beforeJson: input.beforeJson ?? undefined,
      afterJson: input.afterJson ?? undefined,
      ip: input.ip || undefined,
    },
  });
}

export function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

export function adminJson<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

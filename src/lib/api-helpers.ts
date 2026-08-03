import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { userId: null as string | null, error: jsonError("로그인이 필요합니다.", 401) };
  }
  return { userId, error: null };
}

export async function getOwnedBrand(brandId: string, userId: string) {
  return prisma.brand.findFirst({
    where: { id: brandId, userId },
  });
}

export async function getOwnedPost(postId: string, userId: string) {
  return prisma.post.findFirst({
    where: { id: postId, brand: { userId } },
    include: {
      images: { orderBy: { orderIndex: "asc" } },
      brand: { select: { id: true, name: true, userId: true } },
    },
  });
}

export async function parseJsonBody(request: Request) {
  try {
    return { body: (await request.json()) as unknown, error: null };
  } catch {
    return { body: null, error: jsonError("Invalid JSON body.", 400) };
  }
}

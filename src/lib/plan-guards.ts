import { jsonError } from "@/lib/api-helpers";
import { getPlanLimits, isUnlimitedEmail, startOfUtcDay } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { uploadMaxImagesPerPost } from "@/lib/integrations";

export async function getUserPlan(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, email: true },
  });
  return {
    limits: getPlanLimits(user?.plan, user?.email),
    unlimited: isUnlimitedEmail(user?.email),
  };
}

export async function assertCanCreateBrand(userId: string) {
  const { limits, unlimited } = await getUserPlan(userId);
  if (unlimited) return null;
  const count = await prisma.brand.count({ where: { userId } });
  if (count >= limits.brands) {
    return jsonError(`현재 플랜에서는 업체를 최대 ${limits.brands}개까지 만들 수 있습니다.`, 403);
  }
  return null;
}

export async function assertCanAddSourcePost(userId: string, brandId: string) {
  const remaining = await getRemainingSourceSlots(userId, brandId);
  if (remaining === null) return null;
  if (remaining <= 0) {
    const { limits } = await getUserPlan(userId);
    return jsonError(`현재 플랜에서는 업체당 원문을 최대 ${limits.sourcePostsPerBrand}개까지 등록할 수 있습니다.`, 403);
  }
  return null;
}

/** Remaining source-post slots for a brand. `null` means unlimited. */
export async function getRemainingSourceSlots(userId: string, brandId: string) {
  const { limits, unlimited } = await getUserPlan(userId);
  if (unlimited) return null;
  const count = await prisma.sourcePost.count({ where: { brandId } });
  return Math.max(0, limits.sourcePostsPerBrand - count);
}

export async function assertCanCreatePost(userId: string) {
  const { limits, unlimited } = await getUserPlan(userId);
  if (unlimited) return null;
  const since = startOfUtcDay();
  const count = await prisma.post.count({
    where: {
      brand: { userId },
      createdAt: { gte: since },
    },
  });
  if (count >= limits.postsPerDay) {
    return jsonError(`현재 플랜에서는 하루 포스트를 최대 ${limits.postsPerDay}개까지 만들 수 있습니다.`, 403);
  }
  return null;
}

export async function assertCanAddImage(userId: string, currentImageCount: number) {
  const { limits, unlimited } = await getUserPlan(userId);
  if (unlimited) return null;
  const maxImages = Math.min(limits.imagesPerPost, uploadMaxImagesPerPost());
  if (currentImageCount >= maxImages) {
    return jsonError(`현재 플랜에서는 포스트당 이미지를 최대 ${maxImages}장까지 올릴 수 있습니다.`, 403);
  }
  return null;
}

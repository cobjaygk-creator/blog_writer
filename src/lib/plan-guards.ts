import { jsonError } from "@/lib/api-helpers";
import { getPlanLimits, startOfUtcDay } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { uploadMaxImagesPerPost } from "@/lib/integrations";

export async function getUserPlan(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  return getPlanLimits(user?.plan);
}

export async function assertCanCreateBrand(userId: string) {
  const limits = await getUserPlan(userId);
  const count = await prisma.brand.count({ where: { userId } });
  if (count >= limits.brands) {
    return jsonError(`현재 플랜에서는 업체를 최대 ${limits.brands}개까지 만들 수 있습니다.`, 403);
  }
  return null;
}

export async function assertCanAddSourcePost(userId: string, brandId: string) {
  const limits = await getUserPlan(userId);
  const count = await prisma.sourcePost.count({ where: { brandId } });
  if (count >= limits.sourcePostsPerBrand) {
    return jsonError(`현재 플랜에서는 업체당 원문을 최대 ${limits.sourcePostsPerBrand}개까지 등록할 수 있습니다.`, 403);
  }
  return null;
}

export async function assertCanCreatePost(userId: string) {
  const limits = await getUserPlan(userId);
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
  const limits = await getUserPlan(userId);
  const maxImages = Math.min(limits.imagesPerPost, uploadMaxImagesPerPost());
  if (currentImageCount >= maxImages) {
    return jsonError(`현재 플랜에서는 포스트당 이미지를 최대 ${maxImages}장까지 올릴 수 있습니다.`, 403);
  }
  return null;
}

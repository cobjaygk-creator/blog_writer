import { jsonError } from "@/lib/api-helpers";
import { isUnlimitedEmail, startOfUtcDay, UNLIMITED_LIMITS } from "@/lib/plans";
import { getLimitsForPlanCode } from "@/lib/plan-product";
import { prisma } from "@/lib/prisma";
import { uploadMaxImagesPerPost } from "@/lib/integrations";
import { getUserGeneratesToday } from "@/lib/usage-meter";

async function resolveEffectivePlanCode(user: {
  plan: string;
  email: string;
  planOverrideCode: string | null;
  planOverrideUntil: Date | null;
}) {
  if (
    user.planOverrideCode &&
    (!user.planOverrideUntil || user.planOverrideUntil.getTime() > Date.now())
  ) {
    return user.planOverrideCode;
  }
  return user.plan;
}

export async function getUserPlan(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      email: true,
      planOverrideCode: true,
      planOverrideUntil: true,
      suspendedAt: true,
    },
  });

  if (!user) {
    return {
      limits: await getLimitsForPlanCode("free"),
      unlimited: false,
      suspended: false,
      planCode: "free",
    };
  }

  if (user.suspendedAt) {
    return {
      limits: await getLimitsForPlanCode("free"),
      unlimited: false,
      suspended: true,
      planCode: "free",
    };
  }

  if (isUnlimitedEmail(user.email)) {
    return {
      limits: UNLIMITED_LIMITS,
      unlimited: true,
      suspended: false,
      planCode: user.plan,
    };
  }

  const planCode = await resolveEffectivePlanCode(user);
  return {
    limits: await getLimitsForPlanCode(planCode),
    unlimited: false,
    suspended: false,
    planCode,
  };
}

function suspendedError() {
  return jsonError("계정이 정지되어 있습니다. 고객센터에 문의해 주세요.", 403);
}

export async function assertCanCreateBrand(userId: string) {
  const { limits, unlimited, suspended } = await getUserPlan(userId);
  if (suspended) return suspendedError();
  if (unlimited) return null;
  const count = await prisma.brand.count({ where: { userId } });
  if (count >= limits.brands) {
    return jsonError(`현재 플랜에서는 테마를 최대 ${limits.brands}개까지 만들 수 있습니다.`, 403);
  }
  return null;
}

export async function assertCanAddSourcePost(userId: string, brandId: string) {
  const remaining = await getRemainingSourceSlots(userId, brandId);
  if (remaining === "suspended") return suspendedError();
  if (remaining === null) return null;
  if (remaining <= 0) {
    const { limits } = await getUserPlan(userId);
    return jsonError(
      `현재 플랜에서는 테마당 원문을 최대 ${limits.sourcePostsPerBrand}개까지 등록할 수 있습니다.`,
      403,
    );
  }
  return null;
}

/** Remaining source-post slots for a brand. `null` means unlimited. */
export async function getRemainingSourceSlots(userId: string, brandId: string) {
  const { limits, unlimited, suspended } = await getUserPlan(userId);
  if (suspended) return "suspended" as const;
  if (unlimited) return null;
  const count = await prisma.sourcePost.count({ where: { brandId } });
  return Math.max(0, limits.sourcePostsPerBrand - count);
}

export async function assertCanCreatePost(userId: string) {
  const { limits, unlimited, suspended } = await getUserPlan(userId);
  if (suspended) return suspendedError();
  if (unlimited) return null;
  const since = startOfUtcDay();
  const count = await prisma.post.count({
    where: {
      brand: { userId },
      createdAt: { gte: since },
    },
  });
  if (count >= limits.postsPerDay) {
    return jsonError(
      `현재 플랜에서는 하루 포스트를 최대 ${limits.postsPerDay}개까지 만들 수 있습니다.`,
      403,
    );
  }
  return null;
}

export async function assertCanGenerate(userId: string) {
  const { limits, unlimited, suspended } = await getUserPlan(userId);
  if (suspended) return suspendedError();
  if (unlimited) return null;
  const used = await getUserGeneratesToday(userId);
  if (used >= limits.generatesPerDay) {
    return jsonError(
      `현재 플랜에서는 하루 초안 생성을 최대 ${limits.generatesPerDay}회까지 할 수 있습니다.`,
      403,
    );
  }
  return null;
}

export async function assertCanAddImage(userId: string, currentImageCount: number) {
  const { limits, unlimited, suspended } = await getUserPlan(userId);
  if (suspended) return suspendedError();
  if (unlimited) return null;
  const maxImages = Math.min(limits.imagesPerPost, uploadMaxImagesPerPost());
  if (currentImageCount >= maxImages) {
    return jsonError(`현재 플랜에서는 포스트당 이미지를 최대 ${maxImages}장까지 올릴 수 있습니다.`, 403);
  }
  return null;
}

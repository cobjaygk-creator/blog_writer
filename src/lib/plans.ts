export type PlanId = "free" | "lite" | "pro";

export type PlanLimits = {
  brands: number;
  sourcePostsPerBrand: number;
  postsPerDay: number;
  imagesPerPost: number;
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    brands: 2,
    sourcePostsPerBrand: 5,
    postsPerDay: 5,
    imagesPerPost: 8,
  },
  lite: {
    brands: 10,
    sourcePostsPerBrand: 20,
    postsPerDay: 30,
    imagesPerPost: 20,
  },
  pro: {
    brands: 100,
    sourcePostsPerBrand: 100,
    postsPerDay: 200,
    imagesPerPost: 40,
  },
};

export function normalizePlan(plan?: string | null): PlanId {
  if (plan === "lite" || plan === "pro") return plan;
  return "free";
}

export function getPlanLimits(plan?: string | null): PlanLimits {
  return PLAN_LIMITS[normalizePlan(plan)];
}

export function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

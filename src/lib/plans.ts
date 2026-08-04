export type PlanId = "free" | "lite" | "pro";

export type PlanLimits = {
  brands: number;
  sourcePostsPerBrand: number;
  postsPerDay: number;
  imagesPerPost: number;
  generatesPerDay: number;
  /** Dual GPT+Gemini draft generation (gating reserved; currently always on). */
  dualGenerationEnabled: boolean;
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    brands: 2,
    sourcePostsPerBrand: 5,
    postsPerDay: 5,
    imagesPerPost: 8,
    generatesPerDay: 10,
    dualGenerationEnabled: true,
  },
  lite: {
    brands: 10,
    sourcePostsPerBrand: 100,
    postsPerDay: 30,
    imagesPerPost: 20,
    generatesPerDay: 60,
    dualGenerationEnabled: true,
  },
  pro: {
    brands: 100,
    sourcePostsPerBrand: 100,
    postsPerDay: 200,
    imagesPerPost: 40,
    generatesPerDay: 300,
    dualGenerationEnabled: true,
  },
};

/** Default / hard cap for Naver blog bulk import. */
export const BULK_IMPORT_TARGET = 100;
export const STYLE_LEARN_SAMPLE_SIZE = 20;
export const STYLE_LEARN_MIN_CHARS = 200;

/** Accounts that bypass all plan usage caps. Empty when env unset. */
const UNLIMITED_EMAILS = new Set(
  (process.env.UNLIMITED_USER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export const UNLIMITED_LIMITS: PlanLimits = {
  brands: Number.MAX_SAFE_INTEGER,
  sourcePostsPerBrand: Number.MAX_SAFE_INTEGER,
  postsPerDay: Number.MAX_SAFE_INTEGER,
  imagesPerPost: Number.MAX_SAFE_INTEGER,
  generatesPerDay: Number.MAX_SAFE_INTEGER,
  dualGenerationEnabled: true,
};

export function isUnlimitedEmail(email?: string | null): boolean {
  if (!email) return false;
  return UNLIMITED_EMAILS.has(email.trim().toLowerCase());
}

export function normalizePlan(plan?: string | null): PlanId {
  if (plan === "lite" || plan === "pro") return plan;
  return "free";
}

/** Sync fallback — prefer getUserPlan / getLimitsForPlanCode for DB-backed limits. */
export function getPlanLimits(plan?: string | null, email?: string | null): PlanLimits {
  if (isUnlimitedEmail(email)) return UNLIMITED_LIMITS;
  return PLAN_LIMITS[normalizePlan(plan)];
}

export function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

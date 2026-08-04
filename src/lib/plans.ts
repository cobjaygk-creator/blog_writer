export type PlanId = "free" | "lite" | "pro";

export const DITODIO_PRODUCT_CODE = "ditodio";

export type PlanLimits = {
  brands: number;
  sourcePostsPerBrand: number;
  /** Soft daily cap (abuse prevention). */
  postsPerDay: number;
  postsPerMonth: number;
  shortsPerMonth: number;
  imagesPerPost: number;
  generatesPerDay: number;
  /** Dual GPT+Gemini draft generation (gating reserved; currently always on). */
  dualGenerationEnabled: boolean;
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    brands: 1,
    sourcePostsPerBrand: 5,
    postsPerDay: 5,
    postsPerMonth: 15,
    shortsPerMonth: 3,
    imagesPerPost: 8,
    generatesPerDay: 10,
    dualGenerationEnabled: true,
  },
  lite: {
    brands: 5,
    sourcePostsPerBrand: 100,
    postsPerDay: 10,
    postsPerMonth: 60,
    shortsPerMonth: 20,
    imagesPerPost: 20,
    generatesPerDay: 60,
    dualGenerationEnabled: true,
  },
  pro: {
    brands: 30,
    sourcePostsPerBrand: 100,
    postsPerDay: 30,
    postsPerMonth: 200,
    shortsPerMonth: 80,
    imagesPerPost: 40,
    generatesPerDay: 300,
    dualGenerationEnabled: true,
  },
};

/** Seed prices for Ditodio unified catalog (KRW, tax included). */
export const PLAN_PRICES: Record<
  PlanId,
  { priceMonthlyKrw: number; priceYearlyKrw: number | null; isPurchasable: boolean }
> = {
  free: { priceMonthlyKrw: 0, priceYearlyKrw: null, isPurchasable: false },
  lite: { priceMonthlyKrw: 29_000, priceYearlyKrw: 290_000, isPurchasable: true },
  pro: { priceMonthlyKrw: 79_000, priceYearlyKrw: 790_000, isPurchasable: true },
};

export const PLAN_NAMES: Record<PlanId, string> = {
  free: "Free",
  lite: "Lite",
  pro: "Pro",
};

export const PLAN_DESCRIPTIONS: Record<PlanId, string> = {
  free: "Ditodio 통합 체험 — 포스트 + 쇼츠 소량",
  lite: "Ditodio 통합 — 포스트·쇼츠를 함께 쓰는 개인·소상공인 플랜",
  pro: "Ditodio 통합 — 대행·헤비용 포스트·쇼츠 한도",
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
  postsPerMonth: Number.MAX_SAFE_INTEGER,
  shortsPerMonth: Number.MAX_SAFE_INTEGER,
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

/** Calendar-month period start (UTC) for free-tier metering. */
export function startOfUtcMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function limitsToJson(limits: PlanLimits): Record<string, unknown> {
  return {
    postsPerMonth: limits.postsPerMonth,
    shortsPerMonth: limits.shortsPerMonth,
    brandsLimit: limits.brands,
    sourcePostsPerBrand: limits.sourcePostsPerBrand,
    postsPerDay: limits.postsPerDay,
    imagesPerPost: limits.imagesPerPost,
    generatesPerDay: limits.generatesPerDay,
    dualGenerationEnabled: limits.dualGenerationEnabled,
  };
}

export function limitsFromJson(
  json: unknown,
  fallback: PlanLimits,
): PlanLimits {
  const o = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const num = (k: string, d: number) => {
    const v = o[k];
    return typeof v === "number" && Number.isFinite(v) ? v : d;
  };
  return {
    brands: num("brandsLimit", fallback.brands),
    sourcePostsPerBrand: num("sourcePostsPerBrand", fallback.sourcePostsPerBrand),
    postsPerDay: num("postsPerDay", fallback.postsPerDay),
    postsPerMonth: num("postsPerMonth", fallback.postsPerMonth),
    shortsPerMonth: num("shortsPerMonth", fallback.shortsPerMonth),
    imagesPerPost: num("imagesPerPost", fallback.imagesPerPost),
    generatesPerDay: num("generatesPerDay", fallback.generatesPerDay),
    dualGenerationEnabled:
      typeof o.dualGenerationEnabled === "boolean"
        ? o.dualGenerationEnabled
        : fallback.dualGenerationEnabled,
  };
}

import type { PlanLimits } from "@/lib/plans";
import { PLAN_LIMITS, type PlanId, normalizePlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export type PlanProductRow = {
  id: string;
  code: string;
  name: string;
  brandsLimit: number;
  sourcePostsPerBrand: number;
  postsPerDay: number;
  imagesPerPost: number;
  generatesPerDay: number;
  dualGenerationEnabled: boolean;
  priceMonthlyKrw: number;
  priceYearlyKrw: number | null;
  isPublic: boolean;
  isPurchasable: boolean;
  active: boolean;
  trialDays: number;
  sortOrder: number;
  description: string | null;
};

let cache: { at: number; rows: PlanProductRow[] } | null = null;
const TTL_MS = 60_000;

export function invalidatePlanProductCache() {
  cache = null;
}

export async function ensurePlanProductsSeeded() {
  const count = await prisma.planProduct.count();
  if (count > 0) return;

  const seeds: Array<{
    code: PlanId;
    name: string;
    priceMonthlyKrw: number;
    priceYearlyKrw: number | null;
    isPurchasable: boolean;
    generatesPerDay: number;
    sortOrder: number;
  }> = [
    {
      code: "free",
      name: "Free",
      priceMonthlyKrw: 0,
      priceYearlyKrw: null,
      isPurchasable: false,
      generatesPerDay: 10,
      sortOrder: 0,
    },
    {
      code: "lite",
      name: "Lite",
      priceMonthlyKrw: 19_900,
      priceYearlyKrw: 199_000,
      isPurchasable: true,
      generatesPerDay: 60,
      sortOrder: 1,
    },
    {
      code: "pro",
      name: "Pro",
      priceMonthlyKrw: 49_900,
      priceYearlyKrw: 499_000,
      isPurchasable: true,
      generatesPerDay: 300,
      sortOrder: 2,
    },
  ];

  for (const s of seeds) {
    const limits = PLAN_LIMITS[s.code];
    await prisma.planProduct.create({
      data: {
        code: s.code,
        name: s.name,
        brandsLimit: limits.brands,
        sourcePostsPerBrand: limits.sourcePostsPerBrand,
        postsPerDay: limits.postsPerDay,
        imagesPerPost: limits.imagesPerPost,
        dualGenerationEnabled: limits.dualGenerationEnabled,
        generatesPerDay: s.generatesPerDay,
        priceMonthlyKrw: s.priceMonthlyKrw,
        priceYearlyKrw: s.priceYearlyKrw,
        isPurchasable: s.isPurchasable,
        isPublic: true,
        active: true,
        sortOrder: s.sortOrder,
        taxIncluded: true,
      },
    });
  }
  invalidatePlanProductCache();
}

export async function listPlanProducts(force = false): Promise<PlanProductRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  await ensurePlanProductsSeeded();
  const rows = await prisma.planProduct.findMany({
    orderBy: { sortOrder: "asc" },
  });
  const mapped = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    brandsLimit: r.brandsLimit,
    sourcePostsPerBrand: r.sourcePostsPerBrand,
    postsPerDay: r.postsPerDay,
    imagesPerPost: r.imagesPerPost,
    generatesPerDay: r.generatesPerDay,
    dualGenerationEnabled: r.dualGenerationEnabled,
    priceMonthlyKrw: r.priceMonthlyKrw,
    priceYearlyKrw: r.priceYearlyKrw,
    isPublic: r.isPublic,
    isPurchasable: r.isPurchasable,
    active: r.active,
    trialDays: r.trialDays,
    sortOrder: r.sortOrder,
    description: r.description,
  }));
  cache = { at: Date.now(), rows: mapped };
  return mapped;
}

export function productToLimits(row: PlanProductRow): PlanLimits & { generatesPerDay: number } {
  return {
    brands: row.brandsLimit,
    sourcePostsPerBrand: row.sourcePostsPerBrand,
    postsPerDay: row.postsPerDay,
    imagesPerPost: row.imagesPerPost,
    dualGenerationEnabled: row.dualGenerationEnabled,
    generatesPerDay: row.generatesPerDay,
  };
}

export async function getLimitsForPlanCode(code: string) {
  const products = await listPlanProducts();
  const row = products.find((p) => p.code === code && p.active);
  if (row) return productToLimits(row);
  const fallback = PLAN_LIMITS[normalizePlan(code)];
  return { ...fallback, generatesPerDay: code === "pro" ? 300 : code === "lite" ? 60 : 10 };
}

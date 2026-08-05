import type { PlanLimits } from "@/lib/plans";
import {
  DITODIO_PRODUCT_CODE,
  PLAN_DESCRIPTIONS,
  PLAN_LIMITS,
  PLAN_NAMES,
  PLAN_PRICES,
  limitsFromJson,
  limitsToJson,
  type PlanId,
  normalizePlan,
} from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export type PlanProductRow = {
  id: string;
  productCode: string;
  code: string;
  name: string;
  brandsLimit: number;
  sourcePostsPerBrand: number;
  postsPerDay: number;
  postsPerMonth: number;
  shortsPerMonth: number;
  imagesPerPost: number;
  generatesPerDay: number;
  dualGenerationEnabled: boolean;
  limitsJson: Record<string, unknown>;
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

function mapRow(r: {
  id: string;
  productCode: string;
  code: string;
  name: string;
  brandsLimit: number;
  sourcePostsPerBrand: number;
  postsPerDay: number;
  imagesPerPost: number;
  generatesPerDay: number;
  dualGenerationEnabled: boolean;
  limitsJson: unknown;
  priceMonthlyKrw: number;
  priceYearlyKrw: number | null;
  isPublic: boolean;
  isPurchasable: boolean;
  active: boolean;
  trialDays: number;
  sortOrder: number;
  description: string | null;
}): PlanProductRow {
  const fallback = PLAN_LIMITS[normalizePlan(r.code)];
  const fromJson = limitsFromJson(r.limitsJson, fallback);
  const limitsJson =
    r.limitsJson && typeof r.limitsJson === "object"
      ? (r.limitsJson as Record<string, unknown>)
      : limitsToJson(fallback);

  return {
    id: r.id,
    productCode: r.productCode,
    code: r.code,
    name: r.name,
    brandsLimit: r.brandsLimit || fromJson.brands,
    sourcePostsPerBrand: r.sourcePostsPerBrand || fromJson.sourcePostsPerBrand,
    postsPerDay: r.postsPerDay || fromJson.postsPerDay,
    postsPerMonth: fromJson.postsPerMonth,
    shortsPerMonth: fromJson.shortsPerMonth,
    imagesPerPost: r.imagesPerPost || fromJson.imagesPerPost,
    generatesPerDay: r.generatesPerDay || fromJson.generatesPerDay,
    dualGenerationEnabled: r.dualGenerationEnabled,
    limitsJson,
    priceMonthlyKrw: r.priceMonthlyKrw,
    priceYearlyKrw: r.priceYearlyKrw,
    isPublic: r.isPublic,
    isPurchasable: r.isPurchasable,
    active: r.active,
    trialDays: r.trialDays,
    sortOrder: r.sortOrder,
    description: r.description,
  };
}

async function ensureProductRegistry() {
  await prisma.product.upsert({
    where: { code: DITODIO_PRODUCT_CODE },
    create: { code: DITODIO_PRODUCT_CODE, name: "Ditodio" },
    update: { name: "Ditodio" },
  });
}

/** Seed Ditodio unified plan catalog; backfill limitsJson once if missing monthly meters. */
export async function ensurePlanProductsSeeded() {
  await ensureProductRegistry();

  const seeds: PlanId[] = ["free", "lite", "pro"];
  for (const code of seeds) {
    const limits = PLAN_LIMITS[code];
    const prices = PLAN_PRICES[code];
    const limitsJson = limitsToJson(limits);
    const existing = await prisma.planProduct.findUnique({
      where: { productCode_code: { productCode: DITODIO_PRODUCT_CODE, code } },
    });

    if (!existing) {
      await prisma.planProduct.create({
        data: {
          productCode: DITODIO_PRODUCT_CODE,
          code,
          name: PLAN_NAMES[code],
          description: PLAN_DESCRIPTIONS[code],
          brandsLimit: limits.brands,
          sourcePostsPerBrand: limits.sourcePostsPerBrand,
          postsPerDay: limits.postsPerDay,
          imagesPerPost: limits.imagesPerPost,
          dualGenerationEnabled: limits.dualGenerationEnabled,
          generatesPerDay: limits.generatesPerDay,
          limitsJson,
          priceMonthlyKrw: prices.priceMonthlyKrw,
          priceYearlyKrw: prices.priceYearlyKrw,
          isPurchasable: prices.isPurchasable,
          isPublic: true,
          active: true,
          sortOrder: code === "free" ? 0 : code === "lite" ? 1 : 2,
          taxIncluded: true,
        },
      });
      continue;
    }

    const lj =
      existing.limitsJson && typeof existing.limitsJson === "object"
        ? (existing.limitsJson as Record<string, unknown>)
        : {};
    if (typeof lj.postsPerMonth !== "number" || typeof lj.shortsPerMonth !== "number") {
      await prisma.planProduct.update({
        where: { id: existing.id },
        data: {
          description: existing.description || PLAN_DESCRIPTIONS[code],
          brandsLimit: limits.brands,
          sourcePostsPerBrand: limits.sourcePostsPerBrand,
          postsPerDay: limits.postsPerDay,
          imagesPerPost: limits.imagesPerPost,
          dualGenerationEnabled: limits.dualGenerationEnabled,
          generatesPerDay: limits.generatesPerDay,
          limitsJson,
          priceMonthlyKrw: prices.priceMonthlyKrw,
          priceYearlyKrw: prices.priceYearlyKrw,
        },
      });
    } else if (
      code === "free" &&
      existing.dualGenerationEnabled !== limits.dualGenerationEnabled
    ) {
      // Align free dual gate with product policy (admin may re-toggle afterwards).
      await prisma.planProduct.update({
        where: { id: existing.id },
        data: {
          dualGenerationEnabled: limits.dualGenerationEnabled,
          limitsJson: { ...lj, dualGenerationEnabled: limits.dualGenerationEnabled },
        },
      });
    }
  }
  invalidatePlanProductCache();
}

export async function listPlanProducts(
  force = false,
  productCode = DITODIO_PRODUCT_CODE,
): Promise<PlanProductRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return cache.rows.filter((r) => r.productCode === productCode);
  }
  await ensurePlanProductsSeeded();
  const rows = await prisma.planProduct.findMany({
    where: { productCode },
    orderBy: { sortOrder: "asc" },
  });
  const mapped = rows.map(mapRow);
  cache = { at: Date.now(), rows: mapped };
  return mapped;
}

export function productToLimits(row: PlanProductRow): PlanLimits {
  return {
    brands: row.brandsLimit,
    sourcePostsPerBrand: row.sourcePostsPerBrand,
    postsPerDay: row.postsPerDay,
    postsPerMonth: row.postsPerMonth,
    shortsPerMonth: row.shortsPerMonth,
    imagesPerPost: row.imagesPerPost,
    dualGenerationEnabled: row.dualGenerationEnabled,
    generatesPerDay: row.generatesPerDay,
  };
}

export async function getLimitsForPlanCode(code: string, productCode = DITODIO_PRODUCT_CODE) {
  const products = await listPlanProducts(false, productCode);
  const row = products.find((p) => p.code === code && p.active);
  if (row) return productToLimits(row);
  return PLAN_LIMITS[normalizePlan(code)];
}

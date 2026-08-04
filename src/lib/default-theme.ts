import { assertCanCreateBrand } from "@/lib/plan-guards";
import { prisma } from "@/lib/prisma";
import { emptyStyleTraits } from "@/lib/style-traits";

/** Sentinel brandId from the client: create/use the user's default theme. */
export const USE_DEFAULT_THEME_ID = "__default__";

export const DEFAULT_THEME_NAME = "기본 테마";

/** Ensure a brand has at least a minimal style profile so posts can be created. */
export async function ensureMinimalStyleProfile(brandId: string) {
  const existing = await prisma.styleProfile.findUnique({
    where: { brandId },
    select: { id: true },
  });
  if (existing) return existing;

  const traits = emptyStyleTraits();
  return prisma.styleProfile.create({
    data: {
      brandId,
      summaryText:
        "기본 문체 프로필입니다. 테마에서 샘플 원문을 학습하면 더 잘 맞추어집니다.",
      sampleAnchors: [],
      traitsJson: traits,
      version: 1,
    },
  });
}

/** Get or create the user's default theme with a minimal style profile. */
export async function ensureDefaultTheme(userId: string) {
  const found = await prisma.brand.findFirst({
    where: { userId, name: DEFAULT_THEME_NAME },
    orderBy: { createdAt: "asc" },
  });
  if (found) {
    await ensureMinimalStyleProfile(found.id);
    return found;
  }

  const limitError = await assertCanCreateBrand(userId);
  if (limitError) {
    const any = await prisma.brand.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    if (any) {
      await ensureMinimalStyleProfile(any.id);
      return any;
    }
    throw new Error(
      "테마를 만들 수 없습니다. 플랜 한도를 확인해 주세요.",
    );
  }

  const brand = await prisma.brand.create({
    data: { userId, name: DEFAULT_THEME_NAME },
  });
  await ensureMinimalStyleProfile(brand.id);
  return brand;
}

/**
 * Resolve which theme (Brand) to attach a new post to.
 * Missing / default sentinel -> default theme.
 */
export async function resolveThemeForPost(
  userId: string,
  brandId?: string | null,
) {
  if (brandId && brandId !== USE_DEFAULT_THEME_ID) {
    const brand = await prisma.brand.findFirst({
      where: { id: brandId, userId },
    });
    if (!brand) return null;
    await ensureMinimalStyleProfile(brand.id);
    return brand;
  }
  return ensureDefaultTheme(userId);
}

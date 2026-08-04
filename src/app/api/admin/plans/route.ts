import { z } from "zod";

import { adminJson, clientIp, requireAdmin, writeAdminAudit } from "@/lib/admin";
import { jsonError, parseJsonBody } from "@/lib/api-helpers";
import { limitsToJson } from "@/lib/plans";
import { invalidatePlanProductCache, listPlanProducts } from "@/lib/plan-product";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const plans = await listPlanProducts(true);
  return adminJson({ plans, product: "ditodio", note: "Ditodio 통합 요금제 (포스트 + 쇼츠)" });
}

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(5000).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isPublic: z.boolean().optional(),
  isPurchasable: z.boolean().optional(),
  brandsLimit: z.number().int().min(0).optional(),
  sourcePostsPerBrand: z.number().int().min(0).optional(),
  postsPerDay: z.number().int().min(0).optional(),
  postsPerMonth: z.number().int().min(0).optional(),
  shortsPerMonth: z.number().int().min(0).optional(),
  imagesPerPost: z.number().int().min(0).optional(),
  generatesPerDay: z.number().int().min(0).optional(),
  dualGenerationEnabled: z.boolean().optional(),
  priceMonthlyKrw: z.number().int().min(0).optional(),
  priceYearlyKrw: z.number().int().min(0).optional().nullable(),
  trialDays: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  taxIncluded: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError("요금제 수정 요청이 올바르지 않습니다.", 400);

  const before = await prisma.planProduct.findUnique({ where: { id: parsed.data.id } });
  if (!before) return jsonError("요금제를 찾을 수 없습니다.", 404);

  const {
    id,
    postsPerMonth,
    shortsPerMonth,
    brandsLimit,
    sourcePostsPerBrand,
    postsPerDay,
    imagesPerPost,
    generatesPerDay,
    dualGenerationEnabled,
    ...rest
  } = parsed.data;

  const prevLimits =
    before.limitsJson && typeof before.limitsJson === "object"
      ? (before.limitsJson as Record<string, unknown>)
      : {};

  const nextBrands = brandsLimit ?? before.brandsLimit;
  const nextSource = sourcePostsPerBrand ?? before.sourcePostsPerBrand;
  const nextPostsDay = postsPerDay ?? before.postsPerDay;
  const nextImages = imagesPerPost ?? before.imagesPerPost;
  const nextGen = generatesPerDay ?? before.generatesPerDay;
  const nextDual = dualGenerationEnabled ?? before.dualGenerationEnabled;
  const nextPostsMonth =
    postsPerMonth ??
    (typeof prevLimits.postsPerMonth === "number" ? prevLimits.postsPerMonth : nextPostsDay * 30);
  const nextShortsMonth =
    shortsPerMonth ??
    (typeof prevLimits.shortsPerMonth === "number" ? prevLimits.shortsPerMonth : 0);

  const limitsJson = limitsToJson({
    brands: nextBrands,
    sourcePostsPerBrand: nextSource,
    postsPerDay: nextPostsDay,
    postsPerMonth: nextPostsMonth,
    shortsPerMonth: nextShortsMonth,
    imagesPerPost: nextImages,
    generatesPerDay: nextGen,
    dualGenerationEnabled: nextDual,
  });

  const after = await prisma.planProduct.update({
    where: { id },
    data: {
      ...rest,
      brandsLimit: nextBrands,
      sourcePostsPerBrand: nextSource,
      postsPerDay: nextPostsDay,
      imagesPerPost: nextImages,
      generatesPerDay: nextGen,
      dualGenerationEnabled: nextDual,
      limitsJson,
    },
  });
  invalidatePlanProductCache();

  await writeAdminAudit({
    actorId: user!.id,
    action: "plan.update",
    targetType: "PlanProduct",
    targetId: id,
    beforeJson: before,
    afterJson: after,
    ip: clientIp(request),
  });

  return adminJson({ plan: after });
}

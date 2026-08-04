import { NextResponse } from "next/server";
import { z } from "zod";

import { getMeterUsed, incrementMeter, type UsageMeter } from "@/lib/entitlements";
import { jsonError, parseJsonBody } from "@/lib/api-helpers";
import { assertCanCreateShort, getUserPlan } from "@/lib/plan-guards";
import { resolvePlatformActor } from "@/lib/platform-auth";

const schema = z.object({
  meter: z.enum(["posts", "shorts", "generates"]),
  delta: z.number().int().min(1).max(100).optional(),
  /** If true, check limit then increment. Default true. */
  commit: z.boolean().optional(),
});

/**
 * New Cut / platform apps: record Ditodio meter usage.
 * Auth: session, x-ditodio-handoff, or PLATFORM_SERVICE_TOKEN + X-User-Id.
 */
export async function POST(request: Request) {
  const actor = await resolvePlatformActor(request);
  if (!actor) return jsonError("인증이 필요합니다.", 401);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("usage 요청이 올바르지 않습니다.", 400);

  const meter = parsed.data.meter as UsageMeter;
  const delta = parsed.data.delta ?? 1;
  const commit = parsed.data.commit !== false;

  if (meter === "shorts") {
    const blocked = await assertCanCreateShort(actor.userId);
    if (blocked) return blocked;
  } else {
    const { limits, unlimited, suspended } = await getUserPlan(actor.userId);
    if (suspended) return jsonError("계정이 정지되어 있습니다.", 403);
    if (!unlimited) {
      const { used } = await getMeterUsed(actor.userId, meter);
      const limit =
        meter === "posts" ? limits.postsPerMonth : limits.generatesPerDay;
      if (used + delta > limit) {
        return jsonError(`한도를 초과했습니다. (${meter}: ${used}/${limit})`, 403);
      }
    }
  }

  if (!commit) {
    const { used, periodStart } = await getMeterUsed(actor.userId, meter);
    return NextResponse.json({ ok: true, committed: false, meter, used, periodStart });
  }

  const { used, periodStart } = await incrementMeter(actor.userId, meter, delta);
  return NextResponse.json({
    ok: true,
    committed: true,
    meter,
    used,
    periodStart: periodStart.toISOString(),
  });
}

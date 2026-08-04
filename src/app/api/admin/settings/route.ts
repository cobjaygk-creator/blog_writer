import { z } from "zod";

import { adminJson, clientIp, requireAdmin, writeAdminAudit } from "@/lib/admin";
import { jsonError, parseJsonBody } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const rows = await prisma.adminSetting.findMany();
  const settings: Record<string, unknown> = {};
  for (const r of rows) settings[r.key] = r.valueJson;

  return adminJson({
    settings: {
      "billing.enabled": settings["billing.enabled"] ?? true,
      "billing.testMode": settings["billing.testMode"] ?? true,
      "tax.notice": settings["tax.notice"] ?? "",
      "support.email": settings["support.email"] ?? "",
      "llm.cost.gpt.inputPer1k": settings["llm.cost.gpt.inputPer1k"] ?? 2,
      "llm.cost.gpt.outputPer1k": settings["llm.cost.gpt.outputPer1k"] ?? 8,
      "llm.cost.gemini.inputPer1k": settings["llm.cost.gemini.inputPer1k"] ?? 1,
      "llm.cost.gemini.outputPer1k": settings["llm.cost.gemini.outputPer1k"] ?? 4,
      ...settings,
    },
  });
}

const patchSchema = z.object({
  settings: z.record(z.unknown()),
});

export async function PATCH(request: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError("설정 요청이 올바르지 않습니다.", 400);

  for (const [key, valueJson] of Object.entries(parsed.data.settings)) {
    await prisma.adminSetting.upsert({
      where: { key },
      create: { key, valueJson: valueJson as never },
      update: { valueJson: valueJson as never },
    });
  }

  await writeAdminAudit({
    actorId: user!.id,
    action: "settings.update",
    targetType: "AdminSetting",
    afterJson: parsed.data.settings,
    ip: clientIp(request),
  });

  return adminJson({ ok: true });
}

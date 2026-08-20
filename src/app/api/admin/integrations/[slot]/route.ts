import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { adminJson, clientIp, requireAdmin, writeAdminAudit } from "@/lib/admin";
import { jsonError, parseJsonBody } from "@/lib/api-helpers";
import { INTEGRATION_SLOTS, invalidateIntegrationCache } from "@/lib/integration-config";
import {
  canEncryptSecrets,
  encryptSecretPayload,
  decryptSecretPayload,
  hintsFromSecrets,
} from "@/lib/secrets-crypto";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ slot: string }> };

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  publicConfig: z.record(z.string(), z.unknown()).optional(),
  secrets: z.record(z.string(), z.string()).optional(),
  label: z.string().trim().min(1).max(80).optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const { slot } = await params;
  const meta = INTEGRATION_SLOTS.find((s) => s.slot === slot);
  if (!meta) return jsonError("알 수 없는 연동 슬롯입니다.", 404);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError("연동 설정이 올바르지 않습니다.", 400);

  const hasNewSecrets =
    parsed.data.secrets && Object.values(parsed.data.secrets).some((v) => v.trim());
  if (hasNewSecrets && !canEncryptSecrets()) {
    return jsonError("SECRETS_ENCRYPTION_KEY가 없어 키를 저장할 수 없습니다.", 503);
  }

  const existing = await prisma.integrationSecret.findUnique({ where: { slot } });
  if (!existing && !hasNewSecrets && !canEncryptSecrets()) {
    return jsonError("SECRETS_ENCRYPTION_KEY가 없어 연동을 저장할 수 없습니다.", 503);
  }

  let ciphertext = existing ? Buffer.from(existing.ciphertext) : Buffer.alloc(0);
  let iv = existing ? Buffer.from(existing.iv) : Buffer.alloc(0);
  let hintJson = (existing?.hintJson as Record<string, string>) || {};

  if (hasNewSecrets || !existing) {
    let secrets: Record<string, string> = {};
    if (existing && canEncryptSecrets()) {
      try {
        secrets = decryptSecretPayload(Buffer.from(existing.ciphertext), Buffer.from(existing.iv));
      } catch {
        secrets = {};
      }
    }
    if (parsed.data.secrets) {
      for (const [k, v] of Object.entries(parsed.data.secrets)) {
        if (v.trim()) secrets[k] = v.trim();
      }
    }
    const enc = encryptSecretPayload(secrets);
    ciphertext = Buffer.from(enc.ciphertext);
    iv = Buffer.from(enc.iv);
    hintJson = hintsFromSecrets(secrets);
  }

  const publicConfig = (parsed.data.publicConfig ??
    existing?.publicConfig ??
    {}) as Prisma.InputJsonValue;
  const label = parsed.data.label || meta.label;
  const enabled = parsed.data.enabled ?? existing?.enabled ?? true;
  const hintJsonValue = hintJson as Prisma.InputJsonValue;

  const row = await prisma.integrationSecret.upsert({
    where: { slot },
    create: {
      slot,
      label,
      ciphertext,
      iv,
      publicConfig,
      enabled,
      hintJson: hintJsonValue,
      updatedById: user!.id,
    },
    update: {
      label,
      ciphertext,
      iv,
      publicConfig,
      enabled,
      hintJson: hintJsonValue,
      updatedById: user!.id,
    },
  });

  invalidateIntegrationCache(slot);
  await writeAdminAudit({
    actorId: user!.id,
    action: "integration.update",
    targetType: "IntegrationSecret",
    targetId: slot,
    afterJson: {
      enabled: row.enabled,
      hintJson: row.hintJson,
      publicConfig: row.publicConfig,
    },
    ip: clientIp(request),
  });

  return adminJson({
    slot,
    enabled: row.enabled,
    hintJson: row.hintJson,
    publicConfig: row.publicConfig,
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const { slot } = await params;
  await prisma.integrationSecret.deleteMany({ where: { slot } });
  invalidateIntegrationCache(slot);
  await writeAdminAudit({
    actorId: user!.id,
    action: "integration.clear",
    targetType: "IntegrationSecret",
    targetId: slot,
    ip: clientIp(request),
  });
  return adminJson({ ok: true });
}

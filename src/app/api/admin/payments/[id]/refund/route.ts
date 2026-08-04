import { z } from "zod";

import { adminJson, clientIp, requireAdmin, writeAdminAudit } from "@/lib/admin";
import { jsonError, parseJsonBody } from "@/lib/api-helpers";
import { getTossKeys } from "@/lib/integration-config";
import { fetchWithTimeout } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  amountKrw: z.number().int().positive().optional(),
  reason: z.string().trim().max(200).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) return jsonError("결제를 찾을 수 없습니다.", 404);
  if (payment.status !== "paid" && payment.status !== "partial_refund") {
    return jsonError("환불 가능한 결제 상태가 아닙니다.", 400);
  }
  if (!payment.tossPaymentKey) {
    return jsonError("토스 paymentKey가 없어 환불할 수 없습니다.", 400);
  }

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return jsonError("환불 요청이 올바르지 않습니다.", 400);

  const keys = await getTossKeys();
  if (!keys.secretKey) return jsonError("Toss 시크릿 키가 없습니다.", 503);

  const amount = parsed.data.amountKrw || payment.amountKrw;
  const auth = Buffer.from(`${keys.secretKey}:`).toString("base64");
  const res = await fetchWithTimeout(
    `https://api.tosspayments.com/v1/payments/${payment.tossPaymentKey}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cancelReason: parsed.data.reason || "관리자 환불",
        cancelAmount: amount,
      }),
    },
    30_000,
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return jsonError(`토스 환불 실패 (${res.status}): ${detail.slice(0, 160)}`, 502);
  }

  const full = amount >= payment.amountKrw;
  const updated = await prisma.payment.update({
    where: { id },
    data: {
      status: full ? "refunded" : "partial_refund",
      refundedAt: new Date(),
    },
  });

  await writeAdminAudit({
    actorId: user!.id,
    action: "payment.refund",
    targetType: "Payment",
    targetId: id,
    afterJson: { amountKrw: amount, status: updated.status },
    ip: clientIp(request),
  });

  return adminJson({ payment: updated });
}

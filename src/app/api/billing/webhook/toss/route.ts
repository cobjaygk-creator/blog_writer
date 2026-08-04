import { NextResponse } from "next/server";

import { getTossKeys } from "@/lib/integration-config";
import { prisma } from "@/lib/prisma";
import { recordApiUsage } from "@/lib/usage-meter";

/**
 * Toss webhook receiver. Verifies presence of secret config; stores payment updates idempotently.
 * Configure endpoint URL in Toss dashboard → /api/billing/webhook/toss
 */
export async function POST(request: Request) {
  const keys = await getTossKeys();
  if (!keys.secretKey) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  await recordApiUsage("toss", { success: true }).catch(() => undefined);

  const eventType = String(payload.eventType || payload.type || "");
  const data = (payload.data || payload) as Record<string, unknown>;
  const paymentKey = typeof data.paymentKey === "string" ? data.paymentKey : null;
  const orderId = typeof data.orderId === "string" ? data.orderId : null;
  const status = String(data.status || "").toUpperCase();

  if (paymentKey || orderId) {
    const existing = await prisma.payment.findFirst({
      where: {
        OR: [
          paymentKey ? { tossPaymentKey: paymentKey } : undefined,
          orderId ? { tossOrderId: orderId } : undefined,
        ].filter(Boolean) as Array<{ tossPaymentKey?: string; tossOrderId?: string }>,
      },
    });

    if (existing) {
      let nextStatus = existing.status;
      if (status.includes("DONE") || status.includes("PAID") || eventType.includes("DONE")) {
        nextStatus = "paid";
      } else if (status.includes("CANCELED") || eventType.includes("CANCEL")) {
        nextStatus = "refunded";
      } else if (status.includes("ABORTED") || status.includes("EXPIRED")) {
        nextStatus = "failed";
      }

      await prisma.payment.update({
        where: { id: existing.id },
        data: {
          status: nextStatus,
          rawWebhookJson: payload,
          paidAt: nextStatus === "paid" ? existing.paidAt || new Date() : existing.paidAt,
          refundedAt: nextStatus === "refunded" ? new Date() : existing.refundedAt,
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}

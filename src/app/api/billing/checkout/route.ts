import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { getTossKeys } from "@/lib/integration-config";
import { fetchWithTimeout } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { ensurePlanProductsSeeded } from "@/lib/plan-product";

const schema = z.object({
  planCode: z.enum(["lite", "pro"]),
  interval: z.enum(["monthly", "yearly"]).optional(),
  authKey: z.string().min(1),
  customerKey: z.string().min(1),
});

/**
 * Confirm Toss billing authKey → billingKey, charge first period, activate subscription.
 * Client obtains authKey via Toss Billing widget / requestBillingAuth.
 */
export async function POST(request: Request) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const setting = await prisma.adminSetting.findUnique({ where: { key: "billing.enabled" } });
  if (setting && setting.valueJson === false) {
    return jsonError("현재 결제가 비활성화되어 있습니다.", 403);
  }

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("결제 요청이 올바르지 않습니다.", 400);

  await ensurePlanProductsSeeded();
  const product = await prisma.planProduct.findUnique({
    where: { code: parsed.data.planCode },
  });
  if (!product || !product.isPurchasable || !product.active) {
    return jsonError("구매할 수 없는 요금제입니다.", 400);
  }

  const interval = parsed.data.interval || "monthly";
  const amount =
    interval === "yearly" && product.priceYearlyKrw
      ? product.priceYearlyKrw
      : product.priceMonthlyKrw;
  if (amount <= 0) return jsonError("결제 금액이 올바르지 않습니다.", 400);

  const keys = await getTossKeys();
  if (!keys.secretKey || !keys.clientKey) {
    return jsonError("결제 키가 설정되지 않았습니다.", 503);
  }

  const auth = Buffer.from(`${keys.secretKey}:`).toString("base64");
  const issueRes = await fetchWithTimeout(
    "https://api.tosspayments.com/v1/billing/authorizations/issue",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        authKey: parsed.data.authKey,
        customerKey: parsed.data.customerKey,
      }),
    },
    30_000,
  );

  if (!issueRes.ok) {
    return jsonError("빌링키 발급에 실패했습니다.", 502);
  }

  const issued = (await issueRes.json()) as { billingKey?: string };
  if (!issued.billingKey) return jsonError("빌링키를 받지 못했습니다.", 502);

  const orderId = `bw_${userId!.slice(0, 8)}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const chargeRes = await fetchWithTimeout(
    `https://api.tosspayments.com/v1/billing/${issued.billingKey}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerKey: parsed.data.customerKey,
        amount,
        orderId,
        orderName: `blog_writer ${product.name} ${interval}`,
      }),
    },
    30_000,
  );

  if (!chargeRes.ok) {
    return jsonError("첫 결제에 실패했습니다.", 502);
  }

  const charged = (await chargeRes.json()) as {
    paymentKey?: string;
    method?: string;
    receipt?: { url?: string };
  };

  const now = new Date();
  const periodEnd = new Date(now);
  if (interval === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  const subscription = await prisma.subscription.create({
    data: {
      userId: userId!,
      planProductId: product.id,
      status: "active",
      interval,
      tossBillingKey: issued.billingKey,
      tossCustomerKey: parsed.data.customerKey,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  await prisma.payment.create({
    data: {
      userId: userId!,
      subscriptionId: subscription.id,
      status: "paid",
      amountKrw: amount,
      tossPaymentKey: charged.paymentKey,
      tossOrderId: orderId,
      method: charged.method,
      receiptUrl: charged.receipt?.url,
      paidAt: now,
    },
  });

  await prisma.user.update({
    where: { id: userId! },
    data: {
      plan: product.code as "lite" | "pro",
      tossCustomerKey: parsed.data.customerKey,
    },
  });

  return NextResponse.json({
    ok: true,
    subscriptionId: subscription.id,
    clientKey: keys.clientKey,
  });
}

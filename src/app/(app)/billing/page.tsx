import { CancelSubscriptionButton } from "@/components/studio/CancelSubscriptionButton";
import { auth } from "@/lib/auth";
import { getEntitlementSnapshot } from "@/lib/entitlements";
import { getUserPlan } from "@/lib/plan-guards";
import { listPlanProducts } from "@/lib/plan-product";
import { prisma } from "@/lib/prisma";

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  paid: "완료",
  failed: "실패",
  canceled: "취소",
  refunded: "환불",
  partial_refund: "부분환불",
};

function last12MonthKeys() {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function monthLabel(key: string) {
  return `${Number(key.slice(5, 7))}월`;
}

function monthKeyOf(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function BillingPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const { limits, planCode, unlimited } = await getUserPlan(userId);

  const [products, subscription, payments, monthlyRows, entitlement] = await Promise.all([
    listPlanProducts().then((rows) => rows.filter((p) => p.isPublic && p.active)),
    prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { planProduct: true },
    }),
    prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        status: true,
        amountKrw: true,
        paidAt: true,
        createdAt: true,
        subscription: { select: { planProduct: { select: { name: true } }, interval: true } },
      },
    }),
    prisma.usagePeriod.findMany({
      where: { userId, meter: "posts" },
      select: { periodStart: true, used: true },
    }),
    getEntitlementSnapshot(userId, limits),
  ]);

  const monthKeys = last12MonthKeys();
  const byMonth = new Map(monthlyRows.map((r) => [monthKeyOf(r.periodStart), r.used]));
  const monthlyUsage = monthKeys.map((k) => byMonth.get(k) ?? 0);
  const maxUsage = Math.max(1, ...monthlyUsage);
  const currentMonthKey = monthKeys[monthKeys.length - 1];
  const prevMonthKey = monthKeys[monthKeys.length - 2];

  const nextBillingDate = subscription?.currentPeriodEnd
    ? subscription.currentPeriodEnd.toLocaleDateString("ko-KR")
    : null;
  const nextBillingAmount = subscription?.planProduct.priceMonthlyKrw ?? null;
  const canCancel = subscription?.status === "active" && !subscription.cancelAtPeriodEnd;

  const chartW = 600;
  const chartH = 180;
  const barW = 34;
  const gap = (chartW - barW * 12) / 11;

  return (
    <main className="flex w-full flex-col gap-[18px] p-[22px_24px]">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[11.5px] text-[var(--faint)]">
          {unlimited
            ? "사용한도 무제한 계정"
            : nextBillingDate
              ? `다음 결제 ${nextBillingDate} · ${(nextBillingAmount ?? 0).toLocaleString()}원`
              : "구독 중인 유료 플랜이 없습니다."}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {products.map((p) => {
          const isCurrent = p.code === planCode;
          return (
            <div
              key={p.code}
              className={
                isCurrent
                  ? "relative flex flex-col gap-3 rounded-[12px] border border-[#16161A] bg-[#16161A] p-[18px]"
                  : "flex flex-col gap-3 rounded-[12px] border border-[var(--border)] bg-white p-[18px]"
              }
            >
              {isCurrent ? (
                <span className="absolute right-4 top-4 flex h-5 items-center rounded-[5px] bg-[var(--accent)] px-2 text-[10px] font-bold text-white">
                  현재 이용 중
                </span>
              ) : null}
              <div className="flex flex-col gap-0.5">
                <span
                  className={
                    isCurrent
                      ? "text-[12px] font-bold tracking-[.05em] text-[#8B7CFF]"
                      : "text-[12px] font-bold tracking-[.05em] text-[var(--faint)]"
                  }
                >
                  {p.name.toUpperCase()}
                </span>
                <div className="flex items-baseline gap-1">
                  <span
                    className={
                      isCurrent
                        ? "[font-variant-numeric:tabular-nums] text-[25px] font-bold tracking-[-.03em] text-white"
                        : "[font-variant-numeric:tabular-nums] text-[25px] font-bold tracking-[-.03em] text-[var(--foreground)]"
                    }
                  >
                    {p.priceMonthlyKrw.toLocaleString()}
                  </span>
                  <span className={isCurrent ? "text-[12px] text-[#8B8B98]" : "text-[12px] text-[var(--faint)]"}>
                    원 / 월
                  </span>
                </div>
              </div>
              <div
                className={
                  isCurrent
                    ? "flex flex-col gap-1.5 text-[12px] text-[#C9C9D4]"
                    : "flex flex-col gap-1.5 text-[12px] text-[var(--muted)]"
                }
              >
                <span>블로그 글 {p.postsPerMonth}편</span>
                <span>쇼츠 {p.shortsPerMonth}편</span>
                <span>테마 {p.brandsLimit}개</span>
              </div>
              <div className="mt-auto">
                {isCurrent && canCancel ? (
                  <CancelSubscriptionButton />
                ) : isCurrent ? (
                  <span className="flex h-8 items-center justify-center rounded-[8px] bg-[#2A2A34] text-[12px] font-medium text-[#C9C9D4]">
                    {subscription?.cancelAtPeriodEnd ? "해지 예약됨" : "무료 플랜"}
                  </span>
                ) : (
                  <span
                    title="카드 등록 결제는 Toss 빌링 위젯 연동 후 이용할 수 있습니다."
                    className="flex h-8 cursor-not-allowed items-center justify-center rounded-[8px] border border-[var(--border)] text-[12px] font-medium text-[var(--hint)]"
                  >
                    {p.priceMonthlyKrw === 0 ? "다운그레이드" : "이 요금제로 변경"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-4">
        <div className="flex flex-col gap-4 rounded-[12px] border border-[var(--border)] bg-white p-[18px]">
          <div className="flex items-center">
            <span className="text-[12.5px] font-bold text-[var(--foreground)]">월별 사용량</span>
            <span className="ml-auto text-[11px] text-[var(--faint)]">최근 12개월 · 블로그 글</span>
          </div>
          <div className="flex flex-col gap-2">
            <svg width="100%" height={chartH} viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none">
              <line x1="0" y1={chartH - 1} x2={chartW} y2={chartH - 1} stroke="#E4E4E9" strokeWidth="1" />
              {monthlyUsage.map((v, i) => {
                const h = (v / maxUsage) * (chartH - 12);
                const x = i * (barW + gap);
                const key = monthKeys[i];
                const color =
                  key === currentMonthKey ? "#4B3BFF" : key === prevMonthKey ? "#D8D8DE" : "#EDEDF1";
                return (
                  <rect key={key} x={x} y={chartH - h} width={barW} height={h} rx="3" fill={color} />
                );
              })}
            </svg>
            <div className="[font-variant-numeric:tabular-nums] flex justify-between text-[10px] text-[var(--hint)]">
              {monthKeys.map((k) => (
                <span key={k}>{monthLabel(k)}</span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-[#F0F0F3] pt-3.5">
            {(
              [
                ["블로그 글", entitlement.meters.posts],
                ["쇼츠", entitlement.meters.shorts],
                ["생성", entitlement.meters.generates],
              ] as const
            ).map(([label, meter]) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--faint)]">{label}</span>
                <div className="flex items-baseline gap-1">
                  <span className="[font-variant-numeric:tabular-nums] text-[17px] font-bold text-[var(--foreground)]">
                    {meter.used}
                  </span>
                  <span className="[font-variant-numeric:tabular-nums] text-[11px] text-[var(--faint)]">
                    / {meter.limit === Number.MAX_SAFE_INTEGER ? "∞" : meter.limit}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-[#EDEDF1]">
                  <div
                    className="h-full rounded-full bg-[var(--foreground)]"
                    style={{
                      width: `${meter.limit > 0 && meter.limit !== Number.MAX_SAFE_INTEGER ? Math.min(100, Math.round((meter.used / meter.limit) * 100)) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col overflow-hidden rounded-[12px] border border-[var(--border)] bg-white">
          <div className="flex h-10 shrink-0 items-center border-b border-[var(--border)] px-4">
            <span className="text-[12.5px] font-bold text-[var(--foreground)]">결제 내역</span>
          </div>
          {payments.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-[var(--muted)]">결제 내역이 없습니다.</p>
          ) : (
            payments.map((pmt) => (
              <div
                key={pmt.id}
                className="grid h-[46px] items-center gap-0 border-b border-[#F4F4F6] px-4 last:border-b-0"
                style={{ gridTemplateColumns: "1fr 78px 62px" }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[12px] font-semibold text-[var(--foreground)]">
                    {(pmt.paidAt ?? pmt.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                  <span className="text-[10.5px] text-[var(--faint)]">
                    {pmt.subscription?.planProduct.name
                      ? `${pmt.subscription.planProduct.name} ${pmt.subscription.interval === "yearly" ? "연간" : "월간"}`
                      : "-"}
                  </span>
                </div>
                <span className="[font-variant-numeric:tabular-nums] text-right text-[12px] font-semibold text-[var(--foreground)]">
                  {pmt.amountKrw.toLocaleString()}
                </span>
                <span
                  className={
                    pmt.status === "paid"
                      ? "text-right text-[11px] font-semibold text-[#0F7B52]"
                      : pmt.status === "failed"
                        ? "text-right text-[11px] font-semibold text-[#C2453C]"
                        : "text-right text-[11px] font-semibold text-[var(--faint)]"
                  }
                >
                  {PAYMENT_STATUS_LABEL[pmt.status] ?? pmt.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}

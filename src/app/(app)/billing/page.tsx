"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Product = {
  code: string;
  name: string;
  description?: string | null;
  priceMonthlyKrw: number;
  priceYearlyKrw: number | null;
  brandsLimit: number;
  generatesPerDay: number;
  postsPerDay: number;
  postsPerMonth: number;
  shortsPerMonth: number;
  isPurchasable: boolean;
};

export default function BillingPage() {
  const [planCode, setPlanCode] = useState("free");
  const [products, setProducts] = useState<Product[]>([]);
  const [subscription, setSubscription] = useState<Record<string, unknown> | null>(null);
  const [limits, setLimits] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/billing/portal");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "불러오기 실패");
      return;
    }
    setPlanCode(data.planCode || "free");
    setProducts(data.products || []);
    setSubscription(data.subscription);
    setLimits(data.limits || null);
  }

  useEffect(() => {
    void load();
  }, []);

  async function cancel() {
    if (!confirm("기간 종료 시 해지되도록 예약할까요?")) return;
    const res = await fetch("/api/billing/cancel", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "해지 실패");
      return;
    }
    setMsg("기간 말 해지가 예약되었습니다.");
    await load();
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-zinc-900">Ditodio 요금 · 구독</h1>
      <p className="mt-2 text-sm text-zinc-600">
        포스트와 쇼츠를 한 요금제로 이용합니다. 현재 플랜: <strong>{planCode}</strong>
        {subscription ? (
          <span className="ml-2 text-zinc-500">
            · 구독 {String((subscription as { status?: string }).status)}
          </span>
        ) : null}
      </p>
      {limits ? (
        <p className="mt-1 text-xs text-zinc-500">
          한도 — 포스트/월 {limits.postsPerMonth} · 쇼츠/월 {limits.shortsPerMonth} · 테마{" "}
          {limits.brands}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {msg ? <p className="mt-3 text-sm text-emerald-700">{msg}</p> : null}

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {products.map((p) => (
          <Card key={p.code}>
            <CardHeader>
              <CardTitle>{p.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-600">
              <p className="text-lg font-semibold text-zinc-900">
                {p.priceMonthlyKrw === 0
                  ? "무료"
                  : `월 ${p.priceMonthlyKrw.toLocaleString()}원`}
              </p>
              <p>포스트 {p.postsPerMonth}/월</p>
              <p>쇼츠 {p.shortsPerMonth}/월</p>
              <p>테마 {p.brandsLimit}</p>
              {p.description ? <p className="text-xs text-zinc-500">{p.description}</p> : null}
              {p.isPurchasable ? (
                <p className="text-xs text-zinc-500">
                  카드 등록 결제는 Toss 빌링 위젯 연동 후 checkout API로 완료합니다.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {subscription && !(subscription as { cancelAtPeriodEnd?: boolean }).cancelAtPeriodEnd ? (
        <div className="mt-6">
          <Button type="button" variant="outline" onClick={() => void cancel()}>
            기간 말 해지 예약
          </Button>
        </div>
      ) : null}
    </main>
  );
}

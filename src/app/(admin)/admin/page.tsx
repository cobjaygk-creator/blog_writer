"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Stats = {
  growth: {
    newUsers: number;
    totalUsers: number;
    postsCreated: number;
    shortsCreated?: number;
    generates: number;
  };
  revenue: {
    mrr: number;
    activeSubscriptions: number;
    paidCount: number;
    paidAmountKrw: number;
    failedCount: number;
  };
  cost: { estCostKrw: number };
  today: { generates: number; estCostKrw: number };
  plans: Array<{ plan: string; count: number }>;
};

function won(n: number) {
  return `${n.toLocaleString("ko-KR")}원`;
}

export default function AdminHomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/stats?days=7");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "통계를 불러오지 못했습니다.");
        return;
      }
      setStats(data as Stats);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Ditodio 관리 개요</h1>
        <p className="mt-1 text-sm text-zinc-600">
          통합 요금제 · 포스트/쇼츠 사용량 · 최근 7일 스냅샷
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi title="MRR" value={stats ? won(stats.revenue.mrr) : "…"} />
        <Kpi title="유료 구독" value={stats ? String(stats.revenue.activeSubscriptions) : "…"} />
        <Kpi title="오늘 생성" value={stats ? String(stats.today.generates) : "…"} />
        <Kpi title="7일 추정 원가" value={stats ? won(stats.cost.estCostKrw) : "…"} />
        <Kpi title="신규 가입(7일)" value={stats ? String(stats.growth.newUsers) : "…"} />
        <Kpi title="전체 회원" value={stats ? String(stats.growth.totalUsers) : "…"} />
        <Kpi title="포스트(7일)" value={stats ? String(stats.growth.postsCreated) : "…"} />
        <Kpi
          title="쇼츠 미터(7일)"
          value={stats ? String(stats.growth.shortsCreated ?? 0) : "…"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>플랜 분포</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(stats?.plans || []).map((p) => (
            <Badge key={p.plan}>
              {p.plan} · {p.count}
            </Badge>
          ))}
          {!stats?.plans?.length ? <p className="text-sm text-zinc-500">데이터 없음</p> : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="underline" href="/admin/stats">
          통계 상세
        </Link>
        <Link className="underline" href="/admin/usage">
          API 사용량
        </Link>
        <Link className="underline" href="/admin/integrations">
          연동·API 키
        </Link>
        <Link className="underline" href="/admin/payments">
          결제
        </Link>
      </div>
    </div>
  );
}

function Kpi({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-zinc-500">{title}</p>
        <p className="mt-1 text-xl font-semibold text-zinc-900">{value}</p>
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Stats = {
  growth: { newUsers: number; totalUsers: number; postsCreated: number; generates: number };
  revenue: {
    mrr: number;
    activeSubscriptions: number;
    paidCount: number;
    paidAmountKrw: number;
    failedCount: number;
  };
  cost: { estCostKrw: number; llmInputTokens: number; llmOutputTokens: number };
  apiUsage: Array<{
    slot: string;
    day: string;
    requests: number;
    successes: number;
    failures: number;
    estCostKrw: number;
  }>;
  plans: Array<{ plan: string; count: number }>;
};

export default function AdminStatsPage() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setError(null);
      const res = await fetch(`/api/admin/stats?days=${days}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "불러오기 실패");
        return;
      }
      setStats(data as Stats);
    })();
  }, [days]);

  const slotAgg = new Map<string, { req: number; fail: number; cost: number }>();
  for (const r of stats?.apiUsage || []) {
    const cur = slotAgg.get(r.slot) || { req: 0, fail: 0, cost: 0 };
    cur.req += r.requests;
    cur.fail += r.failures;
    cur.cost += r.estCostKrw;
    slotAgg.set(r.slot, cur);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">주요 통계</h1>
          <p className="mt-1 text-sm text-zinc-600">성장 · 매출 · 원가 · 연동 API</p>
        </div>
        <label className="text-sm text-zinc-700">
          기간{" "}
          <select
            className="ml-2 rounded-md border border-zinc-200 px-2 py-1.5"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>7일</option>
            <option value={30}>30일</option>
            <option value={90}>90일</option>
          </select>
        </label>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>성장</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-zinc-700">
            <Row k="신규 가입" v={stats?.growth.newUsers} />
            <Row k="전체 회원" v={stats?.growth.totalUsers} />
            <Row k="글 생성" v={stats?.growth.postsCreated} />
            <Row k="초안 생성 횟수" v={stats?.growth.generates} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>매출</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-zinc-700">
            <Row k="MRR" v={stats ? `${stats.revenue.mrr.toLocaleString()}원` : undefined} />
            <Row k="유료 구독" v={stats?.revenue.activeSubscriptions} />
            <Row
              k="결제 성공액"
              v={stats ? `${stats.revenue.paidAmountKrw.toLocaleString()}원` : undefined}
            />
            <Row k="결제 실패" v={stats?.revenue.failedCount} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>원가</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-zinc-700">
            <Row
              k="추정 원가"
              v={stats ? `${stats.cost.estCostKrw.toLocaleString()}원` : undefined}
            />
            <Row k="LLM input tokens" v={stats?.cost.llmInputTokens} />
            <Row k="LLM output tokens" v={stats?.cost.llmOutputTokens} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>플랜 분포</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-zinc-700">
            {(stats?.plans || []).map((p) => (
              <Row key={p.plan} k={p.plan} v={p.count} />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>연동 API 사용</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-zinc-500">
                <th className="py-2">슬롯</th>
                <th>요청</th>
                <th>실패</th>
                <th>추정원가</th>
              </tr>
            </thead>
            <tbody>
              {[...slotAgg.entries()].map(([slot, v]) => (
                <tr key={slot} className="border-b border-zinc-100">
                  <td className="py-2 font-medium">{slot}</td>
                  <td>{v.req}</td>
                  <td>{v.fail}</td>
                  <td>{v.cost.toLocaleString()}원</td>
                </tr>
              ))}
              {!slotAgg.size ? (
                <tr>
                  <td colSpan={4} className="py-4 text-zinc-500">
                    아직 집계된 API 호출이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string | number }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-500">{k}</span>
      <span className="font-medium text-zinc-900">{v ?? "…"}</span>
    </div>
  );
}

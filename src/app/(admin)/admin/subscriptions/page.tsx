"use client";

import { useEffect, useState } from "react";

export default function AdminSubscriptionsPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/subscriptions");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "실패");
        return;
      }
      setRows(data.subscriptions || []);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">구독</h1>
        <p className="mt-1 text-sm text-zinc-600">활성·연체·해지 상태</p>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-zinc-500">
              <th className="px-4 py-2">회원</th>
              <th>플랜</th>
              <th>상태</th>
              <th>주기</th>
              <th>기간 종료</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const user = s.user as { email: string };
              const plan = s.planProduct as { code: string; name: string };
              return (
                <tr key={String(s.id)} className="border-b border-zinc-100">
                  <td className="px-4 py-2">{user?.email}</td>
                  <td>
                    {plan?.name} ({plan?.code})
                  </td>
                  <td>{String(s.status)}</td>
                  <td>{String(s.interval)}</td>
                  <td>
                    {s.currentPeriodEnd
                      ? new Date(String(s.currentPeriodEnd)).toLocaleDateString("ko-KR")
                      : "-"}
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-zinc-500">
                  구독이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

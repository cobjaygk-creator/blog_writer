"use client";

import { useEffect, useState } from "react";

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/audit");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "실패");
        return;
      }
      setLogs(data.logs || []);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">감사 로그</h1>
        <p className="mt-1 text-sm text-zinc-600">관리자 쓰기 작업 기록</p>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="divide-y rounded-xl border bg-white text-sm">
        {logs.map((l) => {
          const actor = l.actor as { email?: string };
          return (
            <li key={String(l.id)} className="px-4 py-3">
              <p className="font-medium text-zinc-900">{String(l.action)}</p>
              <p className="text-xs text-zinc-500">
                {actor?.email} · {new Date(String(l.createdAt)).toLocaleString("ko-KR")} ·{" "}
                {String(l.targetType || "")} {String(l.targetId || "")}
              </p>
            </li>
          );
        })}
        {!logs.length ? <li className="px-4 py-8 text-zinc-500">로그 없음</li> : null}
      </ul>
    </div>
  );
}

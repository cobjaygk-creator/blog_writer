"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminUsagePage() {
  const [tab, setTab] = useState<"users" | "api">("users");
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/admin/usage?tab=${tab}&days=${days}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "실패");
        return;
      }
      setError(null);
      setData(json);
    })();
  }, [tab, days]);

  const users = (data?.users as Array<Record<string, unknown>>) || [];
  const slots = (data?.slots as Array<Record<string, unknown>>) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">사용량</h1>
          <p className="mt-1 text-sm text-zinc-600">유저별 생성 · 연동 API 호출</p>
        </div>
        <div className="flex gap-2">
          <select
            className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>7일</option>
            <option value={30}>30일</option>
          </select>
          <div className="flex rounded-lg border border-zinc-200 p-0.5 text-xs">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 ${tab === "users" ? "bg-zinc-900 text-white" : ""}`}
              onClick={() => setTab("users")}
            >
              유저별
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 ${tab === "api" ? "bg-zinc-900 text-white" : ""}`}
              onClick={() => setTab("api")}
            >
              연동 API
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {tab === "users" ? (
        <Card>
          <CardHeader>
            <CardTitle>유저별</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-zinc-500">
                  <th className="py-2">이메일</th>
                  <th>플랜</th>
                  <th>생성</th>
                  <th>글</th>
                  <th>tokens in/out</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={String(u.userId)} className="border-b border-zinc-100">
                    <td className="py-2">
                      <a className="underline" href={`/admin/users/${u.userId}`}>
                        {String(u.email)}
                      </a>
                    </td>
                    <td>{String(u.plan)}</td>
                    <td>{String(u.generates)}</td>
                    <td>{String(u.postsCreated)}</td>
                    <td>
                      {String(u.llmInputTokens)} / {String(u.llmOutputTokens)}
                    </td>
                  </tr>
                ))}
                {!users.length ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-zinc-500">
                      집계 없음
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((s) => (
            <Card key={String(s.slot)}>
              <CardContent className="py-4">
                <p className="text-sm font-semibold text-zinc-900">{String(s.slot)}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  요청 {String(s.requests)} · 성공 {String(s.successes)} · 실패 {String(s.failures)}
                </p>
                <p className="mt-1 text-sm text-zinc-700">
                  추정 {(Number(s.estCostKrw) || 0).toLocaleString()}원
                </p>
              </CardContent>
            </Card>
          ))}
          {!slots.length ? <p className="text-sm text-zinc-500">집계 없음</p> : null}
        </div>
      )}
    </div>
  );
}

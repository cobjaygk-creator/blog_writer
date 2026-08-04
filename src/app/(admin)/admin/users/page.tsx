"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type UserRow = {
  id: string;
  email: string;
  plan: string;
  role: string;
  planOverrideCode: string | null;
  suspendedAt: string | null;
  createdAt: string;
  _count: { brands: number; payments: number; subscriptions: number };
};

export default function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      void (async () => {
        const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "실패");
          return;
        }
        setError(null);
        setUsers(data.users || []);
      })();
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">회원</h1>
        <p className="mt-1 text-sm text-zinc-600">검색 · 플랜 강제 · 정지</p>
      </div>
      <Input
        placeholder="이메일 검색"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-zinc-500">
              <th className="px-4 py-2">이메일</th>
              <th>플랜</th>
              <th>역할</th>
              <th>테마</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-zinc-100">
                <td className="px-4 py-2">
                  <Link href={`/admin/users/${u.id}`} className="font-medium underline">
                    {u.email}
                  </Link>
                </td>
                <td>
                  {u.plan}
                  {u.planOverrideCode ? (
                    <Badge className="ml-1">override {u.planOverrideCode}</Badge>
                  ) : null}
                </td>
                <td>{u.role}</td>
                <td>{u._count.brands}</td>
                <td>{u.suspendedAt ? <Badge className="bg-red-50 text-red-700">정지</Badge> : "정상"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

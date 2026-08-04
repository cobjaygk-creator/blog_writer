"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [overrideCode, setOverrideCode] = useState("");
  const [note, setNote] = useState("");
  const [plan, setPlan] = useState("free");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/admin/users/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "실패");
      return;
    }
    setUser(data.user);
    setOverrideCode(data.user.planOverrideCode || "");
    setNote(data.user.planOverrideNote || "");
    setPlan(data.user.plan || "free");
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function patch(body: Record<string, unknown>) {
    setMsg(null);
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "저장 실패");
      return;
    }
    setMsg("저장됨");
    await load();
  }

  if (!user && !error) return <p className="text-sm text-zinc-500">불러오는 중…</p>;

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="text-sm text-zinc-500 hover:underline">
        ← 회원 목록
      </Link>
      <h1 className="text-2xl font-semibold text-zinc-900">{String(user?.email || "")}</h1>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>플랜 · 권한</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label>
            <span>캐시 플랜</span>
            <select
              className="mt-1.5 flex h-10 w-full rounded-md border border-zinc-200 px-3 text-sm"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            >
              <option value="free">free</option>
              <option value="lite">lite</option>
              <option value="pro">pro</option>
            </select>
          </Label>
          <Label>
            <span>플랜 오버라이드 코드 (비우면 해제)</span>
            <Input value={overrideCode} onChange={(e) => setOverrideCode(e.target.value)} />
          </Label>
          <Label>
            <span>오버라이드 메모</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() =>
                void patch({
                  plan,
                  planOverrideCode: overrideCode.trim() || null,
                  planOverrideNote: note.trim() || null,
                })
              }
            >
              저장
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void patch({ role: user?.role === "admin" ? "user" : "admin" })}
            >
              {user?.role === "admin" ? "관리자 해제" : "관리자 지정"}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void patch({ suspended: !user?.suspendedAt })}
            >
              {user?.suspendedAt ? "정지 해제" : "계정 정지"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>최근 사용량</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-700">
          {((user?.usageDaily as Array<Record<string, unknown>>) || []).slice(0, 7).map((u) => (
            <p key={String(u.id)}>
              {String(u.day).slice(0, 10)} · 생성 {String(u.generates)} · tokens{" "}
              {String(u.llmInputTokens)}/{String(u.llmOutputTokens)}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

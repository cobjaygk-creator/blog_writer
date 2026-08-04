"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Plan = {
  id?: string;
  code: string;
  name: string;
  brandsLimit: number;
  sourcePostsPerBrand: number;
  postsPerDay: number;
  imagesPerPost: number;
  generatesPerDay: number;
  dualGenerationEnabled: boolean;
  priceMonthlyKrw: number;
  priceYearlyKrw: number | null;
  isPublic: boolean;
  isPurchasable: boolean;
  active: boolean;
};

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/plans");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "실패");
      return;
    }
    // API returns without id — fetch from prisma via list; need id for PATCH
    // Re-fetch raw: plans from listPlanProducts don't include id. Fix API to include id.
    setPlans(data.plans || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!editing?.id && !(editing as { id?: string })?.id) {
      // plans from listPlanProducts may lack id — patch by loading from extended API
    }
    if (!editing) return;
    const id = (editing as Plan & { id?: string }).id;
    if (!id) {
      setError("요금제 id가 없습니다. 페이지를 새로고침해 주세요.");
      return;
    }
    setError(null);
    const res = await fetch("/api/admin/plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "저장 실패");
      return;
    }
    setMsg("저장됨");
    setEditing(null);
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">요금제</h1>
        <p className="mt-1 text-sm text-zinc-600">한도 · 가격 · 공개/구매 설정</p>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}

      <div className="grid gap-3">
        {plans.map((p) => (
          <Card key={p.code}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-semibold text-zinc-900">
                  {p.name} <span className="text-zinc-400">({p.code})</span>
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  월 {p.priceMonthlyKrw.toLocaleString()}원 · 테마 {p.brandsLimit} · 생성/일{" "}
                  {p.generatesPerDay} · 글/일 {p.postsPerDay}
                </p>
                <div className="mt-2 flex gap-1">
                  {p.active ? <Badge>active</Badge> : <Badge>off</Badge>}
                  {p.isPurchasable ? <Badge>구매가능</Badge> : null}
                  {p.isPublic ? <Badge>공개</Badge> : null}
                </div>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(p)}>
                편집
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {editing ? (
        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="font-medium">편집: {editing.code}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field
                label="이름"
                value={editing.name}
                onChange={(v) => setEditing({ ...editing, name: v })}
              />
              <Field
                label="월 가격(원)"
                value={String(editing.priceMonthlyKrw)}
                onChange={(v) => setEditing({ ...editing, priceMonthlyKrw: Number(v) || 0 })}
              />
              <Field
                label="테마 한도"
                value={String(editing.brandsLimit)}
                onChange={(v) => setEditing({ ...editing, brandsLimit: Number(v) || 0 })}
              />
              <Field
                label="원문/테마"
                value={String(editing.sourcePostsPerBrand)}
                onChange={(v) => setEditing({ ...editing, sourcePostsPerBrand: Number(v) || 0 })}
              />
              <Field
                label="글/일"
                value={String(editing.postsPerDay)}
                onChange={(v) => setEditing({ ...editing, postsPerDay: Number(v) || 0 })}
              />
              <Field
                label="생성/일"
                value={String(editing.generatesPerDay)}
                onChange={(v) => setEditing({ ...editing, generatesPerDay: Number(v) || 0 })}
              />
              <Field
                label="이미지/글"
                value={String(editing.imagesPerPost)}
                onChange={(v) => setEditing({ ...editing, imagesPerPost: Number(v) || 0 })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void save()}>
                저장
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                취소
              </Button>
            </div>
            <p className="text-xs text-zinc-500">
              id가 없으면 API에 id를 포함하도록 목록을 확인하세요.{" "}
              <Link href="/admin/plans" className="underline">
                새로고침
              </Link>
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-sm">
      <span className="text-zinc-600">{label}</span>
      <Input className="mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Plan = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  brandsLimit: number;
  sourcePostsPerBrand: number;
  postsPerDay: number;
  postsPerMonth: number;
  shortsPerMonth: number;
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
    setPlans(data.plans || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!editing?.id) {
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
        <h1 className="text-2xl font-semibold text-zinc-900">Ditodio 통합 요금제</h1>
        <p className="mt-1 text-sm text-zinc-600">
          결제 1건으로 블로그 포스트 + 쇼츠 한도를 함께 제공합니다.
        </p>
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
                  월 {p.priceMonthlyKrw.toLocaleString()}원 · 포스트/월 {p.postsPerMonth} · 쇼츠/월{" "}
                  {p.shortsPerMonth} · 테마 {p.brandsLimit}
                </p>
                <div className="mt-2 flex gap-1">
                  {p.active ? <Badge>active</Badge> : <Badge>off</Badge>}
                  {p.isPurchasable ? <Badge>구매가능</Badge> : null}
                  {p.isPublic ? <Badge>공개</Badge> : null}
                  <Badge>통합</Badge>
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
                label="포스트/월"
                value={String(editing.postsPerMonth)}
                onChange={(v) => setEditing({ ...editing, postsPerMonth: Number(v) || 0 })}
              />
              <Field
                label="쇼츠/월"
                value={String(editing.shortsPerMonth)}
                onChange={(v) => setEditing({ ...editing, shortsPerMonth: Number(v) || 0 })}
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
                label="글/일 (소프트 캡)"
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

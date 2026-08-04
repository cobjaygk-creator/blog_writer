"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminPromotionsPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [code, setCode] = useState("");
  const [percentOff, setPercentOff] = useState("20");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/promotions");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "실패");
      return;
    }
    setRows(data.promotions || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setError(null);
    const res = await fetch("/api/admin/promotions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        percentOff: Number(percentOff) || null,
        applicablePlans: ["lite", "pro"],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "생성 실패");
      return;
    }
    setCode("");
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">프로모션</h1>
        <p className="mt-1 text-sm text-zinc-600">쿠폰 코드 · 기간 할인</p>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-[12rem]"
          placeholder="CODE"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Input
          className="max-w-[8rem]"
          placeholder="% 할인"
          value={percentOff}
          onChange={(e) => setPercentOff(e.target.value)}
        />
        <Button type="button" onClick={() => void create()}>
          추가
        </Button>
      </div>
      <ul className="divide-y rounded-xl border bg-white text-sm">
        {rows.map((p) => (
          <li key={String(p.id)} className="flex justify-between px-4 py-3">
            <span className="font-medium">{String(p.code)}</span>
            <span className="text-zinc-500">
              {p.percentOff ? `${p.percentOff}%` : `${p.amountOffKrw}원`} ·{" "}
              {p.active ? "active" : "off"} · 사용 {String(p.redeemedCount)}
            </span>
          </li>
        ))}
        {!rows.length ? <li className="px-4 py-8 text-zinc-500">프로모션 없음</li> : null}
      </ul>
    </div>
  );
}

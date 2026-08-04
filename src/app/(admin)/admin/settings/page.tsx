"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/settings");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "실패");
        return;
      }
      setSettings(data.settings || {});
    })();
  }, []);

  async function save() {
    setError(null);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "저장 실패");
      return;
    }
    setMsg("저장됨");
  }

  function set(key: string, value: unknown) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">설정</h1>
        <p className="mt-1 text-sm text-zinc-600">빌링 킬스위치 · 토큰 원가 · 안내 문구</p>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}

      <div className="max-w-lg space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(settings["billing.enabled"])}
            onChange={(e) => set("billing.enabled", e.target.checked)}
          />
          결제 활성화
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(settings["billing.testMode"])}
            onChange={(e) => set("billing.testMode", e.target.checked)}
          />
          테스트 모드 배지
        </label>
        <Label>
          <span>문의 이메일</span>
          <Input
            className="mt-1"
            value={String(settings["support.email"] || "")}
            onChange={(e) => set("support.email", e.target.value)}
          />
        </Label>
        <Label>
          <span>세금/영수증 안내</span>
          <Input
            className="mt-1"
            value={String(settings["tax.notice"] || "")}
            onChange={(e) => set("tax.notice", e.target.value)}
          />
        </Label>
        <Label>
          <span>GPT input 원/1k tokens</span>
          <Input
            className="mt-1"
            value={String(settings["llm.cost.gpt.inputPer1k"] ?? "")}
            onChange={(e) => set("llm.cost.gpt.inputPer1k", Number(e.target.value) || 0)}
          />
        </Label>
        <Label>
          <span>GPT output 원/1k tokens</span>
          <Input
            className="mt-1"
            value={String(settings["llm.cost.gpt.outputPer1k"] ?? "")}
            onChange={(e) => set("llm.cost.gpt.outputPer1k", Number(e.target.value) || 0)}
          />
        </Label>
        <Button type="button" onClick={() => void save()}>
          저장
        </Button>
      </div>
    </div>
  );
}

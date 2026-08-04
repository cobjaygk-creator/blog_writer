"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Slot = {
  slot: string;
  label: string;
  secretFields: string[];
  source: string;
  enabled: boolean;
  publicConfig: Record<string, unknown>;
  hintJson: Record<string, string>;
  lastVerifyOk?: boolean | null;
  lastVerifyError?: string | null;
};

export default function AdminIntegrationsPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [canEncrypt, setCanEncrypt] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [models, setModels] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/integrations");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "실패");
      return;
    }
    setCanEncrypt(Boolean(data.canEncrypt));
    setSlots(data.slots || []);
    const m: Record<string, string> = {};
    for (const s of data.slots || []) {
      m[s.slot] = String(s.publicConfig?.model || "");
    }
    setModels(m);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(slot: Slot) {
    setError(null);
    setMsg(null);
    const secrets = drafts[slot.slot] || {};
    const publicConfig = { ...slot.publicConfig };
    if (models[slot.slot] !== undefined) publicConfig.model = models[slot.slot];
    const res = await fetch(`/api/admin/integrations/${slot.slot}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secrets, publicConfig, enabled: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "저장 실패");
      return;
    }
    setMsg(`${slot.label} 저장됨`);
    setDrafts((d) => ({ ...d, [slot.slot]: {} }));
    await load();
  }

  async function verify(slot: string) {
    setMsg(null);
    const res = await fetch(`/api/admin/integrations/${slot}/verify`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setMsg(data.message || (data.ok ? "OK" : "실패"));
    await load();
  }

  async function clear(slot: string) {
    if (!confirm("DB에 저장된 키 오버라이드를 삭제하고 env로 되돌릴까요?")) return;
    await fetch(`/api/admin/integrations/${slot}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">연동 · API 키</h1>
        <p className="mt-1 text-sm text-zinc-600">
          DB 암호화 저장이 env보다 우선합니다. 키는 마스킹만 표시됩니다.
        </p>
      </div>
      {!canEncrypt ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          SECRETS_ENCRYPTION_KEY가 없어 새 키를 저장할 수 없습니다. .env에 32바이트 hex 키를
          추가하세요.
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}

      <div className="space-y-4">
        {slots.map((slot) => (
          <Card key={slot.slot} id={slot.slot}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>{slot.label}</CardTitle>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge>{slot.source}</Badge>
                  {slot.lastVerifyOk === true ? (
                    <Badge className="bg-emerald-50 text-emerald-800">verify ok</Badge>
                  ) : null}
                  {slot.lastVerifyOk === false ? (
                    <Badge className="bg-red-50 text-red-700">verify fail</Badge>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {slot.secretFields.map((field) => (
                <label key={field} className="block text-sm">
                  <span className="text-zinc-600">
                    {field}{" "}
                    {slot.hintJson?.[field] ? (
                      <span className="text-zinc-400">({slot.hintJson[field]})</span>
                    ) : null}
                  </span>
                  <Input
                    className="mt-1"
                    type="password"
                    autoComplete="off"
                    placeholder="변경 시에만 입력"
                    value={drafts[slot.slot]?.[field] || ""}
                    onChange={(e) =>
                      setDrafts((d) => ({
                        ...d,
                        [slot.slot]: { ...(d[slot.slot] || {}), [field]: e.target.value },
                      }))
                    }
                  />
                </label>
              ))}
              {slot.slot.startsWith("llm_") || slot.slot === "vision" || slot.slot === "image_gen" ? (
                <label className="block text-sm">
                  <span className="text-zinc-600">model</span>
                  <Input
                    className="mt-1"
                    value={models[slot.slot] || ""}
                    onChange={(e) => setModels((m) => ({ ...m, [slot.slot]: e.target.value }))}
                    placeholder="예: gpt-4o-mini"
                  />
                </label>
              ) : null}
              {slot.lastVerifyError ? (
                <p className="text-xs text-red-600">{slot.lastVerifyError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void save(slot)}>
                  저장
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void verify(slot.slot)}>
                  연결 테스트
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => void clear(slot.slot)}>
                  DB 키 삭제
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

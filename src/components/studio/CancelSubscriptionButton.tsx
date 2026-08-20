"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function CancelSubscriptionButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    if (!window.confirm("기간 종료 시 해지되도록 예약할까요?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/billing/cancel", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "해지 예약 실패");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button type="button" variant="outline" size="sm" onClick={() => void cancel()} disabled={busy}>
        {busy ? "처리 중…" : "기간 말 해지 예약"}
      </Button>
      {error ? <p className="text-[11px] text-[#C2453C]">{error}</p> : null}
    </div>
  );
}

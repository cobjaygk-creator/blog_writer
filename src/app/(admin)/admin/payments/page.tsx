"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Payment = {
  id: string;
  status: string;
  amountKrw: number;
  tossOrderId: string;
  createdAt: string;
  user: { email: string };
};

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/payments");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "실패");
      return;
    }
    setPayments(data.payments || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function refund(id: string) {
    if (!confirm("이 결제를 전액 환불할까요?")) return;
    setMsg(null);
    const res = await fetch(`/api/admin/payments/${id}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "환불 실패");
      return;
    }
    setMsg("환불 요청 완료");
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">결제</h1>
        <p className="mt-1 text-sm text-zinc-600">Toss 결제 이력 · 환불</p>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-zinc-500">
              <th className="px-4 py-2">일시</th>
              <th>회원</th>
              <th>금액</th>
              <th>상태</th>
              <th>orderId</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-zinc-100">
                <td className="px-4 py-2">{new Date(p.createdAt).toLocaleString("ko-KR")}</td>
                <td>{p.user.email}</td>
                <td>{p.amountKrw.toLocaleString()}원</td>
                <td>{p.status}</td>
                <td className="max-w-[10rem] truncate text-xs">{p.tossOrderId}</td>
                <td>
                  {p.status === "paid" || p.status === "partial_refund" ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => void refund(p.id)}>
                      환불
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!payments.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-zinc-500">
                  결제 내역이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

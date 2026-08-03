"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setBusy(false);
      setError(payload.error || "회원가입에 실패했습니다.");
      return;
    }
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setBusy(false);
    if (result?.error) {
      setError("가입은 됐지만 자동 로그인에 실패했습니다. 로그인 페이지에서 시도해 주세요.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">회원가입</h1>
      <p className="mt-2 text-sm text-zinc-600">업체별 문체 학습 후 블로그 초안을 만듭니다.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-800">이메일</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-900"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-800">비밀번호 (8자 이상)</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-900"
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {busy ? "가입 중…" : "가입하기"}
        </button>
      </form>
      <p className="mt-6 text-sm text-zinc-600">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="font-medium text-zinc-900 underline">
          로그인
        </Link>
      </p>
    </main>
  );
}

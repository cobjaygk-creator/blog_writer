"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setBusy(false);
    if (result?.error) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">로그인</h1>
      <p className="mt-2 text-sm text-zinc-600">AI 블로그 포스트 생성기</p>
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
          <span className="font-medium text-zinc-800">비밀번호</span>
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
          {busy ? "로그인 중…" : "로그인"}
        </button>
      </form>
      <p className="mt-6 text-sm text-zinc-600">
        계정이 없나요?{" "}
        <Link href="/register" className="font-medium text-zinc-900 underline">
          회원가입
        </Link>
      </p>
    </main>
  );
}

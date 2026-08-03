import { Suspense } from "react";

import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-full w-full max-w-md items-center justify-center px-6 py-16 text-sm text-zinc-500">
          로딩 중…
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

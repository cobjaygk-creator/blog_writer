import Link from "next/link";
import { redirect } from "next/navigation";

import { AppNav } from "@/components/AppNav";
import { BrandCreateForm } from "@/components/BrandCreateForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";

export default async function NewBrandPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <>
      <AppNav email={session.user.email} />
      <main className="mx-auto w-full max-w-xl px-6 py-10">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← 대시보드
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">업체 추가</h1>
        <p className="mt-2 text-sm text-zinc-600">문체 학습과 포스트 생성의 단위가 되는 업체를 만듭니다.</p>
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <BrandCreateForm />
          </CardContent>
        </Card>
      </main>
    </>
  );
}

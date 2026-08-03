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
        <Link href="/brands" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← 업체 등록
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">새 업체</h1>
        <p className="mt-2 text-sm text-zinc-600">업체를 만든 뒤 샘플 원문으로 문체를 학습합니다.</p>
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

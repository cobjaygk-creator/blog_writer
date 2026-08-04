import Link from "next/link";

import { BrandCreateForm } from "@/components/BrandCreateForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewBrandPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-6 py-10">
      <Link href="/brands" className="text-sm text-zinc-500 hover:text-zinc-800">
        ← 테마 등록
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">새 테마</h1>
      <p className="mt-2 text-sm text-zinc-600">테마를 만든 뒤 샘플 원문으로 문체를 학습합니다.</p>
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <BrandCreateForm />
        </CardContent>
      </Card>
    </main>
  );
}

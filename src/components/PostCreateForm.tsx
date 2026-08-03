"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BRAND_CAPTION_TONE,
  captionToneOptions,
} from "@/lib/caption-tones";

export type PostCreateBrandOption = {
  id: string;
  name: string;
  learned: boolean;
  styleVersion: number | null;
  brandTone: string | null;
};

export function PostCreateForm({
  brands,
  initialBrandId,
}: {
  brands: PostCreateBrandOption[];
  initialBrandId?: string | null;
}) {
  const router = useRouter();
  const learnedBrands = useMemo(() => brands.filter((b) => b.learned), [brands]);
  const defaultBrandId =
    (initialBrandId && learnedBrands.some((b) => b.id === initialBrandId) && initialBrandId) ||
    learnedBrands[0]?.id ||
    "";

  const [brandId, setBrandId] = useState(defaultBrandId);
  const [keyword, setKeyword] = useState("");
  const [captionTone, setCaptionTone] = useState(BRAND_CAPTION_TONE);
  const [productHighlights, setProductHighlights] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedBrand = learnedBrands.find((b) => b.id === brandId);
  const toneOptions = useMemo(
    () => captionToneOptions(selectedBrand?.brandTone),
    [selectedBrand?.brandTone],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!brandId) {
      setError("학습된 업체를 선택해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId,
        keyword: keyword.trim() || undefined,
        productHighlights: productHighlights.trim() || undefined,
        captionTone: captionTone || BRAND_CAPTION_TONE,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; post?: { id: string } };
    setBusy(false);
    if (!res.ok || !data.post) {
      setError(data.error || "포스트 생성에 실패했습니다.");
      return;
    }
    router.push(`/posts/${data.post.id}`);
    router.refresh();
  }

  if (brands.length === 0) {
    return (
      <div className="space-y-3 text-sm text-zinc-600">
        <p>먼저 업체를 등록해 주세요.</p>
        <Link href="/brands/new">
          <Button type="button">업체 등록하러 가기</Button>
        </Link>
      </div>
    );
  }

  if (learnedBrands.length === 0) {
    return (
      <div className="space-y-3 text-sm text-zinc-600">
        <p>문체 학습이 끝난 업체가 없습니다. 샘플 원문으로 학습한 뒤 포스트를 만들 수 있습니다.</p>
        <Link href="/brands">
          <Button type="button">업체 학습하러 가기</Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Label>
        <span>업체</span>
        <select
          className="mt-1.5 flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
          value={brandId}
          onChange={(e) => {
            setBrandId(e.target.value);
            setCaptionTone(BRAND_CAPTION_TONE);
          }}
          required
        >
          {learnedBrands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
              {brand.styleVersion ? ` (스타일 v${brand.styleVersion})` : ""}
            </option>
          ))}
        </select>
      </Label>
      <Label>
        <span>문장체 (말투)</span>
        <select
          className="mt-1.5 flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
          value={captionTone}
          onChange={(e) => setCaptionTone(e.target.value)}
        >
          {toneOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Label>
      <Label>
        <span>키워드</span>
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="예: 카니발 페이스리프트 AG바디킷"
          maxLength={120}
        />
      </Label>
      <Label>
        <span>제품 특장점 (선택)</span>
        <Textarea
          rows={4}
          value={productHighlights}
          onChange={(e) => setProductHighlights(e.target.value)}
          placeholder={"예:\n- 전면 그릴·범퍼 라인 교체\n- 머플러팁 일체형\n- 화이트 바디와 크롬 포인트"}
          maxLength={2000}
        />
        <span className="mt-1 block text-xs font-normal text-zinc-500">
          비우면 키워드에서 제품을 알 수 있을 때 자동으로 조사합니다. 초안 말투는 문장체 옵션을 따릅니다.
        </span>
      </Label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={busy || !brandId}>
        {busy ? "생성 중…" : "포스트 만들기"}
      </Button>
      <p className="text-xs text-zinc-500">
        생성 후 사진 업로드·초안 작성 화면으로 이동합니다.
      </p>
    </form>
  );
}

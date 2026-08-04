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
      setError("??? ??? ??? ???.");
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
      setError(data.error || "? ??? ??????.");
      return;
    }
    router.push(`/posts/${data.post.id}`);
    router.refresh();
  }

  if (brands.length === 0) {
    return (
      <div className="space-y-3 text-sm text-zinc-600">
        <p>?? ??? ??? ???.</p>
        <Link href="/brands/new">
          <Button type="button">?? ???? ??</Button>
        </Link>
      </div>
    );
  }

  if (learnedBrands.length === 0) {
    return (
      <div className="space-y-3 text-sm text-zinc-600">
        <p>?? ??? ?? ??? ????. ?? ???? ??? ? ?? ?? ? ????.</p>
        <Link href="/brands">
          <Button type="button">?? ???? ??</Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Label>
        <span>??</span>
        <select
          className="mt-1.5 flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus-visible:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-900/15"
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
              {brand.styleVersion ? ` (??? v${brand.styleVersion})` : ""}
            </option>
          ))}
        </select>
      </Label>
      <Label>
        <span>??? (??)</span>
        <select
          className="mt-1.5 flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus-visible:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-900/15"
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
        <span>???</span>
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="?: ??? ?????? AG???"
          maxLength={120}
        />
      </Label>
      <Label>
        <span>?? ??? (??)</span>
        <Textarea
          rows={4}
          value={productHighlights}
          onChange={(e) => setProductHighlights(e.target.value)}
          placeholder={"?:\n- ?? ??�?? ?? ??\n- ???? ???\n- ??? ??? ?? ???"}
          maxLength={2000}
        />
        <span className="mt-1 block text-xs font-normal text-zinc-500">
          ??? ????? ??? ? ? ?? ? ???? ?????. ?? ??? ??? ??? ????.
        </span>
      </Label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={busy || !brandId}>
        {busy ? "?? ??" : "? ???"}
      </Button>
      <p className="text-xs text-zinc-500">?? ? ?? ???�?? ?? ???? ?????.</p>
    </form>
  );
}

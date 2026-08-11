"use client";

import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type LearnedSupplementPointView = {
  point: string;
  kind: string;
};

type Props = {
  postId: string | null;
  keyword: string;
  productHighlights: string;
  /** Optional explicit prompts; falls back to server-side image captions. */
  imagePrompts?: string[];
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  excludedPoints: string[];
  onExcludedChange: (points: string[]) => void;
  className?: string;
};

const KIND_LABEL: Record<string, string> = {
  process: "공정",
  check: "점검",
  tip: "팁",
  caution: "주의",
  other: "기타",
};

export function LearnedSupplementPanel({
  postId,
  keyword,
  productHighlights,
  imagePrompts,
  enabled,
  onEnabledChange,
  excludedPoints,
  onExcludedChange,
  className,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<LearnedSupplementPointView[]>([]);
  const [productLabel, setProductLabel] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const excludedSet = new Set(excludedPoints);

  const loadPreview = useCallback(async () => {
    if (!postId || !keyword.trim()) {
      setError("키워드를 입력한 뒤 미리볼 수 있습니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/learned-supplements/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keyword.trim(),
          productHighlights: productHighlights.trim() || null,
          imagePrompts: imagePrompts?.length ? imagePrompts : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        enabled?: boolean;
        points?: LearnedSupplementPointView[];
        productKey?: { vehicle?: string; part?: string } | null;
        message?: string;
      };
      if (!res.ok) throw new Error(data.error || "미리보기에 실패했습니다.");
      if (data.enabled === false) {
        setPoints([]);
        setProductLabel(null);
        setError(data.message || "학습 보충이 꺼져 있습니다.");
        setLoaded(true);
        return;
      }
      setPoints(data.points || []);
      setProductLabel(
        data.productKey?.vehicle && data.productKey?.part
          ? `${data.productKey.vehicle} · ${data.productKey.part}`
          : null,
      );
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "미리보기 실패");
    } finally {
      setBusy(false);
    }
  }, [postId, keyword, productHighlights, imagePrompts]);

  useEffect(() => {
    // Reset stale preview when inputs change meaningfully
    setLoaded(false);
    setPoints([]);
  }, [keyword, productHighlights, postId]);

  function togglePoint(point: string) {
    if (excludedSet.has(point)) {
      onExcludedChange(excludedPoints.filter((p) => p !== point));
    } else {
      onExcludedChange([...excludedPoints, point]);
    }
  }

  const includedCount = points.filter((p) => !excludedSet.has(p.point)).length;

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[color:var(--foreground)]">
            학습 글에서 보충
            {loaded && points.length > 0 ? (
              <span className="ml-1 font-normal text-[color:var(--muted)]">
                {includedCount}건
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-[color:var(--muted)]">
            같은 제품·장면의 학습 글에서 공정·점검·팁을 뽑아 초안에 반영합니다.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-[color:var(--foreground)]">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          사용
        </label>
      </div>

      {enabled ? (
        <>
          <button
            type="button"
            disabled={busy || !postId || !keyword.trim()}
            onClick={() => void loadPreview()}
            className="text-xs font-medium text-[var(--accent)] hover:underline disabled:opacity-40"
          >
            {busy ? "불러오는 중…" : loaded ? "다시 미리보기" : "보충 포인트 미리보기"}
          </button>

          {productLabel ? (
            <p className="text-xs text-[color:var(--muted)]">매칭 제품: {productLabel}</p>
          ) : null}

          {error ? <p className="text-xs text-red-600">{error}</p> : null}

          {loaded && !error && points.length === 0 ? (
            <p className="text-xs text-[color:var(--muted)]">
              동일 제품·장면과 맞는 학습 포인트가 없습니다. (원문 2건 이상·사진 프롬프트 필요)
            </p>
          ) : null}

          {points.length > 0 ? (
            <ul className="space-y-1.5">
              {points.map((p) => {
                const on = !excludedSet.has(p.point);
                return (
                  <li key={p.point}>
                    <label
                      className={cn(
                        "flex cursor-pointer gap-2 rounded-md px-1.5 py-1 text-xs leading-snug",
                        on
                          ? "text-[color:var(--foreground)]"
                          : "text-[color:var(--muted)] line-through",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => togglePoint(p.point)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                      />
                      <span>
                        <span className="mr-1 inline-block rounded bg-[var(--accent-soft)] px-1 text-[10px] font-medium text-[var(--accent)]">
                          {KIND_LABEL[p.kind] || p.kind}
                        </span>
                        {p.point}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-[color:var(--muted)]">꺼져 있으면 학습 글 보충 없이 생성합니다.</p>
      )}
    </div>
  );
}

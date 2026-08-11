"use client";

import { cn } from "@/lib/utils";

type Img = {
  id: string;
  imageUrl: string;
  caption: string | null;
};

export function PostFilmstrip({
  images,
  max = 8,
  onOpenPhotos,
  className,
}: {
  images: Img[];
  max?: number;
  onOpenPhotos: () => void;
  className?: string;
}) {
  if (images.length === 0) {
    return (
      <button
        type="button"
        onClick={onOpenPhotos}
        className={cn(
          "flex w-full items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-white px-3 py-3 text-xs text-[color:var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
          className,
        )}
      >
        사진 추가 · 관리
      </button>
    );
  }

  const shown = images.slice(0, max);
  const rest = images.length - shown.length;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[color:var(--foreground)]">사진 {images.length}</span>
        <button
          type="button"
          onClick={onOpenPhotos}
          className="text-[var(--accent)] hover:underline"
        >
          전체 관리
        </button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {shown.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={onOpenPhotos}
            className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--background)]"
            title={img.caption || "사진"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.imageUrl} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
        {rest > 0 ? (
          <button
            type="button"
            onClick={onOpenPhotos}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--background)] text-xs font-medium text-[color:var(--muted)]"
          >
            +{rest}
          </button>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

type Img = {
  id: string;
  imageUrl: string;
  caption: string | null;
};

type Pan = { x: number; y: number };

function FilmThumb({
  img,
  index,
  onActivate,
}: {
  img: Img;
  index: number;
  onActivate: (imageUrl: string) => void;
}) {
  const [pos, setPos] = useState<Pan>({ x: 50, y: 50 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: Pan;
    moved: boolean;
  } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origin: pos,
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    // Drag to pan cropped cover image (object-position %)
    setPos({
      x: Math.min(100, Math.max(0, d.origin.x - dx * 0.45)),
      y: Math.min(100, Math.max(0, d.origin.y - dy * 0.45)),
    });
  }

  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const wasClick = !d.moved;
    dragRef.current = null;
    if (wasClick) onActivate(img.imageUrl);
  }

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title={
        img.caption
          ? `${img.caption} · 드래그로 크롭 위치 조정, 클릭 시 본문으로 이동`
          : `사진 ${index + 1} · 드래그로 크롭 위치 조정, 클릭 시 본문으로 이동`
      }
      className="relative h-[78px] w-full shrink-0 cursor-grab overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] active:cursor-grabbing"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.imageUrl}
        alt=""
        draggable={false}
        className="pointer-events-none h-full w-full object-cover"
        style={{ objectPosition: `${pos.x}% ${pos.y}%` }}
      />
      <span className="pointer-events-none absolute bottom-[5px] left-[5px] right-[5px] truncate rounded-[4px] bg-[rgba(22,22,26,.72)] px-[5px] py-[2px] text-left text-[9.5px] font-semibold text-white">
        {index + 1}
        {img.caption ? ` · ${img.caption}` : ""}
      </span>
    </button>
  );
}

export function PostFilmstrip({
  images,
  onOpenPhotos,
  onFocusImage,
  className,
}: {
  images: Img[];
  max?: number;
  onOpenPhotos: () => void;
  /** Scroll/focus the matching image inside the editor canvas. */
  onFocusImage?: (imageUrl: string) => void;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex w-[132px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]",
        className,
      )}
    >
      <div className="sticky top-0 z-10 flex h-9 shrink-0 items-center border-b border-[var(--border)] bg-[var(--surface)] px-3">
        <span className="[font-variant-numeric:tabular-nums] text-[11px] font-bold tracking-[.03em] text-[var(--faint)]">
          사진 {images.length}
        </span>
        <button
          type="button"
          onClick={onOpenPhotos}
          className="ml-auto text-[var(--hint)] hover:text-[var(--accent)]"
          title="사진 추가"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-[9px]">
        {images.length === 0 ? (
          <button
            type="button"
            onClick={onOpenPhotos}
            className="flex w-full items-center justify-center rounded-[8px] border border-dashed border-[var(--border-strong)] px-2 py-6 text-center text-[11px] text-[var(--faint)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            사진 추가
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {images.map((img, i) => (
              <FilmThumb
                key={img.id}
                img={img}
                index={i}
                onActivate={(url) => {
                  if (onFocusImage) onFocusImage(url);
                  else onOpenPhotos();
                }}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

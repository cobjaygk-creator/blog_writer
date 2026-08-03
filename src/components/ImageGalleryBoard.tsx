"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  imagesToSlots,
  MAX_IMAGE_GROUP_SIZE,
  mergeSlots,
  moveSlot,
  slotImageCount,
  slotsToLayoutPayload,
  type ImageSlot,
  type SlotImage,
  ungroupSlot,
} from "@/lib/image-slots";
import { cn } from "@/lib/utils";

const ACCEPT = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type Props = {
  images: SlotImage[];
  busy: string | null;
  onLayoutChange: (payload: ReturnType<typeof slotsToLayoutPayload>) => Promise<void>;
  onRecaption: (imageId: string) => void;
  onSaveCaption: (imageId: string, caption: string) => void;
  onRemove: (imageId: string) => void;
  onAddFilesToSlot?: (
    targetSlotId: string,
    files: File[],
    options?: { mergeImageIds?: string[] },
  ) => Promise<void> | void;
};

type DragState = {
  slotId: string;
  pointerId: number;
  x: number;
  y: number;
  mode: "reorder" | "merge";
  targetSlotId: string | null;
  insertIndex: number | null;
};

type AddDialogState = {
  slotId: string;
  currentCount: number;
};

export function ImageGalleryBoard({
  images,
  busy,
  onLayoutChange,
  onRecaption,
  onSaveCaption,
  onRemove,
  onAddFilesToSlot,
}: Props) {
  const [slots, setSlots] = useState<ImageSlot[]>(() => imagesToSlots(images));
  const [drag, setDrag] = useState<DragState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addDialog, setAddDialog] = useState<AddDialogState | null>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  useEffect(() => {
    if (drag) return;
    setSlots(imagesToSlots(images));
  }, [images, drag]);

  const mergeTargetId =
    drag?.mode === "merge" && drag.targetSlotId ? drag.targetSlotId : null;

  async function persist(next: ImageSlot[]) {
    setSlots(next);
    setError(null);
    try {
      await onLayoutChange(slotsToLayoutPayload(next));
    } catch (e) {
      const message = e instanceof Error ? e.message : "배치 저장 실패";
      setError(
        message.includes("Unknown argument") || message.includes("groupId")
          ? "서버를 재시작한 뒤 다시 시도해 주세요. (DB 스키마 갱신 필요)"
          : message,
      );
      setSlots(imagesToSlots(images));
    }
  }

  function hitTest(clientX: number, clientY: number, draggingId: string) {
    const entries = [...itemRefs.current.entries()].filter(([id]) => id !== draggingId);
    let bestMerge: { id: string; overlap: number } | null = null;
    let insertIndex: number | null = null;
    let bestGap = Number.POSITIVE_INFINITY;

    for (const [id, el] of entries) {
      const rect = el.getBoundingClientRect();
      const overlapX =
        Math.max(0, Math.min(clientX, rect.right) - Math.max(clientX, rect.left) + rect.width * 0.15);
      const inside =
        clientX >= rect.left + rect.width * 0.15 &&
        clientX <= rect.right - rect.width * 0.15 &&
        clientY >= rect.top + rect.height * 0.12 &&
        clientY <= rect.bottom - rect.height * 0.12;

      if (inside) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.hypot(clientX - cx, clientY - cy);
        const score = 1 / (dist + 1) + overlapX;
        if (!bestMerge || score > bestMerge.overlap) {
          bestMerge = { id, overlap: score };
        }
      }

      const midY = rect.top + rect.height / 2;
      const gapDist = Math.abs(clientY - midY);
      if (gapDist < bestGap) {
        bestGap = gapDist;
        const slotIndex = slots.findIndex((s) => s.id === id);
        insertIndex = clientY < midY ? slotIndex : slotIndex + 1;
        const fromIndex = slots.findIndex((s) => s.id === draggingId);
        if (fromIndex >= 0 && insertIndex > fromIndex) insertIndex -= 1;
      }
    }

    if (bestMerge) {
      const target = slots.find((s) => s.id === bestMerge!.id);
      const source = slots.find((s) => s.id === draggingId);
      if (target && source) {
        const count = slotImageCount(target) + slotImageCount(source);
        if (count <= MAX_IMAGE_GROUP_SIZE) {
          return { mode: "merge" as const, targetSlotId: bestMerge.id, insertIndex: null };
        }
      }
    }

    return { mode: "reorder" as const, targetSlotId: null, insertIndex };
  }

  function onPointerDown(slotId: string, event: React.PointerEvent) {
    if (busy || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("textarea, button, a, input")) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      slotId,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      mode: "reorder",
      targetSlotId: null,
      insertIndex: null,
    });
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const hit = hitTest(event.clientX, event.clientY, drag.slotId);
    setDrag({
      ...drag,
      x: event.clientX,
      y: event.clientY,
      mode: hit.mode,
      targetSlotId: hit.targetSlotId,
      insertIndex: hit.insertIndex,
    });
  }

  async function onPointerUp(event: React.PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    const hit = hitTest(event.clientX, event.clientY, drag.slotId);
    const draggingId = drag.slotId;
    setDrag(null);

    if (hit.mode === "merge" && hit.targetSlotId) {
      const merged = mergeSlots(slots, draggingId, hit.targetSlotId);
      if (!merged) {
        setError(`묶음은 최대 ${MAX_IMAGE_GROUP_SIZE}장까지 가능합니다.`);
        return;
      }
      await persist(merged);
      return;
    }

    if (hit.insertIndex != null) {
      const next = moveSlot(slots, draggingId, hit.insertIndex);
      const same =
        next.length === slots.length && next.every((slot, i) => slot.id === slots[i].id);
      if (!same) await persist(next);
    }
  }

  async function handleUngroup(slotId: string) {
    await persist(ungroupSlot(slots, slotId));
  }

  function openAddDialog(slot: ImageSlot) {
    if (!onAddFilesToSlot || busy) return;
    const count = slotImageCount(slot);
    if (count >= MAX_IMAGE_GROUP_SIZE) {
      setError(`묶음은 최대 ${MAX_IMAGE_GROUP_SIZE}장까지 가능합니다.`);
      return;
    }
    setError(null);
    setAddDialog({ slotId: slot.id, currentCount: count });
  }

  if (!images.length) {
    return <p className="text-sm text-zinc-500">아직 업로드된 사진이 없습니다.</p>;
  }

  const draggingSlot = drag ? slots.find((s) => s.id === drag.slotId) : null;
  const dialogSlot = addDialog ? slots.find((s) => s.id === addDialog.slotId) : null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        각 <strong>단락</strong>은 사진 1장 이상 + 캡션 1개입니다. 사진을 드래그해 순서를 바꾸거나 다른 단락에
        겹치면 묶을 수 있습니다(최대 {MAX_IMAGE_GROUP_SIZE}장). 썸네일을 클릭하면 크게 볼 수 있습니다.
      </p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <ul className="space-y-4">
        {slots.map((slot) => {
          const isDragging = drag?.slotId === slot.id;
          const isMergeTarget = mergeTargetId === slot.id;
          return (
            <li
              key={slot.id}
              ref={(el) => {
                if (el) itemRefs.current.set(slot.id, el);
                else itemRefs.current.delete(slot.id);
              }}
              onPointerDown={(e) => onPointerDown(slot.id, e)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => void onPointerUp(e)}
              onPointerCancel={(e) => {
                if (drag?.pointerId === e.pointerId) setDrag(null);
              }}
              className={cn(
                "relative touch-none rounded-xl border border-zinc-200 bg-white p-3 transition",
                isDragging && "opacity-40",
                isMergeTarget && "border-amber-400 ring-2 ring-amber-300",
                !busy && "cursor-grab active:cursor-grabbing",
              )}
            >
              {isMergeTarget ? (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-amber-50/80">
                  <span className="rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white shadow">
                    묶음
                  </span>
                </div>
              ) : null}

              <ParagraphRow
                slot={slot}
                busy={busy}
                canAdd={Boolean(onAddFilesToSlot) && slotImageCount(slot) < MAX_IMAGE_GROUP_SIZE}
                onUngroup={
                  slot.kind === "group" ? () => void handleUngroup(slot.id) : undefined
                }
                onRecaption={onRecaption}
                onSaveCaption={onSaveCaption}
                onRemove={onRemove}
                onAddImage={() => openAddDialog(slot)}
              />
            </li>
          );
        })}
      </ul>

      {addDialog && dialogSlot && onAddFilesToSlot ? (
        <AddImageDialog
          slot={dialogSlot}
          slots={slots}
          remain={MAX_IMAGE_GROUP_SIZE - addDialog.currentCount}
          busy={busy}
          onClose={() => setAddDialog(null)}
          onConfirm={async (files, mergeImageIds) => {
            await onAddFilesToSlot(addDialog.slotId, files, { mergeImageIds });
            setAddDialog(null);
          }}
        />
      ) : null}

      {drag && draggingSlot ? (
        <div
          className="pointer-events-none fixed z-50 w-40 overflow-hidden rounded-lg border border-zinc-300 bg-white shadow-xl"
          style={{ left: drag.x + 12, top: drag.y + 12 }}
        >
          {draggingSlot.kind === "single" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draggingSlot.image.imageUrl} alt="" className="h-24 w-full object-cover" />
          ) : (
            <div className="grid grid-cols-2 gap-0.5 bg-zinc-100 p-0.5">
              {draggingSlot.images.slice(0, 4).map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.id} src={img.imageUrl} alt="" className="h-12 w-full object-cover" />
              ))}
            </div>
          )}
          {drag.mode === "merge" ? (
            <p className="bg-amber-500 py-1 text-center text-xs font-semibold text-white">묶음</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AddImageDialog({
  slot,
  slots,
  remain,
  busy,
  onClose,
  onConfirm,
}: {
  slot: ImageSlot;
  slots: ImageSlot[];
  remain: number;
  busy: string | null;
  onClose: () => void;
  onConfirm: (files: File[], mergeImageIds: string[]) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const ownIds = new Set(
    slot.kind === "single" ? [slot.image.id] : slot.images.map((img) => img.id),
  );
  const candidates = slots
    .filter((s) => s.id !== slot.id)
    .flatMap((s) => (s.kind === "single" ? [s.image] : s.images))
    .filter((img) => !ownIds.has(img.id));

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  function pickFiles(list: FileList | null) {
    const next = list ? Array.from(list).filter((file) => ACCEPT.has(file.type)) : [];
    if (!next.length) return;
    setFiles((prev) => [...prev, ...next].slice(0, remain));
    setLocalError(null);
  }

  function toggleSelect(imageId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(imageId)) return prev.filter((id) => id !== imageId);
      if (prev.length + files.length >= remain) {
        setLocalError(`이 묶음에는 ${remain}장까지 더 넣을 수 있습니다.`);
        return prev;
      }
      setLocalError(null);
      return [...prev, imageId];
    });
  }

  async function submit() {
    if (!files.length && !selectedIds.length) {
      setLocalError("추가할 이미지를 선택하거나 업로드해 주세요.");
      return;
    }
    if (files.length + selectedIds.length > remain) {
      setLocalError(`이 묶음에는 ${remain}장까지 더 넣을 수 있습니다.`);
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(files, selectedIds);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "추가 실패");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="이미지 추가"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">이미지 추가</h3>
            <p className="mt-1 text-xs text-zinc-500">
              이 단락에 최대 {remain}장까지 더 넣을 수 있습니다. (단락당 최대 {MAX_IMAGE_GROUP_SIZE}장)
            </p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={submitting}>
            닫기
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-800">새 사진 업로드</p>
            <button
              type="button"
              disabled={Boolean(busy) || submitting || remain <= 0}
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center hover:border-zinc-400 hover:bg-zinc-100 disabled:opacity-60"
            >
              <span className="text-sm font-medium text-zinc-800">클릭해서 사진 선택</span>
              <span className="mt-1 text-xs text-zinc-500">JPEG, PNG, WebP, GIF · 여러 장 가능</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(e) => {
                pickFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {previewUrls.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {previewUrls.map((url, index) => (
                  <div key={`${url}-${index}`} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                    <button
                      type="button"
                      className="absolute -right-1 -top-1 rounded-full bg-zinc-900 px-1.5 text-[10px] text-white"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {candidates.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-medium text-zinc-800">이미 올린 사진에서 고르기</p>
              <div className="grid grid-cols-4 gap-2">
                {candidates.map((img) => {
                  const selected = selectedIds.includes(img.id);
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => toggleSelect(img.id)}
                      className={cn(
                        "overflow-hidden rounded-lg border-2",
                        selected ? "border-amber-500 ring-2 ring-amber-200" : "border-transparent",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.imageUrl} alt="" className="h-16 w-full object-cover" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {localError ? <p className="text-sm text-red-600">{localError}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              취소
            </Button>
            <Button
              type="button"
              disabled={submitting || Boolean(busy) || (!files.length && !selectedIds.length)}
              onClick={() => void submit()}
            >
              {submitting ? "추가 중…" : "추가"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ParagraphRow({
  slot,
  busy,
  canAdd,
  onUngroup,
  onRecaption,
  onSaveCaption,
  onRemove,
  onAddImage,
}: {
  slot: ImageSlot;
  busy: string | null;
  canAdd: boolean;
  onUngroup?: () => void;
  onRecaption: (imageId: string) => void;
  onSaveCaption: (imageId: string, caption: string) => void;
  onRemove: (imageId: string) => void;
  onAddImage: () => void;
}) {
  const images = slot.kind === "single" ? [slot.image] : slot.images;
  const primary = images[0];
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const caption = primary?.caption || "";
  const captionKey = images.map((img) => `${img.id}:${img.caption || ""}`).join("|");

  if (!primary) return null;

  return (
    <>
      <div className="grid gap-3 md:grid-cols-[160px_1fr]">
        <ParagraphThumbs
          images={images}
          onOpen={(index) => setPreviewIndex(index)}
          onRemove={onRemove}
          busy={busy}
        />
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {slot.kind === "group" ? (
              <p className="mr-auto text-sm font-medium text-zinc-800">
                단락 <span className="font-normal text-zinc-500">({images.length}장)</span>
              </p>
            ) : (
              <p className="mr-auto text-sm font-medium text-zinc-800">단락</p>
            )}
            {onUngroup ? (
              <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={onUngroup}>
                사진 풀기
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy === `cap-${primary.id}`}
              onClick={() => onRecaption(primary.id)}
            >
              키워드 다시 추천
            </Button>
            {slot.kind === "single" ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy === `del-${primary.id}`}
                onClick={() => onRemove(primary.id)}
              >
                삭제
              </Button>
            ) : null}
          </div>
          <Textarea
            rows={3}
            defaultValue={caption}
            key={captionKey}
            placeholder="예: 장착 전 · 꼼꼼한 포장 / 구성품 · 본품, 볼트와 너트 / 용량 650L · 넉넉한 적재"
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next === caption) return;
              // 단락 장면 키워드는 대표 사진에 저장 (묶음도 키워드 1개)
              onSaveCaption(primary.id, next);
            }}
          />
          {canAdd ? (
            <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={onAddImage}>
              이미지 추가
            </Button>
          ) : null}
        </div>
      </div>

      {previewIndex != null ? (
        <ImageLightbox
          images={images}
          index={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onIndexChange={setPreviewIndex}
        />
      ) : null}
    </>
  );
}

function ParagraphThumbs({
  images,
  onOpen,
  onRemove,
  busy,
}: {
  images: SlotImage[];
  onOpen: (index: number) => void;
  onRemove: (imageId: string) => void;
  busy: string | null;
}) {
  const count = images.length;
  const gridClass =
    count <= 1
      ? "grid-cols-1"
      : count === 2
        ? "grid-cols-2"
        : count === 3
          ? "grid-cols-2"
          : "grid-cols-2";

  return (
    <div
      className={cn(
        "grid h-36 gap-0.5 overflow-hidden rounded-lg bg-zinc-100",
        gridClass,
        count === 3 && "grid-rows-2",
        count === 4 && "grid-rows-2",
      )}
    >
      {images.map((image, index) => (
        <div
          key={image.id}
          className={cn(
            "group relative min-h-0 overflow-hidden",
            count === 3 && index === 0 && "row-span-2",
          )}
        >
          <button
            type="button"
            className="h-full w-full"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(index);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="크게 보기"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.imageUrl}
              alt={image.caption || `사진 ${index + 1}`}
              className="h-full w-full object-cover"
              draggable={false}
            />
          </button>
          {count > 1 ? (
            <button
              type="button"
              title="이 사진만 삭제"
              disabled={busy === `del-${image.id}`}
              className="absolute right-1 top-1 hidden rounded bg-black/70 px-1.5 text-[10px] text-white group-hover:block"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(image.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ImageLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  images: SlotImage[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const current = images[index];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onIndexChange((index - 1 + images.length) % images.length);
      if (e.key === "ArrowRight") onIndexChange((index + 1) % images.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose, onIndexChange]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.imageUrl}
          alt={current.caption || "preview"}
          className="max-h-[80vh] w-full rounded-lg object-contain bg-black"
        />
        <div className="mt-3 flex items-center justify-between gap-2 text-sm text-white">
          <p>
            {index + 1} / {images.length}
          </p>
          <div className="flex gap-2">
            {images.length > 1 ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-white/40 bg-white/10 text-white hover:bg-white/20"
                  onClick={() => onIndexChange((index - 1 + images.length) % images.length)}
                >
                  이전
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-white/40 bg-white/10 text-white hover:bg-white/20"
                  onClick={() => onIndexChange((index + 1) % images.length)}
                >
                  다음
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/40 bg-white/10 text-white hover:bg-white/20"
              onClick={onClose}
            >
              닫기
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

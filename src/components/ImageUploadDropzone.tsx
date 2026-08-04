"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

const ACCEPT = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type Props = {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  /** Defaults to "이미지 업로드" */
  label?: string;
};

export function ImageUploadDropzone({ disabled, onFiles, label = "이미지 업로드" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  function pickImageFiles(list: FileList | File[] | null) {
    if (!list) return [];
    return Array.from(list).filter((file) => ACCEPT.has(file.type));
  }

  function handleFiles(list: FileList | File[] | null) {
    const files = pickImageFiles(list);
    if (!files.length) return;
    onFiles(files);
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-zinc-800">{label}</p>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragDepth.current = 0;
          setDragging(false);
          if (disabled) return;
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20",
          disabled && "cursor-not-allowed opacity-60",
          dragging
            ? "border-amber-400 bg-amber-50"
            : "border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100",
        )}
      >
        <p className="text-sm font-medium text-zinc-800">
          {dragging ? "여기에 놓으면 선택됩니다" : "사진을 드래그해 놓거나 클릭해서 선택"}
        </p>
        <p className="mt-1 text-xs text-zinc-500">JPEG, PNG, WebP, GIF · 여러 장 가능</p>
        {disabled ? <p className="mt-2 text-xs text-zinc-500">업로드 중…</p> : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          disabled={disabled}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

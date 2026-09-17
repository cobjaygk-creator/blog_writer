"use client";

import { Plus } from "lucide-react";
import Link from "next/link";

import { CAPTION_TONE_PRESETS } from "@/lib/caption-tones";
import { USE_DEFAULT_THEME_ID } from "@/lib/default-theme";
import { cn } from "@/lib/utils";

export type Voice = { id: string; name: string; version: number | null };

/** Two ways to pick a voice: a learned brand, or a built-in tone preset (no brand). */
export type VoiceSelection =
  | { kind: "brand"; brandId: string }
  | { kind: "preset"; tone: string };

export function defaultVoiceSelection(voices: Voice[]): VoiceSelection {
  if (voices.length > 0) return { kind: "brand", brandId: voices[0].id };
  return { kind: "preset", tone: CAPTION_TONE_PRESETS[0].value };
}

export function voiceSelectionLabel(selection: VoiceSelection, voices: Voice[]) {
  if (selection.kind === "brand") {
    return voices.find((v) => v.id === selection.brandId)?.name || "기본 테마";
  }
  return CAPTION_TONE_PRESETS.find((p) => p.value === selection.tone)?.label || "기본 톤";
}

/** brandId for the post-create call (null = use account default theme). */
export function voiceSelectionBrandId(selection: VoiceSelection) {
  return selection.kind === "brand" && selection.brandId !== USE_DEFAULT_THEME_ID
    ? selection.brandId
    : null;
}

/** captionTone for the post-create call — a preset overrides the brand's own learned tone. */
export function voiceSelectionCaptionTone(selection: VoiceSelection) {
  return selection.kind === "preset" ? selection.tone : undefined;
}

export function VoiceStep({
  voices,
  value,
  onChange,
}: {
  voices: Voice[];
  value: VoiceSelection;
  onChange: (next: VoiceSelection) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {voices.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-semibold text-[var(--faint)]">내 말투</span>
          <div className="flex flex-wrap gap-2">
            {voices.map((v) => {
              const selected = value.kind === "brand" && value.brandId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onChange({ kind: "brand", brandId: v.id })}
                  className={cn(
                    "flex h-11 items-center gap-1.5 rounded-full px-4 text-[14px] transition-colors",
                    selected
                      ? "border border-[#D9D4FF] bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
                      : "border border-[var(--border)] bg-white font-medium text-[var(--muted)] hover:border-[var(--border-strong)]",
                  )}
                >
                  {v.name}
                  {v.version != null ? (
                    <span className="text-[11px] font-bold opacity-75">v{v.version}</span>
                  ) : null}
                </button>
              );
            })}
            <Link
              href="/brands/new"
              className="flex h-11 items-center gap-1 rounded-full border border-dashed border-[#D4D4DB] bg-white px-4 text-[14px] font-medium text-[#8A8A94] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />새 말투
            </Link>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-[12.5px] font-semibold text-[var(--faint)]">
          {voices.length > 0 ? "또는 기본 톤으로" : "어떤 톤으로 쓸까요"}
        </span>
        <div className="flex flex-wrap gap-2">
          {CAPTION_TONE_PRESETS.map((p) => {
            const selected = value.kind === "preset" && value.tone === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => onChange({ kind: "preset", tone: p.value })}
                className={cn(
                  "flex h-11 items-center rounded-full px-4 text-[14px] transition-colors",
                  selected
                    ? "border border-[#D9D4FF] bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
                    : "border border-[var(--border)] bg-white font-medium text-[var(--muted)] hover:border-[var(--border-strong)]",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

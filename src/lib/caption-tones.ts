/** Sentinel: use the brand's learned StyleTraits.tone at caption time / create time. */
export const BRAND_CAPTION_TONE = "__brand__";

export const CAPTION_TONE_PRESETS = [
  { value: "친근하고 실용적인 안내 톤", label: "친근·실용" },
  { value: "전문적이고 신뢰감 있는 톤", label: "전문·신뢰" },
  { value: "담백하고 사실 위주의 톤", label: "담백·사실" },
  { value: "감성적이고 따뜻한 톤", label: "감성·따뜻" },
  { value: "밝고 활기찬 홍보 톤", label: "밝음·홍보" },
  { value: "짧고 핵심만 전하는 톤", label: "짧고 핵심" },
] as const;

export function isBrandCaptionTone(value: string | null | undefined) {
  return !value || value === BRAND_CAPTION_TONE;
}

export function resolveCaptionTone(
  selected: string | null | undefined,
  brandTone: string | null | undefined,
) {
  if (!selected || selected === BRAND_CAPTION_TONE) {
    return (brandTone || "").trim() || CAPTION_TONE_PRESETS[0].value;
  }
  return selected.trim();
}

export function captionToneOptions(brandTone?: string | null) {
  const brandLabel = brandTone?.trim()
    ? `업체 설정 (${brandTone.trim()})`
    : "업체 설정 (학습 톤)";
  return [
    { value: BRAND_CAPTION_TONE, label: brandLabel },
    ...CAPTION_TONE_PRESETS.map((p) => ({ value: p.value, label: p.label })),
  ];
}

/** Options for editing brand StyleTraits.tone; learned/current value is always selectable. */
export function styleToneOptions(currentTone?: string | null) {
  const current = currentTone?.trim() || "";
  const presets = CAPTION_TONE_PRESETS.map((p) => ({ value: p.value, label: p.label }));
  if (current && !presets.some((p) => p.value === current)) {
    return [{ value: current, label: current }, ...presets];
  }
  return presets;
}

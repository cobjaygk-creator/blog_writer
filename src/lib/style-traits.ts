export type StyleTraits = {
  tone: string;
  sentenceLength: string;
  commonPhrases: string[];
  structureNotes: string;
  emojiUsage: string;
  frequentEmojis: string[];
  lineBreakStyle: string;
  emphasisStyle: string;
  colorPalette: string[];
  fontSizes: string[];
  openerStyle: string;
  closerStyle: string;
};

/** Extra corpus signals stored alongside StyleTraits in traitsJson. */
export type ExtendedStyleTraits = StyleTraits & {
  domainTerms?: string[];
  productMentions?: string[];
  sectionPatterns?: string[];
  ctaPhrases?: string[];
  bannedFluff?: string[];
};

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]|[\u2600-\u26FF]|[\u2700-\u27BF]/gu;

export function emptyStyleTraits(): StyleTraits {
  return {
    tone: "친근하고 실용적인 안내 톤",
    sentenceLength: "짧은 문장 위주",
    commonPhrases: [],
    structureNotes: "도입 → 포인트 → 사진 설명 → 마무리",
    emojiUsage: "중간 — 소제목·감정 포인트에 적절히 사용",
    frequentEmojis: ["✨", "💕", "👍"],
    lineBreakStyle: "짧은 문단과 빈 줄로 리듬감 있게 끊기",
    emphasisStyle: "핵심 키워드는 굵게, 포인트 문장은 색상 강조",
    colorPalette: ["#222222", "#E85D04", "#0B7285"],
    fontSizes: ["15px", "18px", "22px"],
    openerStyle: "공감 한 줄 + 이모지로 시작",
    closerStyle: "방문/예약 유도 + 가벼운 인사",
  };
}

export function analyzeSourceFormatting(texts: string[]): Partial<StyleTraits> {
  const joined = texts.join("\n\n");
  const emojis = joined.match(EMOJI_RE) ?? [];
  const emojiCounts = new Map<string, number>();
  for (const e of emojis) {
    emojiCounts.set(e, (emojiCounts.get(e) || 0) + 1);
  }
  const frequentEmojis = [...emojiCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([e]) => e)
    .filter((e) => e.trim())
    .slice(0, 8);

  const colors = [
    ...new Set(
      [...joined.matchAll(/\[style[^\]]*color=(#[0-9a-fA-F]{3,8})/gi)].map((m) => m[1].toUpperCase()),
    ),
  ].slice(0, 6);

  const fontSizes = [
    ...new Set([...joined.matchAll(/\[style[^\]]*size=([\d.]+px)/gi)].map((m) => m[1])),
  ].slice(0, 5);

  const paras = joined
    .split(/\n+/)
    .map((p) => p.replace(/\[style[^\]]*\]/g, "").trim())
    .filter(Boolean);
  const avgLen = paras.reduce((s, p) => s + p.length, 0) / Math.max(paras.length, 1);
  const shortRatio = paras.filter((p) => p.length <= 40).length / Math.max(paras.length, 1);

  const emojiDensity = emojis.length / Math.max(joined.length / 100, 1);
  let emojiUsage = "거의 없음";
  if (emojiDensity >= 1.2) emojiUsage = "많음 — 문장·소제목에 자주 사용";
  else if (emojiDensity >= 0.35) emojiUsage = "중간 — 포인트마다 자연스럽게 사용";
  else if (emojis.length > 0) emojiUsage = "적음 — 도입/마무리에만 포인트로 사용";

  return {
    frequentEmojis: frequentEmojis.length ? frequentEmojis : undefined,
    emojiUsage,
    colorPalette: colors.length ? colors : undefined,
    fontSizes: fontSizes.length ? fontSizes : undefined,
    sentenceLength: avgLen > 70 ? "중장문 위주" : "짧은 문장 위주",
    lineBreakStyle:
      shortRatio > 0.45
        ? "한두 문장마다 줄바꿈, 빈 줄로 호흡 주기"
        : "문단 단위로 적당히 끊기",
  };
}

export function normalizeTraitsJson(raw: unknown, texts: string[] = []): StyleTraits {
  const base = emptyStyleTraits();
  const heuristic = analyzeSourceFormatting(texts);
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const str = (key: keyof StyleTraits, fallback: string) => {
    const v = obj[key];
    return typeof v === "string" && v.trim() ? v.trim() : fallback;
  };
  const arr = (key: keyof StyleTraits, fallback: string[], max: number) => {
    const v = obj[key];
    if (!Array.isArray(v)) return fallback;
    const next = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, max);
    return next.length ? next : fallback;
  };

  return {
    tone: str("tone", heuristic.tone || base.tone),
    sentenceLength: str("sentenceLength", heuristic.sentenceLength || base.sentenceLength),
    commonPhrases: arr("commonPhrases", base.commonPhrases, 10),
    structureNotes: str("structureNotes", base.structureNotes),
    emojiUsage: str("emojiUsage", heuristic.emojiUsage || base.emojiUsage),
    frequentEmojis: arr(
      "frequentEmojis",
      heuristic.frequentEmojis || base.frequentEmojis,
      8,
    ),
    lineBreakStyle: str("lineBreakStyle", heuristic.lineBreakStyle || base.lineBreakStyle),
    emphasisStyle: str("emphasisStyle", base.emphasisStyle),
    colorPalette: arr("colorPalette", heuristic.colorPalette || base.colorPalette, 6),
    fontSizes: arr("fontSizes", heuristic.fontSizes || base.fontSizes, 5),
    openerStyle: str("openerStyle", base.openerStyle),
    closerStyle: str("closerStyle", base.closerStyle),
  };
}

export function normalizeExtendedTraits(raw: unknown, texts: string[] = []): ExtendedStyleTraits {
  const base = normalizeTraitsJson(raw, texts);
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const arr = (key: string, max: number) => {
    const v = obj[key];
    if (!Array.isArray(v)) return [] as string[];
    return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, max);
  };
  return {
    ...base,
    domainTerms: arr("domainTerms", 40),
    productMentions: arr("productMentions", 30),
    sectionPatterns: arr("sectionPatterns", 12),
    ctaPhrases: arr("ctaPhrases", 16),
    bannedFluff: arr("bannedFluff", 12),
  };
}

/** Turn [style ...] markers into readable plain text for anchors. */
export function stripStyleMarkers(text: string) {
  return text.replace(/\[style[^\]]*\]/g, "").trim();
}

/**
 * Reads an array field straight off the stored JSON, with no "fall back to
 * sample defaults when empty" behavior — normalizeTraitsJson's arr() helper
 * does that fallback (useful for generation prompts, which always want some
 * guidance), but it makes an intentionally-cleared array indistinguishable
 * from a field that was never learned. Rule on/off state needs the true value.
 */
function rawArray(traitsJson: unknown, field: string): string[] {
  if (!traitsJson || typeof traitsJson !== "object") return [];
  const v = (traitsJson as Record<string, unknown>)[field];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

/**
 * Six learned-style signals a user can turn off for future generations.
 * Turning a rule off clears the corresponding field(s) in StyleProfile.traitsJson
 * (the field generation actually reads) without touching rawTraitsJson, so it can
 * be restored later without re-running style learning.
 */
export type StyleRuleKey =
  | "emoji"
  | "commonPhrases"
  | "colorPalette"
  | "fontSizes"
  | "ctaPhrases"
  | "bannedFluff";

export const STYLE_RULE_KEYS: StyleRuleKey[] = [
  "emoji",
  "commonPhrases",
  "colorPalette",
  "fontSizes",
  "ctaPhrases",
  "bannedFluff",
];

const FIELDS: Record<StyleRuleKey, string[]> = {
  emoji: ["frequentEmojis", "emojiUsage"],
  commonPhrases: ["commonPhrases"],
  colorPalette: ["colorPalette"],
  fontSizes: ["fontSizes"],
  ctaPhrases: ["ctaPhrases"],
  bannedFluff: ["bannedFluff"],
};

const OFF_VALUES: Record<StyleRuleKey, Record<string, unknown>> = {
  emoji: { frequentEmojis: [], emojiUsage: "사용 안 함" },
  commonPhrases: { commonPhrases: [] },
  colorPalette: { colorPalette: [] },
  fontSizes: { fontSizes: [] },
  ctaPhrases: { ctaPhrases: [] },
  bannedFluff: { bannedFluff: [] },
};

export function ruleTitle(key: StyleRuleKey): string {
  return {
    emoji: "이모지 사용",
    commonPhrases: "자주 쓰는 표현",
    colorPalette: "강조색 사용",
    fontSizes: "글자 크기 강조",
    ctaPhrases: "마무리 CTA 문구",
    bannedFluff: "군더더기 표현 회피",
  }[key];
}

/** `traitsJson` is the raw StyleProfile.traitsJson value (unnormalized). */
export function ruleDescription(key: StyleRuleKey, traitsJson: unknown): string {
  const values = rawArray(traitsJson, FIELDS[key][0]);
  switch (key) {
    case "emoji":
      return values.length ? `자주 씀: ${values.slice(0, 5).join(" ")}` : "이모지를 거의 사용하지 않음";
    case "commonPhrases":
      return values.length ? values.slice(0, 3).join(" · ") : "특별히 반복되는 표현이 없음";
    case "colorPalette":
      return values.length ? `${values.length}가지 색상으로 강조` : "강조색을 쓰지 않음";
    case "fontSizes":
      return values.length ? values.join(", ") : "글자 크기 강조가 없음";
    case "ctaPhrases":
      return values.length ? values.slice(0, 2).join(" · ") : "마무리 CTA 문구가 없음";
    case "bannedFluff":
      return values.length ? `${values.length}개 군더더기 표현을 피함` : "회피 대상 표현이 없음";
  }
}

/** `traitsJson` is the raw StyleProfile.traitsJson value (unnormalized). */
export function isRuleActive(traitsJson: unknown, key: StyleRuleKey): boolean {
  return rawArray(traitsJson, FIELDS[key][0]).length > 0;
}

/**
 * Returns the next traitsJson after toggling `key`. `enabled: false` clears the
 * rule's fields; `enabled: true` restores them from rawTraitsJson when available.
 *
 * Deliberately does NOT round-trip through normalizeExtendedTraits: that helper
 * fills empty arrays with sample defaults (useful for generation prompts), which
 * would silently "un-clear" every other currently-off rule on every toggle.
 * This merges raw JSON only, touching just the fields for `key`.
 */
export function toggleStyleRule(
  traitsJson: unknown,
  rawTraitsJson: unknown,
  key: StyleRuleKey,
  enabled: boolean,
): Record<string, unknown> {
  const current: Record<string, unknown> =
    traitsJson && typeof traitsJson === "object" ? { ...(traitsJson as Record<string, unknown>) } : {};

  if (!enabled) {
    return { ...current, ...OFF_VALUES[key] };
  }

  const raw = rawTraitsJson && typeof rawTraitsJson === "object" ? (rawTraitsJson as Record<string, unknown>) : null;
  const restored = { ...current };
  for (const field of FIELDS[key]) {
    if (raw && field in raw) restored[field] = raw[field];
  }
  return restored;
}

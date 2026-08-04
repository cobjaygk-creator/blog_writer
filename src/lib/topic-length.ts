export const TOPIC_LENGTHS = ["short", "medium", "long"] as const;
export type TopicLength = (typeof TOPIC_LENGTHS)[number];

export type TopicLengthPreset = {
  id: TopicLength;
  label: string;
  hint: string;
  /** Target plain-text length (approx. Korean chars) */
  targetChars: { min: number; max: number };
  /** Default section / image count */
  sectionCount: number;
  bulletMin: number;
  bulletMax: number;
  /** How much prose per section */
  paragraphsPerSection: string;
  planMaxTokens: number;
  draftMaxTokens: number;
};

export const TOPIC_LENGTH_PRESETS: Record<TopicLength, TopicLengthPreset> = {
  short: {
    id: "short",
    label: "짧게",
    hint: "약 800~1,200자 · 핵심만",
    targetChars: { min: 800, max: 1200 },
    sectionCount: 3,
    bulletMin: 2,
    bulletMax: 3,
    paragraphsPerSection: "섹션당 본문 1~2문단",
    planMaxTokens: 1600,
    draftMaxTokens: 2800,
  },
  medium: {
    id: "medium",
    label: "보통",
    hint: "약 1,500~2,200자",
    targetChars: { min: 1500, max: 2200 },
    sectionCount: 4,
    bulletMin: 3,
    bulletMax: 4,
    paragraphsPerSection: "섹션당 본문 2~3문단",
    planMaxTokens: 2200,
    draftMaxTokens: 4500,
  },
  long: {
    id: "long",
    label: "길게",
    hint: "약 2,500~3,500자 · 자세히",
    targetChars: { min: 2500, max: 3500 },
    sectionCount: 5,
    bulletMin: 3,
    bulletMax: 5,
    paragraphsPerSection: "섹션당 본문 3~4문단, 예시·체크포인트 포함",
    planMaxTokens: 2800,
    draftMaxTokens: 6000,
  },
};

export function normalizeTopicLength(value: unknown): TopicLength {
  if (value === "short" || value === "medium" || value === "long") return value;
  return "medium";
}

export function getTopicLengthPreset(length?: TopicLength | string | null): TopicLengthPreset {
  return TOPIC_LENGTH_PRESETS[normalizeTopicLength(length)];
}

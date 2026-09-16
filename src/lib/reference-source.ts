import { fetchSourceFromUrl } from "@/lib/fetch-source";

/** One reference article the user wants transformed into a new post. */
export type ReferenceBrief = {
  title: string | null;
  text: string;
  sourceUrl: string | null;
};

/** Prompt budget: enough structure to mirror, short enough to stay cheap. */
const PROMPT_MAX_CHARS = 6000;
const MIN_CHARS = 80;

export async function resolveReferenceSource(input: {
  url?: string | null;
  text?: string | null;
}): Promise<ReferenceBrief> {
  const pasted = input.text?.trim() || "";
  const url = input.url?.trim() || "";

  if (pasted.length >= MIN_CHARS) {
    return {
      title: firstLineAsTitle(pasted),
      text: pasted.slice(0, PROMPT_MAX_CHARS),
      sourceUrl: url || null,
    };
  }

  if (!url) {
    throw new Error("참고할 글의 주소(URL)를 넣거나 본문을 붙여넣어 주세요.");
  }

  const fetched = await fetchSourceFromUrl(url);
  return {
    title: fetched.title,
    text: fetched.text.slice(0, PROMPT_MAX_CHARS),
    sourceUrl: fetched.sourceUrl,
  };
}

/** Topic used for planning / image search when the user gave no keyword. */
export function deriveReferenceTopic(reference: ReferenceBrief, keyword?: string | null) {
  const explicit = keyword?.trim();
  if (explicit) return explicit.slice(0, 120);
  const title = reference.title?.trim();
  if (title) return title.slice(0, 120);
  return firstLineAsTitle(reference.text)?.slice(0, 120) || "참고 글 재작성";
}

/** Heuristic (non-LLM) structure summary for the 6c "이 글의 구성" preview. */
export type ReferenceStructure = {
  charCount: number;
  paragraphCount: number;
  imageCount: number;
  /** Short labels for up to 4 roughly-equal content blocks, in reading order. */
  sections: string[];
  /** Frequent nouny tokens — "다루는 항목". */
  topics: string[];
  /** Same pool, shorter — "검색 키워드". */
  keywords: string[];
};

const STOPWORDS = new Set([
  "그리고",
  "그래서",
  "하지만",
  "그런데",
  "이번",
  "오늘",
  "저희",
  "우리",
  "합니다",
  "했습니다",
  "있습니다",
  "됩니다",
  "그냥",
  "정말",
  "너무",
  "조금",
]);

export function summarizeReferenceStructure(
  rawText: string,
  imageCount: number,
): ReferenceStructure {
  // Strip the "[style color=#.. size=..]" annotations fetch-source adds for style learning —
  // they're prompt metadata, not content, and shouldn't leak into a user-facing label.
  const text = rawText.replace(/\[style[^\]]*\]/g, "").trim();

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 8);

  const groupCount = Math.min(4, Math.max(1, paragraphs.length));
  const sections: string[] = [];
  if (paragraphs.length) {
    const perGroup = Math.ceil(paragraphs.length / groupCount);
    for (let i = 0; i < groupCount; i += 1) {
      const group = paragraphs.slice(i * perGroup, (i + 1) * perGroup);
      if (!group.length) continue;
      sections.push(labelFromText(group[0]));
    }
  }

  const tokens = text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && t.length <= 10 && !STOPWORDS.has(t));

  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  const ranked = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);

  return {
    charCount: text.length,
    paragraphCount: paragraphs.length,
    imageCount,
    sections,
    topics: ranked.slice(0, 6),
    keywords: ranked.slice(0, 4),
  };
}

function labelFromText(paragraph: string) {
  const firstSentence = paragraph.split(/(?<=[.!?。])\s|\n/)[0] || paragraph;
  return firstSentence.trim().slice(0, 16);
}

export function formatReferenceForPrompt(reference: ReferenceBrief) {
  const head = reference.title?.trim() ? `제목: ${reference.title.trim()}` : "제목: (없음)";
  return `${head}
본문:
${reference.text}`;
}

function firstLineAsTitle(text: string) {
  const line = text
    .split(/\n+/)
    .map((l) => l.trim())
    .find((l) => l.length >= 4);
  if (!line) return null;
  return line.slice(0, 120);
}

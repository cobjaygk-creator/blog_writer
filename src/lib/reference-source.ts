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

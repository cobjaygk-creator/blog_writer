import { chatCompletion } from "@/lib/llm";
import { allowFallback, isLlmConfigured } from "@/lib/integrations";
import { stripStyleMarkers } from "@/lib/style-traits";

export type CorpusSignals = {
  domainTerms: string[];
  productMentions: string[];
  sectionPatterns: string[];
  ctaPhrases: string[];
  bannedFluff: string[];
};

const DEFAULT_BANNED = [
  "유익한 정보로 돌아오겠습니다",
  "특별한 드라이빙 경험",
  "세련된 변신",
  "매력적으로 변신했습니다",
];

function uniq(items: string[], max: number) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const t = item.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Heuristic extraction when LLM is unavailable. */
export function heuristicCorpusSignals(
  texts: Array<{ title?: string | null; rawText: string }>,
): CorpusSignals {
  const joined = texts.map((t) => `${t.title || ""}\n${stripStyleMarkers(t.rawText)}`).join("\n");
  const terms = [
    ...joined.matchAll(
      /([가-힣A-Za-z0-9]{2,20}(?:바디킷|머플러|썬팅|블랙박스|루프박스|하이리무진|페이스리프트|장착|시공|튜닝|그릴|범퍼))/g,
    ),
  ].map((m) => m[1]);

  const products = texts
    .map((t) => (t.title || "").replace(/\[[^\]]*\]/g, "").trim())
    .filter((t) => t.length >= 6 && t.length <= 80);

  const ctaHits = [
    ...joined.matchAll(/(가격\s*할인|상담|문의|전화|방문\s*상담|당일\s*장착|이벤트|견적)/g),
  ].map((m) => m[1].replace(/\s+/g, ""));

  return {
    domainTerms: uniq(terms, 40),
    productMentions: uniq(products, 30),
    sectionPatterns: [
      "인사/도입",
      "제품·시공 포인트",
      "사진별 작업·디테일 설명",
      "상담·가격 CTA",
    ],
    ctaPhrases: uniq(ctaHits, 16),
    bannedFluff: DEFAULT_BANNED,
  };
}

export async function extractCorpusSignals(
  texts: Array<{ title?: string | null; rawText: string }>,
): Promise<CorpusSignals> {
  const fallback = heuristicCorpusSignals(texts);
  if (!texts.length) return fallback;

  if (!isLlmConfigured()) {
    if (!allowFallback()) throw new Error("LLM_API_KEY가 설정되지 않았습니다.");
    return fallback;
  }

  const chunks = texts.slice(0, 40).map((t, i) => {
    const body = stripStyleMarkers(t.rawText).slice(0, 700);
    return `[글 ${i + 1}] ${t.title || "(제목없음)"}\n${body}`;
  });

  try {
    const { text } = await chatCompletion(
      [
        {
          role: "system",
          content:
            "당신은 한국어 시공/제품 블로그 코퍼스 분석가입니다. JSON만 반환하세요. 키: domainTerms(string[]), productMentions(string[]), sectionPatterns(string[]), ctaPhrases(string[]), bannedFluff(string[] 피해야 할 범용 AI 표현).",
        },
        {
          role: "user",
          content: `다음 원문들에서 시공 용어·제품명·글 골격·CTA·피해야 할 라이프스타일 표현을 추출하세요.\n\n${chunks.join("\n\n")}`,
        },
      ],
      { json: true, temperature: 0, maxTokens: 1800 },
    );
    const parsed = JSON.parse(text) as Partial<CorpusSignals>;
    return {
      domainTerms: uniq([...(parsed.domainTerms || []), ...fallback.domainTerms], 40),
      productMentions: uniq([...(parsed.productMentions || []), ...fallback.productMentions], 30),
      sectionPatterns: uniq(
        [...(parsed.sectionPatterns || []), ...fallback.sectionPatterns],
        12,
      ),
      ctaPhrases: uniq([...(parsed.ctaPhrases || []), ...fallback.ctaPhrases], 16),
      bannedFluff: uniq([...(parsed.bannedFluff || []), ...fallback.bannedFluff], 12),
    };
  } catch {
    return fallback;
  }
}

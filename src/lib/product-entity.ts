import { chatCompletion } from "@/lib/llm";
import { allowFallback, isLlmConfigured } from "@/lib/integrations";

export const PRODUCT_ENTITY_CONFIDENCE_THRESHOLD = 0.6;

export type ProductEntityDetection = {
  productName: string | null;
  confidence: number;
};

export const PRODUCT_TAIL =
  /(바디킷|사이드스텝|머플러(?:팁)?|썬팅|블랙박스|루프(?:박스|탑|텐트)?|하이리무진|페이스리프트|범퍼|그릴|매트|방음|튜닝|스포일러|에어댐|휠|램프|라이트|하드탑|캐노피)/i;

/**
 * Detect an explicit product name from a post title (or keyword used as title).
 * Heuristic first; low-cost LLM fallback when ambiguous.
 */
export async function detectProductEntity(
  title: string,
  brandDomainTerms: string[] = [],
): Promise<ProductEntityDetection> {
  const raw = title.trim();
  if (!raw) return { productName: null, confidence: 0 };

  const heuristic = heuristicDetect(raw, brandDomainTerms);
  if (heuristic.confidence >= PRODUCT_ENTITY_CONFIDENCE_THRESHOLD) {
    return heuristic;
  }

  if (!isLlmConfigured()) {
    if (!allowFallback()) {
      throw new Error("LLM_API_KEY가 설정되지 않았습니다.");
    }
    return heuristic;
  }

  try {
    const { text } = await chatCompletion(
      [
        {
          role: "system",
          content:
            'JSON만 반환. 키: productName(string|null), confidence(0~1 number). 제목에 특정 제품·시공 품목이 명시되어 있으면 그 제품명만 짧게 반환. 없으면 productName=null, confidence=0. 추측·일반 키워드("후기","시공")만으로 제품명을 만들지 마세요.',
        },
        {
          role: "user",
          content: `제목: ${raw}\n브랜드 용어 힌트: ${brandDomainTerms.slice(0, 20).join(", ") || "(없음)"}`,
        },
      ],
      { json: true, temperature: 0, maxTokens: 200 },
    );
    const parsed = JSON.parse(text) as { productName?: string | null; confidence?: number };
    const name =
      typeof parsed.productName === "string" && parsed.productName.trim()
        ? parsed.productName.trim().slice(0, 80)
        : null;
    const confidence =
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.min(1, Math.max(0, parsed.confidence))
        : name
          ? 0.7
          : 0;
    if (name && confidence >= PRODUCT_ENTITY_CONFIDENCE_THRESHOLD) {
      return { productName: name, confidence };
    }
    return heuristic.confidence > confidence ? heuristic : { productName: name, confidence };
  } catch {
    return heuristic;
  }
}

function heuristicDetect(title: string, brandDomainTerms: string[]): ProductEntityDetection {
  const cleaned = title
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[!?~…\.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // e.g. "카니발 페이스리프트 AG바디킷 머플러팁"
  const withTail = cleaned.match(
    new RegExp(
      `([가-힣A-Za-z0-9][가-힣A-Za-z0-9\\s\\-]{1,40}?(?:${PRODUCT_TAIL.source}))`,
      "i",
    ),
  );
  if (withTail?.[1]) {
    const name = normalizeProductName(withTail[1]);
    if (name.length >= 4) return { productName: name, confidence: 0.85 };
  }

  // Model-ish + product term nearby
  const modelish = cleaned.match(
    /([A-Za-z]{1,4}\d{1,4}|[가-힣]{2,12})\s*([A-Za-z]{1,6})?\s*(바디킷|튜닝|썬팅|블랙박스|루프박스)/i,
  );
  if (modelish) {
    const name = normalizeProductName(`${modelish[1]} ${modelish[2] || ""} ${modelish[3]}`);
    if (name.length >= 4) return { productName: name, confidence: 0.75 };
  }

  for (const term of brandDomainTerms) {
    const t = term.trim();
    if (t.length < 3) continue;
    if (cleaned.includes(t) && PRODUCT_TAIL.test(t)) {
      return { productName: normalizeProductName(t), confidence: 0.7 };
    }
    if (cleaned.includes(t) && PRODUCT_TAIL.test(cleaned)) {
      const m = cleaned.match(
        new RegExp(`(${escapeRegExp(t)}[^,]{0,24}${PRODUCT_TAIL.source})`, "i"),
      );
      if (m?.[1]) {
        return { productName: normalizeProductName(m[1]), confidence: 0.72 };
      }
    }
  }

  if (PRODUCT_TAIL.test(cleaned) && cleaned.length <= 40) {
    return { productName: normalizeProductName(cleaned), confidence: 0.55 };
  }

  return { productName: null, confidence: 0 };
}

function normalizeProductName(name: string) {
  return name
    .replace(/\s+/g, " ")
    .replace(/^(오늘|후기|시공|장착|작업)\s*/g, "")
    .trim()
    .slice(0, 80);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

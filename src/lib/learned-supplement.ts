import { chatCompletion } from "@/lib/llm";
import { allowFallback, isLlmConfigured } from "@/lib/integrations";
import { logWarn } from "@/lib/observability";
import { PRODUCT_TAIL } from "@/lib/product-entity";

export type ProductKey = {
  vehicle: string;
  part: string;
  productKey: string;
  confidence: number;
};

export type LearnedSupplementPoint = {
  point: string;
  kind: "process" | "check" | "tip" | "caution" | "other";
  sourcePostId?: string;
  confidence?: number;
};

export type SourceForSupplement = {
  id: string;
  title: string | null;
  rawText: string;
  productKey?: string | null;
  vehicle?: string | null;
  part?: string | null;
};

const VEHICLE_HINTS =
  /(카니발|쏘렌토|스포티지|투싼|싼타페|팰리세이드|GV\d{2}|G\d{2}|스타리아|스타렉스|레이|모닝|니로|EV\d|아이오닉|코나|셀토스|QM\d|QM6|XM3|QM3|티구안|골프|미니|벤츠|BMW|아우디)/i;

const VEHICLE_CODE = /\b([A-Z]{1,3}\d{1,2}|MQ4|KA4|MQ4a|MQ4H|HiR)\b/i;

const INTENT_BUCKETS: Array<{ id: string; patterns: RegExp[] }> = [
  {
    id: "precheck",
    patterns: [/손상/, /시공\s*가능/, /작업\s*전/, /사전/, /점검/, /확인/, /간섭/, /여유/],
  },
  {
    id: "remove",
    patterns: [/탈거/, /분해/, /분리/, /제거/, /순정/],
  },
  {
    id: "install",
    patterns: [/장착/, /조립/, /볼트/, /체결/, /고정/, /피팅/, /정렬/],
  },
  {
    id: "finish",
    patterns: [/마감/, /실리콘/, /도장/, /클리닝/, /청소/, /마무리/],
  },
  {
    id: "complete",
    patterns: [/완성/, /출고/, /최종/, /완료/, /결과/],
  },
];

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function slugPart(s: string) {
  return normalizeText(s).replace(/\s+/g, "_").slice(0, 40);
}

export function learnedSupplementEnabled() {
  const v = process.env.LEARNED_SUPPLEMENT_ENABLED?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

export function learnedSupplementMaxPoints() {
  const n = Number(process.env.LEARNED_SUPPLEMENT_MAX_POINTS?.trim());
  if (!Number.isFinite(n)) return 5;
  return Math.min(8, Math.max(3, Math.floor(n)));
}

/** Heuristic product key from keyword / notes / product name. */
export function resolveProductKey(input: {
  keyword: string;
  notes?: string | null;
  productName?: string | null;
}): ProductKey | null {
  const blob = [input.keyword, input.notes || "", input.productName || ""].join(" ").trim();
  if (!blob) return null;

  const code = blob.match(VEHICLE_CODE)?.[1]?.toUpperCase() || "";
  const vehicleName = blob.match(VEHICLE_HINTS)?.[1] || "";
  const partMatch = blob.match(PRODUCT_TAIL)?.[1] || "";

  // Prefer longer productName tail if present
  let part = partMatch;
  if (input.productName?.trim()) {
    const fromName = input.productName.match(PRODUCT_TAIL)?.[1];
    if (fromName) part = fromName;
  }

  const vehicle = [vehicleName, code].filter(Boolean).join(" ").trim();
  if (!vehicle || !part) {
    // Fallback: productName as part, first 2 tokens as vehicle-ish
    const pn = input.productName?.trim() || "";
    if (pn && PRODUCT_TAIL.test(pn)) {
      const tokens = tokenize(input.keyword || pn);
      const v = tokens.slice(0, 2).join(" ");
      const p = pn.match(PRODUCT_TAIL)?.[1] || pn;
      if (v && p) {
        return {
          vehicle: v,
          part: p,
          productKey: `${slugPart(v)}|${slugPart(p)}`,
          confidence: 0.58,
        };
      }
    }
    return null;
  }

  let confidence = 0.5;
  if (vehicleName) confidence += 0.2;
  if (code) confidence += 0.15;
  if (part) confidence += 0.15;
  confidence = Math.min(1, confidence);

  return {
    vehicle,
    part,
    productKey: `${slugPart(vehicle)}|${slugPart(part)}`,
    confidence,
  };
}

/** Index fields to store on SourcePost at create/learn time. */
export function indexFieldsFromSourceText(title: string | null, rawText: string): {
  vehicle: string | null;
  part: string | null;
  productKey: string | null;
} {
  const key = resolveProductKey({
    keyword: title || "",
    notes: rawText.slice(0, 800),
    productName: title,
  });
  if (!key || key.confidence < 0.55) {
    return { vehicle: null, part: null, productKey: null };
  }
  return {
    vehicle: key.vehicle.slice(0, 80),
    part: key.part.slice(0, 80),
    productKey: key.productKey.slice(0, 120),
  };
}

function sourceMatchesProduct(source: SourceForSupplement, key: ProductKey): boolean {
  if (source.productKey && source.productKey === key.productKey) return true;
  if (source.vehicle && source.part) {
    const sv = normalizeText(source.vehicle);
    const sp = normalizeText(source.part);
    if (sv && sp && normalizeText(key.vehicle).includes(sv.split(" ")[0] || sv) && sp.includes(normalizeText(key.part).slice(0, 4))) {
      return true;
    }
  }
  const hay = normalizeText(`${source.title || ""}\n${source.rawText.slice(0, 6000)}`);
  const vTokens = tokenize(key.vehicle);
  const pTokens = tokenize(key.part);
  const vHit = vTokens.some((t) => hay.includes(t)) || (key.vehicle.length >= 3 && hay.includes(normalizeText(key.vehicle).replace(/\s+/g, "")));
  const pHit = pTokens.some((t) => hay.includes(t)) || PRODUCT_TAIL.test(hay);
  // Need vehicle signal + part signal
  const code = key.vehicle.match(VEHICLE_CODE)?.[1]?.toLowerCase();
  const codeHit = code ? hay.includes(code.toLowerCase()) : false;
  return (vHit || codeHit) && pHit;
}

export function filterSameProductSources(
  sources: SourceForSupplement[],
  key: ProductKey,
): SourceForSupplement[] {
  return sources.filter((s) => sourceMatchesProduct(s, key));
}

function splitParagraphs(raw: string): string[] {
  return raw
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}|\n(?=[-•*]|\d+\.)/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 12 && p.length <= 500);
}

function intentBuckets(text: string): string[] {
  const hits: string[] = [];
  for (const b of INTENT_BUCKETS) {
    if (b.patterns.some((re) => re.test(text))) hits.push(b.id);
  }
  return hits;
}

function overlapScore(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = tokenize(b);
  if (!ta.size || !tb.length) return 0;
  let hit = 0;
  for (const t of tb) {
    if (ta.has(t)) hit += 1;
  }
  return hit + (normalizeText(b).includes(normalizeText(a).slice(0, 8)) ? 0.5 : 0);
}

type MatchedParagraph = {
  text: string;
  sourcePostId: string;
  score: number;
  imageIndex: number;
};

export function matchParagraphsToImagePrompts(
  sources: SourceForSupplement[],
  imagePrompts: string[],
): MatchedParagraph[] {
  const prompts = imagePrompts.map((p) => p.trim()).filter(Boolean);
  if (!prompts.length || !sources.length) return [];

  const matched: MatchedParagraph[] = [];
  for (let i = 0; i < prompts.length; i += 1) {
    const prompt = prompts[i];
    const promptBuckets = new Set(intentBuckets(prompt));
    const scored: MatchedParagraph[] = [];
    for (const src of sources) {
      for (const para of splitParagraphs(src.rawText)) {
        let score = overlapScore(prompt, para);
        const paraBuckets = intentBuckets(para);
        for (const b of paraBuckets) {
          if (promptBuckets.has(b)) score += 2.5;
        }
        if (score >= 1.2) {
          scored.push({
            text: para,
            sourcePostId: src.id,
            score,
            imageIndex: i,
          });
        }
      }
    }
    scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .forEach((m) => matched.push(m));
  }

  // Dedupe similar paragraphs
  const unique: MatchedParagraph[] = [];
  for (const m of matched.sort((a, b) => b.score - a.score)) {
    const norm = normalizeText(m.text).slice(0, 80);
    if (unique.some((u) => normalizeText(u.text).slice(0, 80) === norm)) continue;
    unique.push(m);
    if (unique.length >= 12) break;
  }
  return unique;
}

async function extractPointsWithLlm(
  key: ProductKey,
  paragraphs: MatchedParagraph[],
  maxPoints: number,
): Promise<LearnedSupplementPoint[]> {
  if (!paragraphs.length) return [];
  if (!isLlmConfigured()) {
    if (!allowFallback()) return [];
    return paragraphs.slice(0, maxPoints).map((p) => ({
      point: p.text.slice(0, 80),
      kind: "tip" as const,
      sourcePostId: p.sourcePostId,
      confidence: 0.4,
    }));
  }

  const packed = paragraphs
    .slice(0, 10)
    .map((p, i) => `[${i + 1}] (source=${p.sourcePostId})\n${p.text}`)
    .join("\n\n");

  try {
    const { text } = await chatCompletion(
      [
        {
          role: "system",
          content: `JSON만 반환. 키: points(array of {point, kind, sourcePostId}).
product는 "${key.vehicle}" / "${key.part}" 이다.
규칙:
- 원문 근거가 있는 시공·점검·팁만 point로 1문장(최대 80자) 추출
- kind는 process|check|tip|caution 중 하나
- 문장 복붙 금지, 요약만
- 가격·색상·다른 차종 스펙이 원문에 없으면 넣지 말 것
- 최대 ${maxPoints}개`,
        },
        { role: "user", content: packed },
      ],
      { json: true, temperature: 0.2, maxTokens: 900 },
    );
    const parsed = JSON.parse(text) as {
      points?: Array<{ point?: string; kind?: string; sourcePostId?: string }>;
    };
    const kinds = new Set(["process", "check", "tip", "caution", "other"]);
    const out: LearnedSupplementPoint[] = [];
    for (const p of parsed.points || []) {
      const point = typeof p.point === "string" ? p.point.trim().slice(0, 80) : "";
      if (!point) continue;
      const kind = kinds.has(String(p.kind))
        ? (p.kind as LearnedSupplementPoint["kind"])
        : "other";
      out.push({
        point,
        kind,
        sourcePostId: typeof p.sourcePostId === "string" ? p.sourcePostId : undefined,
        confidence: 0.7,
      });
      if (out.length >= maxPoints) break;
    }
    return out;
  } catch (e) {
    logWarn("learned-supplement", "extract failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

export async function collectLearnedSupplements(input: {
  sources: SourceForSupplement[];
  keyword: string;
  notes?: string | null;
  imagePrompts: string[];
  productName?: string | null;
  enabled?: boolean;
}): Promise<LearnedSupplementPoint[]> {
  if (input.enabled === false || !learnedSupplementEnabled()) return [];
  if (!input.imagePrompts.some((p) => p.trim())) return [];

  const key = resolveProductKey({
    keyword: input.keyword,
    notes: input.notes,
    productName: input.productName,
  });
  if (!key || key.confidence < 0.55) return [];

  const same = filterSameProductSources(input.sources, key);
  if (same.length < 2) return [];

  const matched = matchParagraphsToImagePrompts(same, input.imagePrompts);
  if (!matched.length) return [];

  const points = await extractPointsWithLlm(key, matched, learnedSupplementMaxPoints());
  // Drop points that clearly contradict notes/keyword product
  const blob = normalizeText(`${input.keyword} ${input.notes || ""}`);
  return points.filter((p) => {
    const pt = normalizeText(p.point);
    // crude contradiction: different vehicle code in point
    const codes = pt.match(/\b([a-z]{1,3}\d{1,2}|mq4|ka4)\b/gi) || [];
    const keyCode = key.vehicle.match(VEHICLE_CODE)?.[1]?.toLowerCase();
    if (keyCode && codes.some((c) => c.toLowerCase() !== keyCode && !blob.includes(c.toLowerCase()))) {
      return false;
    }
    return true;
  });
}

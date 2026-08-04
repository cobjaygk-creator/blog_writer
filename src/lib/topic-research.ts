import { chatCompletion } from "@/lib/llm";
import { allowFallback, isLlmConfigured } from "@/lib/integrations";
import { collectSearchHits, type WebSearchHit } from "@/lib/product-facts";
import { looksLikeNewsTopic } from "@/lib/news-images";

export type TopicResearchSource = {
  title: string;
  url?: string;
  note?: string;
};

export type TopicResearchBrief = {
  topic: string;
  facts: string[];
  angles: string[];
  caveats: string[];
  sources: TopicResearchSource[];
  /** Raw search hits (for news image / URL grounding). */
  hits: WebSearchHit[];
  /** True when search clearly surfaces news outlets. */
  isNewsTopic: boolean;
  fetchedAt: string;
  usedFallback: boolean;
};

/**
 * Search news/blogs for a topic and distill a cross-checked research brief.
 * Used to ground topic drafts in external snippets rather than pure LLM memory.
 */
export async function researchTopicBrief(topic: string): Promise<TopicResearchBrief> {
  const q = topic.trim().slice(0, 120);
  const empty: TopicResearchBrief = {
    topic: q,
    facts: [],
    angles: [],
    caveats: [],
    sources: [],
    hits: [],
    isNewsTopic: false,
    fetchedAt: new Date().toISOString(),
    usedFallback: true,
  };
  if (!q) return empty;

  const queries = [
    `${q}`,
    `${q} 뉴스`,
    `${q} 속보`,
    `${q} 현장 사진`,
  ];

  const groups = await Promise.all(
    queries.map((query) => collectSearchHits(query, 6, { includeImages: true })),
  );
  const hits = dedupeHits(groups.flat());
  const labeled = hits.map(
    (h, i) => `소스${i + 1}:\n[${h.url}] ${h.title}\n${h.content}`,
  );

  if (!labeled.length) {
    if (!allowFallback()) {
      return {
        ...empty,
        caveats: ["검색 결과가 없어 일반 지식만으로 쓸 수 없습니다. 검색 API를 확인하세요."],
        usedFallback: true,
      };
    }
    return {
      ...empty,
      facts: [`${q}에 대한 공개 설명이 필요하다`],
      angles: ["정의", "주요 원인", "영향", "대응"],
      caveats: ["웹 검색 결과가 없어 일반론으로만 구성됨 — 단정·수치 최소화"],
      usedFallback: true,
    };
  }

  if (!isLlmConfigured()) {
    if (!allowFallback()) throw new Error("LLM_API_KEY가 설정되지 않았습니다.");
    return heuristicBrief(q, labeled, hits);
  }

  try {
    const { text } = await chatCompletion(
      [
        {
          role: "system",
          content: `당신은 뉴스·블로그 리서처입니다. JSON만 반환.
키:
- facts(string[] 최대 12): 여러 소스에서 겹치거나 신뢰할 만한 사실·설명. 스니펫에 없는 수치/날짜/기관명은 넣지 마세요. 사건·속보면 누가/언제/어디서/무엇을 우선.
- angles(string[] 최대 8): 글 구성 각도. 사건 뉴스는 타임라인·수사·확인된 사실 위주. 일반 해설은 정의·원인·영향·대응.
- caveats(string[] 최대 6): 불확실·상충·주의할 점.
- sources(array 최대 8): { title, url?, note? } — 스니펫에 URL/제목이 있을 때만. URL을 지어내지 마세요. 가능하면 뉴스 매체 URL을 우선.
교차검증: 한 소스에만 있는 자극적 주장은 facts에 넣지 말고 caveats로. 단 공식 발표·경찰 브리핑은 남겨도 됨.
톤: 전문·중립. 광고성·낚시성 표현 제외.`,
        },
        {
          role: "user",
          content: `주제: ${q}\n\n검색 스니펫:\n${labeled.join("\n---\n")}`,
        },
      ],
      { json: true, temperature: 0.15, maxTokens: 1400 },
    );
    const parsed = JSON.parse(text) as Partial<TopicResearchBrief>;
    const sources = normalizeSources(parsed.sources);
    // Merge URLs from hits when LLM omitted them but titles match
    const mergedSources = mergeSourcesWithHits(sources, hits);
    const facts = strArr(parsed.facts, 12);
    return {
      topic: q,
      facts,
      angles: strArr(parsed.angles, 8),
      caveats: strArr(parsed.caveats, 6),
      sources: mergedSources,
      hits,
      isNewsTopic: looksLikeNewsTopic({
        sources: mergedSources,
        hits,
        factCount: facts.length,
      }),
      fetchedAt: new Date().toISOString(),
      usedFallback: false,
    };
  } catch (error) {
    if (!allowFallback()) throw error;
    console.warn("[topic-research] LLM distill failed:", error);
    return heuristicBrief(q, labeled, hits);
  }
}

export function formatResearchForPrompt(brief: TopicResearchBrief): string {
  const facts = brief.facts.length
    ? brief.facts.map((f, i) => `${i + 1}. ${f}`).join("\n")
    : "(검색 팩트 없음)";
  const angles = brief.angles.length ? brief.angles.join(" · ") : "(없음)";
  const caveats = brief.caveats.length
    ? brief.caveats.map((c) => `- ${c}`).join("\n")
    : "(없음)";
  const sources = brief.sources.length
    ? brief.sources
        .map((s) => `- ${s.title}${s.url ? ` (${s.url})` : ""}${s.note ? ` — ${s.note}` : ""}`)
        .join("\n")
    : "(제목/URL 추출 없음 — 본문에 가짜 링크 금지)";
  return `검색 근거 팩트:
${facts}

구성 각도:
${angles}

주의·불확실성:
${caveats}

참고 소스(본문 하단에만, URL은 목록에 있는 것만):
${sources}

뉴스 주제 여부: ${brief.isNewsTopic ? "예 — 확인된 사실·타임라인 우선, 추측 해설 금지" : "아니오"}`;
}

function heuristicBrief(
  topic: string,
  labeled: string[],
  hits: WebSearchHit[],
): TopicResearchBrief {
  const facts = labeled
    .map((s) => s.replace(/^소스\d+:\s*/i, "").replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 40)
    .map((s) => s.slice(0, 160))
    .slice(0, 8);
  const sources = hits.slice(0, 6).map((h) => ({
    title: h.title,
    url: h.url,
  }));
  return {
    topic,
    facts,
    angles: ["확인된 사실", "경과", "관련 발표", "향후 주시 포인트"],
    caveats: ["자동 추출 — 수치·기관명은 신중히"],
    sources,
    hits,
    isNewsTopic: looksLikeNewsTopic({ sources, hits, factCount: facts.length }),
    fetchedAt: new Date().toISOString(),
    usedFallback: true,
  };
}

function dedupeHits(hits: WebSearchHit[]): WebSearchHit[] {
  const seen = new Set<string>();
  const out: WebSearchHit[] = [];
  for (const h of hits) {
    const key = h.url.replace(/#.*$/, "").replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out.slice(0, 16);
}

function mergeSourcesWithHits(
  sources: TopicResearchSource[],
  hits: WebSearchHit[],
): TopicResearchSource[] {
  const out = [...sources];
  const have = new Set(out.map((s) => s.url).filter(Boolean));
  for (const h of hits) {
    if (have.has(h.url)) continue;
    if (out.length >= 8) break;
    // Prefer adding news URLs
    out.push({ title: h.title, url: h.url });
    have.add(h.url);
  }
  return out.slice(0, 8);
}

function strArr(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 240))
    .slice(0, max);
}

function normalizeSources(raw: unknown): TopicResearchSource[] {
  if (!Array.isArray(raw)) return [];
  const out: TopicResearchSource[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Partial<TopicResearchSource>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) continue;
    const url =
      typeof o.url === "string" && /^https?:\/\//i.test(o.url.trim()) ? o.url.trim() : undefined;
    const note = typeof o.note === "string" ? o.note.trim().slice(0, 120) : undefined;
    out.push({ title: title.slice(0, 160), url, note });
  }
  return out.slice(0, 8);
}

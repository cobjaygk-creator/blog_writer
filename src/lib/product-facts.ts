import { chatCompletion } from "@/lib/llm";
import { allowFallback, fetchWithTimeout, isLlmConfigured } from "@/lib/integrations";

export type ProductFactCard = {
  productName: string;
  highlights: string[];
  source: "user" | "search" | "none";
  caution?: string;
};

const PRODUCTISH =
  /(바디킷|머플러|썬팅|블랙박스|루프|하이리무진|페이스리프트|범퍼|그릴|매트|방음|튜닝|킷|램프|스포일러)/i;

export function looksLikeProductKeyword(keyword: string) {
  const k = keyword.trim();
  if (k.length < 4) return false;
  return PRODUCTISH.test(k) || /[A-Za-z]{2,}/.test(k);
}

function normalizeHighlights(raw: string[]): string[] {
  return raw
    .map((h) => h.trim())
    .filter((h) => h.length >= 2 && h.length <= 120)
    .slice(0, 8);
}

export async function buildProductFactCard(input: {
  keyword?: string | null;
  productHighlights?: string | null;
  cached?: unknown;
}): Promise<ProductFactCard> {
  const keyword = input.keyword?.trim() || "";
  const userText = input.productHighlights?.trim() || "";

  if (input.cached && typeof input.cached === "object") {
    const c = input.cached as Partial<ProductFactCard>;
    if (Array.isArray(c.highlights) && c.highlights.length && c.source === "user" && userText) {
      // User text changed — rebuild from user.
    } else if (Array.isArray(c.highlights) && c.highlights.length && !userText) {
      return {
        productName: typeof c.productName === "string" ? c.productName : keyword || "제품",
        highlights: normalizeHighlights(c.highlights.filter((x): x is string => typeof x === "string")),
        source: c.source === "search" || c.source === "user" ? c.source : "search",
        caution: typeof c.caution === "string" ? c.caution : undefined,
      };
    }
  }

  if (userText) {
    return structureUserHighlights(keyword, userText);
  }

  if (!keyword || !looksLikeProductKeyword(keyword)) {
    return {
      productName: keyword || "",
      highlights: [],
      source: "none",
    };
  }

  return researchProductFacts(keyword);
}

async function structureUserHighlights(keyword: string, userText: string): Promise<ProductFactCard> {
  const lines = userText
    .split(/\n+|·|•|- /)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!isLlmConfigured()) {
    return {
      productName: keyword || "제품",
      highlights: normalizeHighlights(lines),
      source: "user",
      caution: "사진에 안 보이면 쓰지 말 것",
    };
  }

  try {
    const { text } = await chatCompletion(
      [
        {
          role: "system",
          content:
            'JSON만 반환. 키: productName(string), highlights(string[] 최대 8). 사용자가 준 특장점만 정리하고 지어내지 마세요.',
        },
        {
          role: "user",
          content: `키워드: ${keyword}\n사용자 특장점:\n${userText}`,
        },
      ],
      { json: true, temperature: 0, maxTokens: 600 },
    );
    const parsed = JSON.parse(text) as Partial<ProductFactCard>;
    return {
      productName:
        typeof parsed.productName === "string" && parsed.productName.trim()
          ? parsed.productName.trim()
          : keyword || "제품",
      highlights: normalizeHighlights(
        Array.isArray(parsed.highlights)
          ? parsed.highlights.filter((x): x is string => typeof x === "string")
          : lines,
      ),
      source: "user",
      caution: "사진에 안 보이면 쓰지 말 것",
    };
  } catch {
    return {
      productName: keyword || "제품",
      highlights: normalizeHighlights(lines),
      source: "user",
      caution: "사진에 안 보이면 쓰지 말 것",
    };
  }
}

async function researchProductFacts(keyword: string): Promise<ProductFactCard> {
  const snippets = await collectSearchSnippets(keyword);
  if (!isLlmConfigured()) {
    if (!allowFallback()) throw new Error("LLM_API_KEY가 설정되지 않았습니다.");
    return {
      productName: keyword,
      highlights: snippets.slice(0, 4).map((s) => s.slice(0, 80)),
      source: snippets.length ? "search" : "none",
      caution: "사진에 안 보이면 쓰지 말 것. 불확실한 스펙 금지",
    };
  }

  try {
    const { text } = await chatCompletion(
      [
        {
          role: "system",
          content:
            "당신은 자동차/시공 제품 리서처입니다. JSON만 반환. 키: productName, highlights(string[] 최대 6 구체적 특장점), caution(string). 검색 스니펫에 없는 스펙은 넣지 마세요. 스니펫이 빈약하면 highlights를 짧게.",
        },
        {
          role: "user",
          content: `제품/키워드: ${keyword}\n\n검색 스니펫:\n${snippets.join("\n---\n") || "(없음 — 일반 지식으로 과장 없이 핵심만)"}`,
        },
      ],
      { json: true, temperature: 0.2, maxTokens: 800 },
    );
    const parsed = JSON.parse(text) as Partial<ProductFactCard>;
    return {
      productName:
        typeof parsed.productName === "string" && parsed.productName.trim()
          ? parsed.productName.trim()
          : keyword,
      highlights: normalizeHighlights(
        Array.isArray(parsed.highlights)
          ? parsed.highlights.filter((x): x is string => typeof x === "string")
          : [],
      ),
      source: "search",
      caution:
        typeof parsed.caution === "string"
          ? parsed.caution
          : "사진에 안 보이면 쓰지 말 것. 불확실한 스펙 금지",
    };
  } catch {
    return {
      productName: keyword,
      highlights: [],
      source: "none",
      caution: "사진에 안 보이면 쓰지 말 것",
    };
  }
}

async function collectSearchSnippets(query: string): Promise<string[]> {
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  if (tavilyKey) {
    try {
      const res = await fetchWithTimeout(
        "https://api.tavily.com/search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: tavilyKey,
            query: `${query} 특징 장점 스펙`,
            max_results: 5,
            search_depth: "basic",
          }),
        },
        15_000,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          results?: Array<{ title?: string; content?: string }>;
        };
        return (data.results || [])
          .map((r) => `${r.title || ""}\n${r.content || ""}`.trim())
          .filter(Boolean)
          .slice(0, 5);
      }
    } catch {
      // fall through
    }
  }

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${query} 특징 장점`)}`;
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      },
      15_000,
    );
    if (!res.ok) return [];
    const html = await res.text();
    const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter((s) => s.length > 40)
      .slice(0, 5);
    return snippets;
  } catch {
    return [];
  }
}

/** Pick 0~1 highlight relevant to a photo scene description. */
export async function matchHighlightToScene(
  scene: string,
  facts: ProductFactCard,
): Promise<string | null> {
  if (!facts.highlights.length) return null;
  if (!isLlmConfigured()) {
    const s = scene.toLowerCase();
    return (
      facts.highlights.find((h) =>
        h.split(/\s+/).some((w) => w.length >= 2 && s.includes(w.toLowerCase())),
      ) || null
    );
  }
  try {
    const { text } = await chatCompletion(
      [
        {
          role: "system",
          content:
            'JSON만. 키: highlight(string|null). 사진 장면과 직접 관련 있는 특장점 하나만 고르거나, 없으면 null. 억지 매칭 금지.',
        },
        {
          role: "user",
          content: `장면: ${scene}\n특장점:\n${facts.highlights.map((h, i) => `${i + 1}. ${h}`).join("\n")}`,
        },
      ],
      { json: true, temperature: 0, maxTokens: 200 },
    );
    const parsed = JSON.parse(text) as { highlight?: string | null };
    const h = typeof parsed.highlight === "string" ? parsed.highlight.trim() : "";
    if (!h) return null;
    return facts.highlights.find((x) => x === h || h.includes(x) || x.includes(h)) || null;
  } catch {
    return null;
  }
}

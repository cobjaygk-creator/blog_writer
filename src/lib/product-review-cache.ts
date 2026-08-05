import { getTavilyApiKey } from "@/lib/integration-config";
import { allowFallback, fetchWithTimeout, isLlmConfigured } from "@/lib/integrations";
import { chatCompletion } from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import type { ReviewTheme } from "@/lib/product-facts";

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type CachePayload = {
  productName: string;
  themes: ReviewTheme[];
  fetchedAt: string;
};

function normalizeThemes(raw: unknown): ReviewTheme[] {
  if (!Array.isArray(raw)) return [];
  const out: ReviewTheme[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const o = t as Partial<ReviewTheme>;
    const theme = typeof o.theme === "string" ? o.theme.trim() : "";
    if (!theme) continue;
    const sourceCount =
      typeof o.sourceCount === "number" && Number.isFinite(o.sourceCount)
        ? Math.max(0, Math.floor(o.sourceCount))
        : 3;
    out.push({
      theme: theme.slice(0, 80),
      sentiment: typeof o.sentiment === "string" ? o.sentiment : undefined,
      sourceCount,
    });
  }
  return out.slice(0, 12);
}

async function collectReviewSnippets(productName: string): Promise<string[]> {
  const tavilyKey = await getTavilyApiKey();
  if (!tavilyKey) return [];
  try {
    const res = await fetchWithTimeout(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: `${productName} 리뷰 후기 장단점`,
          max_results: 6,
          search_depth: "basic",
        }),
      },
      15_000,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{ title?: string; content?: string }>;
    };
    return (data.results || [])
      .map((r) => `${r.title || ""}\n${r.content || ""}`.trim())
      .filter(Boolean)
      .slice(0, 6);
  } catch {
    return [];
  }
}

async function extractThemesFromSnippets(
  productName: string,
  snippets: string[],
): Promise<ReviewTheme[]> {
  if (!snippets.length) {
    // Fallback themes from product name tokens so synthesizeSceneKeywords can run.
    const bits = productName
      .split(/[\s,/·|]+/)
      .map((b) => b.trim())
      .filter((b) => b.length >= 2)
      .slice(0, 4);
    return bits.map((theme) => ({ theme, sourceCount: 3, sentiment: "neutral" }));
  }

  if (!isLlmConfigured()) {
    if (!allowFallback()) return [];
    return snippets.slice(0, 4).map((s, i) => ({
      theme: s.split(/\n/)[0]?.slice(0, 40) || `리뷰 포인트 ${i + 1}`,
      sourceCount: 3,
      sentiment: "neutral",
    }));
  }

  try {
    const { text } = await chatCompletion(
      [
        {
          role: "system",
          content:
            'JSON만 반환. 키: themes(array of { theme: string, sentiment?: string, sourceCount: number }). theme는 장면/시공/제품 특징 키워드 짧은 구(최대 12개). sourceCount는 근거 스니펫 수 추정(최소 3). 스니펫에 없는 내용 금지.',
        },
        {
          role: "user",
          content: `제품: ${productName}\n\n리뷰 스니펫:\n${snippets.join("\n---\n")}`,
        },
      ],
      { json: true, temperature: 0.2, maxTokens: 900 },
    );
    const parsed = JSON.parse(text) as { themes?: unknown };
    const themes = normalizeThemes(parsed.themes).map((t) => ({
      ...t,
      sourceCount: Math.max(3, t.sourceCount || 3),
    }));
    return themes.length
      ? themes
      : [{ theme: productName.slice(0, 40), sourceCount: 3, sentiment: "neutral" }];
  } catch (e) {
    console.warn("[product-review-cache] extract failed:", e);
    return [{ theme: productName.slice(0, 40), sourceCount: 3, sentiment: "neutral" }];
  }
}

/** Load or refresh review themes for brand+product (7-day TTL). */
export async function ensureProductReviewThemes(input: {
  brandId: string;
  productName: string;
  forceRefresh?: boolean;
}): Promise<ReviewTheme[]> {
  const productName = input.productName.trim().slice(0, 120);
  if (!productName) return [];

  const existing = await prisma.productReviewCache.findUnique({
    where: {
      brandId_productName: { brandId: input.brandId, productName },
    },
  });

  if (existing && !input.forceRefresh) {
    const age = Date.now() - existing.fetchedAt.getTime();
    if (age < TTL_MS) {
      const payload = existing.reviewThemesJson as CachePayload | ReviewTheme[];
      if (Array.isArray(payload)) return normalizeThemes(payload);
      if (payload && typeof payload === "object" && Array.isArray(payload.themes)) {
        return normalizeThemes(payload.themes);
      }
    }
  }

  const snippets = await collectReviewSnippets(productName);
  const themes = await extractThemesFromSnippets(productName, snippets);
  const payload: CachePayload = {
    productName,
    themes,
    fetchedAt: new Date().toISOString(),
  };

  await prisma.productReviewCache.upsert({
    where: {
      brandId_productName: { brandId: input.brandId, productName },
    },
    create: {
      brandId: input.brandId,
      productName,
      reviewThemesJson: payload,
      fetchedAt: new Date(),
    },
    update: {
      reviewThemesJson: payload,
      fetchedAt: new Date(),
    },
  });

  return themes;
}

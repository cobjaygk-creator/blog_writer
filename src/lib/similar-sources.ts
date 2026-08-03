export type SimilarSourceCandidate = {
  id: string;
  title: string | null;
  rawText: string;
  publishedAt?: Date | null;
  createdAt?: Date | null;
};

export type SimilarSource = {
  id: string;
  title: string | null;
  excerpt: string;
  score: number;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function excerptText(raw: string, max = 1600) {
  const cleaned = raw.replace(/\r\n/g, "\n").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max).trim()}…`;
}

/** Rank brand source posts by keyword/caption overlap + product terms + recency. */
export function findSimilarSources(
  query: string,
  candidates: SimilarSourceCandidate[],
  topK = 3,
): SimilarSource[] {
  const qTokens = tokenize(query);
  if (!qTokens.length || !candidates.length) return [];

  const qSet = new Set(qTokens);
  const now = Date.now();
  const productBoostTerms = qTokens.filter((t) =>
    /(바디|킷|머플러|썬팅|블랙|루프|하이|페이스|그릴|범퍼|매트|방음|튜닝)/.test(t),
  );

  const scored = candidates.map((c) => {
    const hay = `${c.title || ""}\n${c.rawText}`;
    const tokens = tokenize(hay.slice(0, 8000));
    let overlap = 0;
    for (const t of tokens) {
      if (qSet.has(t)) overlap += 1;
    }
    const uniqueOverlap = new Set(tokens.filter((t) => qSet.has(t))).size;
    let productBoost = 0;
    const titleLower = (c.title || "").toLowerCase();
    for (const t of productBoostTerms) {
      if (titleLower.includes(t) || hay.toLowerCase().includes(t)) productBoost += 2;
    }
    const recencyDate = c.publishedAt || c.createdAt || null;
    const ageDays = recencyDate ? Math.max(0, (now - recencyDate.getTime()) / 86_400_000) : 365;
    const recencyBoost = 1 / (1 + ageDays / 90);
    const score = uniqueOverlap * 3 + overlap * 0.15 + productBoost + recencyBoost;
    return {
      id: c.id,
      title: c.title,
      excerpt: excerptText(c.rawText),
      score,
    };
  });

  return scored
    .filter((s) => s.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

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

/** Character bigrams for dense Hangul / no-space product names. */
function bigrams(text: string): string[] {
  const compact = normalizeText(text).replace(/\s+/g, "");
  if (compact.length < 2) return compact.length ? [compact] : [];
  const grams: string[] = [];
  for (let i = 0; i < compact.length - 1; i += 1) {
    grams.push(compact.slice(i, i + 2));
  }
  return grams;
}

function excerptText(raw: string, max = 1600) {
  const cleaned = raw.replace(/\r\n/g, "\n").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max).trim()}…`;
}

function substringHits(query: string, hay: string): number {
  const q = normalizeText(query);
  const h = normalizeText(hay);
  if (!q || !h) return 0;
  const parts = q.split(/\s+/).filter((p) => p.length >= 2);
  let hits = 0;
  for (const part of parts) {
    if (h.includes(part)) hits += 1;
  }
  // Also try full compact query for product names like "쏘렌토MQ4코토"
  const compactQ = q.replace(/\s+/g, "");
  const compactH = h.replace(/\s+/g, "");
  if (compactQ.length >= 4) {
    for (let len = Math.min(8, compactQ.length); len >= 3; len -= 1) {
      for (let i = 0; i <= compactQ.length - len; i += 1) {
        const slice = compactQ.slice(i, i + len);
        if (compactH.includes(slice)) {
          hits += 0.35;
          break;
        }
      }
    }
  }
  return hits;
}

/** Re-rank stored style anchors by overlap with the current keyword. */
export function rankAnchorsByKeyword(
  anchors: Array<{ excerpt: string }>,
  keyword: string,
  topK = 4,
): Array<{ excerpt: string }> {
  if (!anchors.length) return [];
  const qTokens = new Set(tokenize(keyword));
  if (!qTokens.size) return anchors.slice(0, topK);

  return [...anchors]
    .map((a) => {
      const tokens = tokenize(a.excerpt);
      let score = 0;
      for (const t of tokens) {
        if (qTokens.has(t)) score += 1;
      }
      score += substringHits(keyword, a.excerpt) * 0.5;
      return { a, score };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, topK)
    .map((x) => x.a);
}

/** Rank brand source posts by keyword/caption overlap + product terms + recency. */
export function findSimilarSources(
  query: string,
  candidates: SimilarSourceCandidate[],
  topK = 3,
): SimilarSource[] {
  const qNorm = normalizeText(query);
  const qTokens = tokenize(query);
  const qBigrams = new Set(bigrams(query));
  if ((!qTokens.length && !qBigrams.size) || !candidates.length) return [];

  const qSet = new Set(qTokens);
  const now = Date.now();
  const productBoostTerms = [...qTokens, ...qNorm.split(/\s+/)].filter((t) =>
    /(바디|킷|머플러|썬팅|블랙|루프|하이|페이스|그릴|범퍼|매트|방음|튜닝|코토|박스|용량)/.test(t),
  );

  const scored = candidates.map((c) => {
    const hay = `${c.title || ""}\n${c.rawText}`;
    const haySlice = hay.slice(0, 8000);
    const tokens = tokenize(haySlice);
    let overlap = 0;
    for (const t of tokens) {
      if (qSet.has(t)) overlap += 1;
    }
    const uniqueOverlap = new Set(tokens.filter((t) => qSet.has(t))).size;

    const hayBigrams = bigrams(haySlice);
    let bigramHits = 0;
    for (const g of hayBigrams) {
      if (qBigrams.has(g)) bigramHits += 1;
    }
    const uniqueBigram = new Set(hayBigrams.filter((g) => qBigrams.has(g))).size;

    const subHits = substringHits(query, haySlice);

    let productBoost = 0;
    const titleLower = (c.title || "").toLowerCase();
    const hayLower = hay.toLowerCase();
    for (const t of productBoostTerms) {
      if (titleLower.includes(t) || hayLower.includes(t)) productBoost += 2;
    }

    const recencyDate = c.publishedAt || c.createdAt || null;
    const ageDays = recencyDate ? Math.max(0, (now - recencyDate.getTime()) / 86_400_000) : 365;
    const recencyBoost = 1 / (1 + ageDays / 90);
    const score =
      uniqueOverlap * 3 +
      overlap * 0.15 +
      uniqueBigram * 0.9 +
      Math.min(bigramHits, 40) * 0.04 +
      subHits * 1.8 +
      productBoost +
      recencyBoost;
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

import type { WebSearchHit } from "@/lib/product-facts";
import type { TopicResearchSource } from "@/lib/topic-research";

const NEWS_HOST_RE =
  /(^|\.)(naver\.com|news1\.kr|newsis\.com|yna\.co\.kr|yonhapnews\.|chosun\.com|joongang\.co\.kr|joins\.com|hani\.co\.kr|hankyung\.com|mk\.co\.kr|sedaily\.com|seoul\.co\.kr|donga\.com|khan\.co\.kr|kmib\.co\.kr|ytn\.co\.kr|sbs\.co\.kr|mbc\.co\.kr|kbs\.co\.kr|jtbc\.co\.kr|tvchosun\.com|nocutnews\.co\.kr|ohmynews\.com|pressian\.com|mediatoday\.co\.kr|bloter\.net|zdnet\.co\.kr|mt\.co\.kr|edaily\.co\.kr|asiae\.co\.kr|fnnews\.com|heraldcorp\.com|munhwa\.com|kwangju\.co\.kr|busan\.com|imaeil\.com|kookje\.co\.kr|nate\.com|daum\.net|imbc\.com|knn\.co\.kr)/i;

export function isNewsUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return NEWS_HOST_RE.test(host) || host.includes("news.");
  } catch {
    return false;
  }
}

/** Used to flag a topic as news-shaped for fact-research purposes only — never for images. */
export function looksLikeNewsTopic(input: {
  sources: TopicResearchSource[];
  hits?: WebSearchHit[];
  factCount: number;
}): boolean {
  const urls = [
    ...input.sources.map((s) => s.url).filter((u): u is string => Boolean(u)),
    ...(input.hits || []).map((h) => h.url),
  ];
  const newsUrls = [...new Set(urls.filter(isNewsUrl))];
  return newsUrls.length >= 1 && input.factCount >= 2;
}

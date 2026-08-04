import { detectImageMime, fetchWithTimeout } from "@/lib/integrations";
import type { WebSearchHit } from "@/lib/product-facts";
import { uploadImageBuffer } from "@/lib/storage";
import type { TopicResearchSource } from "@/lib/topic-research";
import type { StockImageResult } from "@/lib/unsplash";

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

/**
 * Pull article images (og:image / in-article imgs / search images), store them,
 * and return StockImageResult slots with attribution captions.
 */
export async function fetchNewsImagesForTopic(input: {
  sources: TopicResearchSource[];
  hits?: WebSearchHit[];
  count: number;
  folder?: string;
  topic?: string;
}): Promise<{
  results: Array<StockImageResult | null>;
  errors: Array<string | null>;
  usedNews: boolean;
}> {
  const count = Math.max(1, Math.min(6, input.count));
  const candidates = buildImageCandidates(
    input.sources,
    input.hits || [],
    input.topic || "",
  ).slice(0, Math.max(count * 4, 12));

  const results: Array<StockImageResult | null> = new Array(count).fill(null);
  const errors: Array<string | null> = new Array(count).fill(null);
  const usedRemote = new Set<string>();
  const usedFingerprints = new Set<string>();

  let slot = 0;
  for (const cand of candidates) {
    if (slot >= count) break;

    let remotes: string[] = [];
    if (cand.imageUrl) remotes.push(cand.imageUrl);
    try {
      const fromPage = await extractImagesFromPage(cand.pageUrl);
      remotes.push(...fromPage);
    } catch (e) {
      console.warn("[news-images] page fetch failed:", cand.pageUrl, e);
    }
    remotes = [...new Set(remotes.map(normalizeImageUrl).filter(Boolean))];

    for (const imageRemote of remotes) {
      if (slot >= count) break;
      if (usedRemote.has(imageRemote)) continue;
      try {
        const stored = await downloadAndStoreNewsImage({
          imageUrl: imageRemote,
          folder: input.folder,
          referer: cand.pageUrl,
        });
        // Skip tiny/duplicate buffers
        if (usedFingerprints.has(stored.fingerprint)) continue;
        usedRemote.add(imageRemote);
        usedFingerprints.add(stored.fingerprint);

        const outlet = outletNameFromUrl(cand.pageUrl);
        const caption =
          `출처: ${outlet} · ${cand.title}`.replace(/\s+/g, " ").trim().slice(0, 200);
        results[slot] = {
          imageUrl: stored.imageUrl,
          caption,
          sourceMeta: {
            provider: "news",
            author: outlet,
            pageUrl: cand.pageUrl,
            license: "원 기사 출처 표시 — 이용 시 매체 정책 확인",
          },
          usedFallback: false,
        };
        errors[slot] = null;
        slot += 1;
      } catch (e) {
        console.warn("[news-images] image failed:", imageRemote.slice(0, 120), e);
      }
    }
  }

  for (let i = 0; i < count; i++) {
    if (!results[i] && !errors[i]) {
      errors[i] = "뉴스 이미지를 찾지 못함";
    }
  }

  return {
    results,
    errors,
    usedNews: results.some(Boolean),
  };
}

type ImageCandidate = {
  pageUrl: string;
  title: string;
  imageUrl?: string;
};

function buildImageCandidates(
  sources: TopicResearchSource[],
  hits: WebSearchHit[],
  topic: string,
): ImageCandidate[] {
  const byKey = new Map<string, ImageCandidate>();

  for (const h of hits) {
    if (!isNewsUrl(h.url) && !h.imageUrl) continue;
    const pageUrl = isNewsUrl(h.url) ? h.url : h.url;
    const key = h.imageUrl || pageUrl;
    if (!byKey.has(key)) {
      byKey.set(key, {
        pageUrl,
        title: h.title || topic || "뉴스",
        imageUrl: h.imageUrl,
      });
    } else if (h.imageUrl && !byKey.get(key)?.imageUrl) {
      byKey.get(key)!.imageUrl = h.imageUrl;
    }
  }

  // Tavily may attach the same gallery image to many hits — also add each unique imageUrl
  // as its own candidate keyed by image URL.
  for (const h of hits) {
    if (!h.imageUrl) continue;
    const key = `img:${h.imageUrl}`;
    if (byKey.has(key)) continue;
    const pageUrl = hits.find((x) => isNewsUrl(x.url))?.url || h.url;
    byKey.set(key, {
      pageUrl,
      title: h.title || topic || "뉴스",
      imageUrl: h.imageUrl,
    });
  }

  for (const s of sources) {
    if (!s.url || !isNewsUrl(s.url)) continue;
    const key = s.url;
    const prev = byKey.get(key);
    byKey.set(key, {
      pageUrl: s.url,
      title: s.title || prev?.title || topic || "뉴스",
      imageUrl: prev?.imageUrl,
    });
  }

  // Prefer candidates that already have an imageUrl
  return [...byKey.values()].sort((a, b) => Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)));
}

async function extractImagesFromPage(pageUrl: string): Promise<string[]> {
  const res = await fetchWithTimeout(
    pageUrl,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    },
    15_000,
  );
  if (!res.ok) return [];
  const html = await res.text();
  const found: string[] = [];

  const metaPatterns = [
    /property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/gi,
    /content=["']([^"']+)["'][^>]*property=["']og:image:secure_url["']/gi,
    /property=["']og:image["'][^>]*content=["']([^"']+)["']/gi,
    /content=["']([^"']+)["'][^>]*property=["']og:image["']/gi,
    /name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/gi,
    /content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/gi,
  ];
  for (const re of metaPatterns) {
    for (const m of html.matchAll(re)) {
      if (m[1]) found.push(m[1].trim());
    }
  }

  // Article body-ish images (skip tiny icons/logos)
  for (const m of html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const src = m[1]?.trim();
    if (!src) continue;
    if (/sprite|logo|icon|emoji|button|banner|ad[-_]/i.test(src)) continue;
    found.push(src);
  }
  // lazy-loaded
  for (const m of html.matchAll(
    /<img\b[^>]*\b(?:data-src|data-lazy-src|data-original)=["']([^"']+)["'][^>]*>/gi,
  )) {
    const src = m[1]?.trim();
    if (!src) continue;
    if (/sprite|logo|icon|emoji|button|banner|ad[-_]/i.test(src)) continue;
    found.push(src);
  }

  const abs = found
    .map((u) => {
      try {
        return new URL(u, pageUrl).toString();
      } catch {
        return "";
      }
    })
    .filter((u) => /^https?:\/\//i.test(u));

  return [...new Set(abs)].slice(0, 8);
}

async function downloadAndStoreNewsImage(input: {
  imageUrl: string;
  folder?: string;
  referer?: string;
}): Promise<{ imageUrl: string; fingerprint: string }> {
  const res = await fetchWithTimeout(
    input.imageUrl,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: input.referer || input.imageUrl,
      },
      redirect: "follow",
    },
    20_000,
  );
  if (!res.ok) throw new Error(`뉴스 이미지 다운로드 실패 (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength < 2_000) {
    throw new Error("이미지 파일이 너무 작습니다.");
  }

  // Hotlink often returns HTML
  const head = buffer.slice(0, 64).toString("utf8").toLowerCase();
  if (head.includes("<!doctype") || head.includes("<html") || head.includes("<?xml")) {
    throw new Error("HTML이 반환되어 이미지가 아닙니다.");
  }

  let mime = detectImageMime(buffer);
  if (!mime) {
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (ct === "image/jpeg" || ct === "image/jpg") mime = "image/jpeg";
    else if (ct === "image/png") mime = "image/png";
    else if (ct === "image/webp") mime = "image/webp";
    else if (ct === "image/gif") mime = "image/gif";
    else throw new Error("이미지 시그니처가 올바르지 않습니다.");
  }

  // Skip likely tracking pixels / icons
  if (buffer.byteLength < 8_000 && mime === "image/gif") {
    throw new Error("아이콘/GIF로 보여 건너뜁니다.");
  }

  const upload = await uploadImageBuffer({
    buffer,
    contentType: mime,
    folder: input.folder || "posts",
  });
  const fingerprint = `${mime}:${buffer.byteLength}:${buffer[0]}-${buffer[10]}-${buffer[20]}`;
  return { imageUrl: upload.imageUrl, fingerprint };
}

function normalizeImageUrl(url: string) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

function outletNameFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("naver.com")) return "네이버 뉴스";
    if (host.includes("newsis")) return "뉴시스";
    if (host.includes("yna.co") || host.includes("yonhap")) return "연합뉴스";
    if (host.includes("chosun")) return "조선일보";
    if (host.includes("joongang") || host.includes("joins")) return "중앙일보";
    if (host.includes("hani")) return "한겨레";
    if (host.includes("hankyung")) return "한국경제";
    if (host.includes("mk.co")) return "매일경제";
    if (host.includes("ytn")) return "YTN";
    if (host.includes("sbs")) return "SBS";
    if (host.includes("mbc") || host.includes("imbc")) return "MBC";
    if (host.includes("kbs")) return "KBS";
    if (host.includes("nate.com")) return "네이트 뉴스";
    return host.split(".")[0] || host;
  } catch {
    return "뉴스";
  }
}

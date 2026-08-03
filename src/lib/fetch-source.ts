import { fetchWithTimeout } from "@/lib/integrations";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const MAX_TEXT = 20000;
const MIN_TEXT = 20;

export type FetchedSource = {
  title: string | null;
  text: string;
  sourceUrl: string;
};

export async function fetchSourceFromUrl(rawUrl: string): Promise<FetchedSource> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("올바른 URL이 아닙니다.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("http(s) URL만 사용할 수 있습니다.");
  }

  const fetchUrl = toFetchUrl(parsed);
  const response = await fetchWithTimeout(
    fetchUrl,
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    },
    20_000,
  );

  if (!response.ok) {
    throw new Error(`페이지를 가져오지 못했습니다 (HTTP ${response.status}).`);
  }

  const html = await response.text();
  const title = extractTitle(html);
  let text = "";

  if (isNaverBlog(parsed)) {
    text = extractNaverBody(html);
  }
  if (!text || text.length < MIN_TEXT) {
    text = extractGenericBody(html);
  }

  text = normalizeText(text).slice(0, MAX_TEXT);
  if (text.length < MIN_TEXT) {
    throw new Error("본문 텍스트를 충분히 추출하지 못했습니다. 비공개 글이거나 접근이 제한됐을 수 있습니다.");
  }

  return {
    title,
    text,
    sourceUrl: parsed.toString(),
  };
}

function toFetchUrl(url: URL) {
  if (isNaverBlog(url)) {
    const ids = parseNaverBlogIds(url);
    if (ids) {
      return `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(ids.blogId)}&logNo=${encodeURIComponent(ids.logNo)}&redirect=Dlog&widgetTypeCall=true&directAccess=false`;
    }
  }
  return url.toString();
}

function isNaverBlog(url: URL) {
  return /(^|\.)blog\.naver\.com$/i.test(url.hostname) || /(^|\.)m\.blog\.naver\.com$/i.test(url.hostname);
}

function parseNaverBlogIds(url: URL): { blogId: string; logNo: string } | null {
  const blogIdParam = url.searchParams.get("blogId");
  const logNoParam = url.searchParams.get("logNo");
  if (blogIdParam && logNoParam) {
    return { blogId: blogIdParam, logNo: logNoParam };
  }

  // https://blog.naver.com/{blogId}/{logNo}
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
    return { blogId: parts[0], logNo: parts[1] };
  }
  return null;
}

function extractTitle(html: string) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og?.[1]) return decodeEntities(og[1]).trim();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title?.[1]) return normalizeText(stripTags(title[1])).slice(0, 200) || null;
  return null;
}

function extractNaverBody(html: string) {
  const main =
    matchInner(html, /<div[^>]*class=["'][^"']*se-main-container[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div|<\/div>|<\/body>)/i) ||
    matchInner(html, /<div[^>]*id=["']postViewArea["'][^>]*>([\s\S]*?)<\/div>/i);

  if (!main) return "";

  const paragraphs = [...main.matchAll(/class=["'][^"']*se-text-paragraph[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|span|div)>/gi)]
    .map((m) => normalizeText(stripTags(m[1])))
    .filter(Boolean);

  if (paragraphs.length) return paragraphs.join("\n\n");
  return normalizeText(stripTags(main));
}

function extractGenericBody(html: string) {
  let working = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  const article =
    matchInner(working, /<article[^>]*>([\s\S]*?)<\/article>/i) ||
    matchInner(working, /<main[^>]*>([\s\S]*?)<\/main>/i) ||
    matchInner(working, /<(?:div|section)[^>]*(?:article|post-content|entry-content|content-body)[^>]*>([\s\S]*?)<\/(?:div|section)>/i);

  if (article) {
    return normalizeText(stripTags(article));
  }

  const body = matchInner(working, /<body[^>]*>([\s\S]*?)<\/body>/i) || working;
  return normalizeText(stripTags(body));
}

function matchInner(html: string, re: RegExp) {
  const m = html.match(re);
  return m?.[1] || "";
}

function stripTags(html: string) {
  return html.replace(/<[^>]+>/g, " ");
}

function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function normalizeText(text: string) {
  return decodeEntities(text)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

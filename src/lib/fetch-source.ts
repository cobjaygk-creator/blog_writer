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
    // Never fall back to full-page strip on Naver — it pulls UI chrome junk.
    if (looksLikeNaverChrome(text)) {
      text = "";
    }
  } else {
    text = extractGenericBody(html);
  }

  text = normalizeText(text).slice(0, MAX_TEXT);
  if (looksLikeNaverChrome(text) || text.length < MIN_TEXT) {
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

export function isNaverBlog(url: URL) {
  return /(^|\.)blog\.naver\.com$/i.test(url.hostname) || /(^|\.)m\.blog\.naver\.com$/i.test(url.hostname);
}

export function parseNaverBlogIds(url: URL): { blogId: string; logNo: string } | null {
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

/** Resolve blogId from a Naver blog home or post URL. */
export function parseNaverBlogId(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (!isNaverBlog(parsed)) return null;

  const blogIdParam = parsed.searchParams.get("blogId");
  if (blogIdParam?.trim()) return blogIdParam.trim();

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length >= 1 && parts[0] && !["PostView.naver", "PostList.naver", "PostTitleListAsync.naver"].includes(parts[0])) {
    return parts[0];
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
  // Prefer SmartEditor main container; fall back to classic post area / text modules.
  const main =
    extractByClass(html, "se-main-container") ||
    matchInner(html, /<div[^>]*id=["']postViewArea["'][^>]*>([\s\S]*?)<\/div>/i) ||
    extractByClass(html, "se-component-content") ||
    "";

  if (!main) {
    const modules = [...html.matchAll(/class=["'][^"']*se-module-text[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)]
      .map((m) => formatAwareParagraph(m[1]))
      .filter(Boolean);
    return modules.join("\n\n");
  }

  const paragraphs = [
    ...main.matchAll(/class=["'][^"']*se-text-paragraph[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|span|div)>/gi),
  ]
    .map((m) => formatAwareParagraph(m[1]))
    .filter(Boolean);

  if (paragraphs.length) return paragraphs.join("\n\n");

  const modules = [...main.matchAll(/class=["'][^"']*se-module-text[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)]
    .map((m) => formatAwareParagraph(m[1]))
    .filter(Boolean);
  if (modules.length) return modules.join("\n\n");

  return normalizeText(stripTags(main));
}

/** Balanced-ish extract of the first element whose class contains `classToken`. */
function extractByClass(html: string, classToken: string) {
  const re = new RegExp(
    `<div[^>]*class=["'][^"']*${classToken}[^"']*["'][^>]*>`,
    "i",
  );
  const start = html.search(re);
  if (start < 0) return "";
  const openEnd = html.indexOf(">", start);
  if (openEnd < 0) return "";
  let depth = 1;
  let i = openEnd + 1;
  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf("<div", i);
    const nextClose = html.indexOf("</div>", i);
    if (nextClose < 0) break;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 4;
    } else {
      depth -= 1;
      if (depth === 0) return html.slice(openEnd + 1, nextClose);
      i = nextClose + 6;
    }
  }
  return "";
}

function looksLikeNaverChrome(text: string) {
  if (!text || text.length < MIN_TEXT) return false;
  const markers = [
    "블로그 주소 변경 불가",
    "블로그 아이디가 필요해요",
    "이웃을 맺으면 이웃새글",
    "가벼운 글쓰기툴 퀵에디터",
    "이 블로그에서 검색",
    "메뉴 바로가기",
    "본문 바로가기",
  ];
  const hits = markers.filter((m) => text.includes(m)).length;
  if (hits >= 2) return true;
  // Too many tiny UI lines and almost no long sentences.
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 40) {
    const long = lines.filter((l) => l.length >= 25).length;
    if (long / lines.length < 0.08) return true;
  }
  return false;
}

/** Keep short-line rhythm and annotate dominant color/size for style learning. */
function formatAwareParagraph(chunk: string) {
  const withBreaks = chunk.replace(/<br\s*\/?>/gi, "\n");
  const colors = [...withBreaks.matchAll(/color:\s*(#[0-9a-fA-F]{3,8})/gi)]
    .map((m) => m[1].toUpperCase())
    .filter((c) => !isNeutralInk(c));
  const sizes = [...withBreaks.matchAll(/font-size:\s*([\d.]+px)/gi)]
    .map((m) => m[1])
    .filter((s) => !["14px", "15px", "16px"].includes(s));

  const text = normalizeText(stripTags(withBreaks));
  if (!text) return "";

  const color = mostFrequent(colors);
  const size = mostFrequent(sizes);
  if (!color && !size) return text;

  const attrs = [color ? `color=${color}` : "", size ? `size=${size}` : ""].filter(Boolean).join(" ");
  return `[style ${attrs}]${text}`;
}

function isNeutralInk(color: string) {
  const hex = color.replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  if (full.length !== 6) return false;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max < 60 || (max > 220 && max - min < 25);
}

function mostFrequent(values: string[]) {
  if (!values.length) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
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

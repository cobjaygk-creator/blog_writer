import { fetchWithTimeout } from "@/lib/integrations";
import { parseNaverBlogId } from "@/lib/fetch-source";
import { BULK_IMPORT_TARGET } from "@/lib/plans";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type NaverListItem = {
  logNo: string;
  url: string;
  title: string | null;
  publishedAt: string | null;
};

export type ImportItemStatus = "pending" | "fetched" | "skipped" | "failed";

export type SourceImportItem = {
  logNo: string;
  url: string;
  title?: string | null;
  publishedAt?: string | null;
  status: ImportItemStatus;
  error?: string | null;
  sourcePostId?: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeTitle(raw: string) {
  try {
    return decodeURIComponent(raw.replace(/\+/g, "%20"));
  } catch {
    return raw;
  }
}

function parseAddDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  // "2020. 5. 28." or "2024. 12. 3. 14:30"
  const m = raw.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

export function resolveBlogIdFromUrl(rawUrl: string): string {
  const blogId = parseNaverBlogId(rawUrl);
  if (!blogId) {
    throw new Error("네이버 블로그 URL이 필요합니다. 예: https://blog.naver.com/블로그ID");
  }
  return blogId;
}

async function fetchListPage(blogId: string, page: number, countPerPage: number) {
  const url =
    `https://blog.naver.com/PostTitleListAsync.naver` +
    `?blogId=${encodeURIComponent(blogId)}` +
    `&viewdate=` +
    `&currentPage=${page}` +
    `&categoryNo=0` +
    `&parentCategoryNo=0` +
    `&countPerPage=${countPerPage}`;

  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json,text/plain,*/*",
        Referer: `https://blog.naver.com/${encodeURIComponent(blogId)}`,
      },
      redirect: "follow",
    },
    20_000,
  );

  if (!response.ok) {
    throw new Error(`네이버 글 목록을 가져오지 못했습니다 (HTTP ${response.status}).`);
  }

  const text = await response.text();
  return parseNaverPostList(text, blogId);
}

/**
 * Naver's PostTitleListAsync sometimes returns invalid JSON escapes in titles.
 * Try strict parse, then sanitize, then regex fallback.
 */
function parseNaverPostList(text: string, blogId: string): NaverListItem[] {
  const data = parseNaverListPayload(text);
  if (data) {
    const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const postList = Array.isArray(obj.postList)
      ? obj.postList
      : Array.isArray(obj.postTitleList)
        ? obj.postTitleList
        : [];

    const items: NaverListItem[] = [];
    for (const row of postList) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const logNo = String(r.logNo ?? r.logNoValue ?? "").trim();
      if (!/^\d+$/.test(logNo)) continue;
      const titleRaw = typeof r.title === "string" ? r.title : "";
      items.push({
        logNo,
        url: `https://blog.naver.com/${encodeURIComponent(blogId)}/${logNo}`,
        title: titleRaw ? decodeTitle(titleRaw).trim().slice(0, 200) || null : null,
        publishedAt: parseAddDate(r.addDate),
      });
    }
    if (items.length) return items;
  }

  const fallback = extractPostsByRegex(text, blogId);
  if (fallback.length) return fallback;
  throw new Error("네이버 글 목록 응답을 해석하지 못했습니다.");
}

function parseNaverListPayload(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    // Fix invalid escapes like `\가` that appear in some titles.
    const sanitized = text.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    try {
      return JSON.parse(sanitized);
    } catch {
      return null;
    }
  }
}

function extractPostsByRegex(text: string, blogId: string): NaverListItem[] {
  const items: NaverListItem[] = [];
  const seen = new Set<string>();
  const re =
    /"logNo"\s*:\s*"(\d+)"[\s\S]*?"title"\s*:\s*"((?:\\.|[^"\\])*)"[\s\S]*?"addDate"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  for (const m of text.matchAll(re)) {
    const logNo = m[1];
    if (seen.has(logNo)) continue;
    seen.add(logNo);
    items.push({
      logNo,
      url: `https://blog.naver.com/${encodeURIComponent(blogId)}/${logNo}`,
      title: decodeTitle(m[2]).trim().slice(0, 200) || null,
      publishedAt: parseAddDate(m[3]),
    });
  }
  if (items.length) return items;

  for (const m of text.matchAll(/"logNo"\s*:\s*"(\d+)"/g)) {
    const logNo = m[1];
    if (seen.has(logNo)) continue;
    seen.add(logNo);
    items.push({
      logNo,
      url: `https://blog.naver.com/${encodeURIComponent(blogId)}/${logNo}`,
      title: null,
      publishedAt: null,
    });
  }
  return items;
}

/** Fetch latest public post URLs for a Naver blog (newest first). */
export async function listRecentNaverPosts(
  blogId: string,
  limit = BULK_IMPORT_TARGET,
): Promise<NaverListItem[]> {
  const target = Math.max(1, Math.min(limit, BULK_IMPORT_TARGET));
  const countPerPage = Math.min(30, target);
  const collected: NaverListItem[] = [];
  const seen = new Set<string>();
  let page = 1;

  while (collected.length < target && page <= 10) {
    const batch = await fetchListPage(blogId, page, countPerPage);
    if (!batch.length) break;

    for (const item of batch) {
      if (seen.has(item.logNo)) continue;
      seen.add(item.logNo);
      collected.push(item);
      if (collected.length >= target) break;
    }

    if (batch.length < countPerPage) break;
    page += 1;
    await sleep(500);
  }

  if (!collected.length) {
    throw new Error("가져올 공개 글이 없습니다. 블로그 ID나 공개 설정을 확인해 주세요.");
  }

  return collected.slice(0, target);
}

export function toImportItems(list: NaverListItem[]): SourceImportItem[] {
  return list.map((item) => ({
    logNo: item.logNo,
    url: item.url,
    title: item.title,
    publishedAt: item.publishedAt,
    status: "pending" as const,
  }));
}

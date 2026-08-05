import { getUnsplashAccessKey } from "@/lib/integration-config";
import { fetchWithTimeout } from "@/lib/integrations";
import { uploadImageBuffer } from "@/lib/storage";
import { generateAndStoreImage, type GeneratedImage } from "@/lib/image-gen";

export type StockImageResult = {
  imageUrl: string;
  caption: string;
  sourceMeta: {
    provider: "unsplash" | "ai" | "fallback" | "news";
    author?: string;
    authorUrl?: string;
    pageUrl?: string;
    license: string;
  };
  usedFallback: boolean;
};

export async function isUnsplashConfigured() {
  return Boolean((await getUnsplashAccessKey()).trim());
}

export function isUnsplashRateLimitError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error || "");
  return /unsplash/i.test(msg) && (/403/.test(msg) || /rate limit/i.test(msg));
}

/**
 * Search Unsplash for a query, download the photo, store locally/S3,
 * and return attribution caption + sourceMeta.
 * Does NOT fall back to AI image generation — caller should use news images instead.
 */
export async function fetchUnsplashSceneImage(input: {
  query: string;
  folder?: string;
  /** When true, skip Unsplash API entirely (already rate-limited this run). */
  skipUnsplash?: boolean;
}): Promise<StockImageResult> {
  const query = input.query.trim().slice(0, 120) || "blog illustration";
  const key = (await getUnsplashAccessKey()).trim();

  if (input.skipUnsplash) {
    throw new Error("Unsplash 검색 실패 (403): Rate Limit Exceeded");
  }

  if (!key) {
    throw new Error("UNSPLASH_ACCESS_KEY가 설정되지 않았습니다.");
  }

  const searchUrl = new URL("https://api.unsplash.com/search/photos");
  searchUrl.searchParams.set("query", query);
  searchUrl.searchParams.set("per_page", "5");
  searchUrl.searchParams.set("orientation", "landscape");
  searchUrl.searchParams.set("content_filter", "high");

  const res = await fetchWithTimeout(
    searchUrl.toString(),
    {
      headers: {
        Authorization: `Client-ID ${key}`,
        "Accept-Version": "v1",
      },
    },
    20_000,
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Unsplash 검색 실패 (${res.status}): ${detail.slice(0, 160)}`);
  }

  const data = (await res.json()) as {
    results?: Array<{
      id: string;
      urls?: { regular?: string; small?: string };
      links?: { html?: string };
      user?: { name?: string; links?: { html?: string } };
      alt_description?: string | null;
      description?: string | null;
    }>;
  };

  const photo = data.results?.[0];
  const downloadUrl = photo?.urls?.regular || photo?.urls?.small;
  if (!photo || !downloadUrl) {
    throw new Error(`Unsplash 결과가 없습니다: ${query}`);
  }

  const imgRes = await fetchWithTimeout(downloadUrl, {}, 30_000);
  if (!imgRes.ok) throw new Error("Unsplash 이미지 다운로드에 실패했습니다.");
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") || "image/jpeg";
  const upload = await uploadImageBuffer({
    buffer,
    contentType: contentType.includes("png") ? "image/png" : "image/jpeg",
    folder: input.folder || "posts",
  });

  const author = photo.user?.name?.trim() || "Unknown";
  const authorUrl = photo.user?.links?.html || "https://unsplash.com";
  const pageUrl = photo.links?.html || authorUrl;
  const caption = `Photo by ${author} on Unsplash`.slice(0, 200);

  // Best-effort download tracking (Unsplash API guidelines)
  void trackUnsplashDownload(key, photo.id);

  return {
    imageUrl: upload.imageUrl,
    caption,
    sourceMeta: {
      provider: "unsplash",
      author,
      authorUrl,
      pageUrl,
      license: "Unsplash License",
    },
    usedFallback: false,
  };
}

export async function fetchSceneImagesForTopic(input: {
  queries: string[];
  folder?: string;
  /** unsplash (default) | ai — AI only when explicitly requested */
  imageSource?: "unsplash" | "ai";
}): Promise<{
  results: Array<StockImageResult | null>;
  errors: Array<string | null>;
  rateLimited: boolean;
}> {
  const source = input.imageSource || "unsplash";
  const results: Array<StockImageResult | null> = new Array(input.queries.length).fill(null);
  const errors: Array<string | null> = new Array(input.queries.length).fill(null);
  let rateLimited = false;

  // AI only when checkbox / imageSource === "ai"
  if (source === "ai") {
    let cursor = 0;
    async function worker() {
      while (cursor < input.queries.length) {
        const i = cursor;
        cursor += 1;
        const q = input.queries[i];
        try {
          const gen = await generateAndStoreImage({
            prompt: q,
            folder: input.folder,
          });
          results[i] = fromGenerated(gen);
          errors[i] = null;
        } catch (e) {
          errors[i] = e instanceof Error ? e.message : "이미지 가져오기 실패";
          results[i] = null;
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(2, Math.max(input.queries.length, 1)) }, () => worker()),
    );
    return { results, errors, rateLimited: false };
  }

  // Unsplash path — never call AI; empty slots are filled with news by the caller
  for (let i = 0; i < input.queries.length; i++) {
    const q = input.queries[i];
    try {
      results[i] = await fetchUnsplashSceneImage({
        query: q,
        folder: input.folder,
        skipUnsplash: rateLimited,
      });
      errors[i] = null;
    } catch (e) {
      if (isUnsplashRateLimitError(e)) rateLimited = true;
      errors[i] = e instanceof Error ? e.message : "이미지 가져오기 실패";
      results[i] = null;
    }
  }
  return { results, errors, rateLimited };
}

async function trackUnsplashDownload(accessKey: string, photoId: string) {
  try {
    await fetchWithTimeout(
      `https://api.unsplash.com/photos/${photoId}/download`,
      { headers: { Authorization: `Client-ID ${accessKey}`, "Accept-Version": "v1" } },
      10_000,
    );
  } catch {
    // ignore
  }
}

function fromGenerated(gen: GeneratedImage): StockImageResult {
  return {
    imageUrl: gen.imageUrl,
    caption: `AI 생성 · 참고용`.slice(0, 200),
    sourceMeta: {
      provider: gen.usedFallback ? "fallback" : "ai",
      license: gen.usedFallback ? "placeholder" : "AI generated (provider terms)",
    },
    usedFallback: gen.usedFallback,
  };
}

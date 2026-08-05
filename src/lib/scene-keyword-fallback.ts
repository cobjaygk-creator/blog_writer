import type { ReviewTheme } from "@/lib/product-facts";

export type SceneKeywordImage = {
  id: string;
  caption?: string | null;
};

/** imageId to synthesized scene keyword (only for previously empty captions). */
export type SceneKeywordMap = Record<string, string>;

/**
 * Fill empty scene keywords using Vision captions + cross-validated review themes.
 * Never overwrites a non-empty user/vision caption.
 */
export function synthesizeSceneKeywords(
  images: SceneKeywordImage[],
  reviewThemes: ReviewTheme[],
  visionCaptions: string[] = [],
): SceneKeywordMap {
  const themes = reviewThemes.filter((t) => t.theme.trim() && t.sourceCount >= 3);
  const map: SceneKeywordMap = {};
  if (!images.length || !themes.length) return map;

  let themeCursor = 0;
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (img.caption?.trim()) continue;

    const vision = visionCaptions[i]?.trim() || "";
    const matched = pickThemeForVision(vision, themes) || themes[themeCursor % themes.length];
    themeCursor += 1;

    const themeBit = matched.theme.trim();
    const synthesized = vision
      ? `${vision} · ${themeBit}`.slice(0, 200)
      : themeBit.slice(0, 200);
    if (synthesized) map[img.id] = synthesized;
  }
  return map;
}

/**
 * Phase-1 minimal fallback when review themes are unavailable.
 * Uses keyword / product name (+ optional vision hint). Never overwrites non-empty captions.
 */
export function fillEmptyCaptionsWithKeyword(
  images: SceneKeywordImage[],
  keyword: string,
  options?: { productName?: string | null; visionCaptions?: string[] },
): SceneKeywordMap {
  const base = (options?.productName?.trim() || keyword.trim()).slice(0, 80);
  const map: SceneKeywordMap = {};
  if (!images.length || !base) return map;

  let emptyIndex = 0;
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (img.caption?.trim()) continue;
    emptyIndex += 1;
    const vision = options?.visionCaptions?.[i]?.trim() || "";
    const label = vision
      ? `${vision} · ${base}`.slice(0, 200)
      : `${base} 장면 ${emptyIndex}`.slice(0, 200);
    map[img.id] = label;
  }
  return map;
}

/** Apply synthesized keywords onto in-memory image captions (does not persist). */
export function applySceneKeywordMap<T extends SceneKeywordImage>(
  images: T[],
  map: SceneKeywordMap,
): T[] {
  return images.map((img) => {
    if (img.caption?.trim()) return img;
    const next = map[img.id];
    if (!next) return img;
    return { ...img, caption: next };
  });
}

function pickThemeForVision(vision: string, themes: ReviewTheme[]): ReviewTheme | null {
  if (!vision) return null;
  const v = vision.toLowerCase();
  let best: ReviewTheme | null = null;
  let bestScore = 0;
  for (const t of themes) {
    const words = t.theme
      .split(/[\s,/·]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 2);
    const score = words.reduce((s, w) => (v.includes(w) ? s + 1 : s), 0);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return bestScore > 0 ? best : null;
}

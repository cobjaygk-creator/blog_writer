export type BlogCopyMode = "naver" | "embed";

/**
 * Copy HTML for external blog editors (Naver / Tistory).
 *
 * Default `naver` mode keeps public https image URLs — Naver SmartEditor
 * rejects `data:` base64 images with "허용되지 않는 이미지형식".
 * Optional `embed` mode inlines small images as data URLs (Word/HWP-style).
 */
export async function copyHtmlForBlogEditor(
  html: string,
  plain: string,
  mode: BlogCopyMode = "naver",
) {
  const richHtml =
    mode === "embed" ? await embedImagesAsDataUrls(html) : absolutizeImageSrcs(html);

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([richHtml], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      }),
    ]);
    return;
  }

  await navigator.clipboard.writeText(plain);
}

/** Turn relative img src into absolute URLs using the current origin. */
export function absolutizeImageSrcs(html: string, origin = defaultOrigin()) {
  if (!html || !origin) return html;
  return html.replace(/<img\b([^>]*)>/gi, (full, attrs: string) => {
    const match = attrs.match(/\bsrc\s*=\s*(["'])([^"']*)\1/i);
    if (!match) return full;
    const quote = match[1];
    const src = match[2];
    const absolute = toAbsoluteUrl(src, origin);
    if (absolute === src) return full;
    const nextAttrs = attrs.replace(match[0], `src=${quote}${absolute}${quote}`);
    return `<img${nextAttrs}>`;
  });
}

function defaultOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function toAbsoluteUrl(src: string, origin: string) {
  const trimmed = src.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) {
    const protocol =
      typeof window !== "undefined" ? window.location.protocol : "https:";
    return `${protocol}${trimmed}`;
  }
  // data: / blob: left as-is (Naver may still reject data:)
  if (/^(data:|blob:)/i.test(trimmed)) return trimmed;
  try {
    return new URL(trimmed, origin.endsWith("/") ? origin : `${origin}/`).toString();
  } catch {
    return trimmed;
  }
}

const EMBED_MAX_BYTES = 1.5 * 1024 * 1024;

async function embedImagesAsDataUrls(html: string) {
  let richHtml = absolutizeImageSrcs(html);
  const imgSrcs = [...richHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
  const unique = [...new Set(imgSrcs)];

  for (const src of unique) {
    if (src.startsWith("data:")) continue;
    try {
      const dataUrl = await fetchImageAsDataUrl(src);
      if (dataUrl) {
        richHtml = richHtml.split(src).join(dataUrl);
      }
    } catch {
      // keep absolute URL
    }
  }
  return richHtml;
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  if (blob.size > EMBED_MAX_BYTES) return null;
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

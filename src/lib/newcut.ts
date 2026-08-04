/** New Cut (shorts) — Ditodio product surface via deep link + platform handoff. */

export type NewCutDeepLinkParams = {
  from?: string;
  brandId?: string;
  postId?: string;
  /** Public blog URL for New Cut create studio prefill (optional). */
  url?: string;
  /** Hash route inside New Cut. Default: studio create (blog tab). */
  hash?: string;
  source?: "blog" | "youtube" | "upload";
  /** Short-lived SSO handoff token from /api/platform/handoff */
  handoff?: string;
};

export function getNewCutUrl() {
  return (
    process.env.NEXT_PUBLIC_NEW_CUT_URL?.trim() ||
    process.env.NEW_CUT_URL?.trim() ||
    "http://127.0.0.1:5173"
  );
}

/**
 * Builds a New Cut deep link under Ditodio.
 * Example:
 *   http://127.0.0.1:5173/?from=ditodio&source=blog&postId=…#/studio/create
 */
export function buildNewCutDeepLink(params?: NewCutDeepLinkParams) {
  const base = getNewCutUrl().replace(/\/$/, "");
  const url = new URL(base.includes("://") ? base : `https://${base}`);
  url.searchParams.set("from", params?.from || "ditodio");
  url.searchParams.set("source", params?.source || "blog");
  if (params?.brandId) url.searchParams.set("brandId", params.brandId);
  if (params?.postId) url.searchParams.set("postId", params.postId);
  if (params?.url) url.searchParams.set("url", params.url);
  if (params?.handoff) url.searchParams.set("handoff", params.handoff);

  const hash = (params?.hash || "#/studio/create").replace(/^#?/, "#");
  return `${url.origin}${url.pathname}${url.search}${hash}`;
}

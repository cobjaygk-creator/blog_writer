/** New Cut is a separate product; only deep-link from blog_writer. */
export function getNewCutUrl() {
  return (
    process.env.NEXT_PUBLIC_NEW_CUT_URL?.trim() ||
    process.env.NEW_CUT_URL?.trim() ||
    "https://newcut.app"
  );
}

export function buildNewCutDeepLink(params?: {
  from?: string;
  brandId?: string;
  postId?: string;
}) {
  const base = getNewCutUrl().replace(/\/$/, "");
  const url = new URL(base.includes("://") ? base : `https://${base}`);
  url.searchParams.set("from", params?.from || "blog_writer");
  if (params?.brandId) url.searchParams.set("brandId", params.brandId);
  if (params?.postId) url.searchParams.set("postId", params.postId);
  return url.toString();
}

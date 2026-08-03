const EMBED_MAX_BYTES = 1.5 * 1024 * 1024;

export async function copyHtmlForBlogEditor(html: string, plain: string) {
  let richHtml = html;
  const imgSrcs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
  const unique = [...new Set(imgSrcs)];

  for (const src of unique) {
    if (src.startsWith("data:")) continue;
    try {
      const dataUrl = await fetchImageAsDataUrl(src);
      if (dataUrl) {
        richHtml = richHtml.split(src).join(dataUrl);
      }
    } catch {
      // keep original URL
    }
  }

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

import { GROUP_IMAGE_STYLE, groupImageTag } from "@/lib/image-style";
import type { PublishImageInput } from "@/lib/publish-body";

export type ImageGroupCols = 2 | 3;

function escapeAlt(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildImageGroupHtml(
  images: PublishImageInput[],
  cols: ImageGroupCols = 2,
) {
  if (!images.length) return "";
  const columns = (images.length === 1 ? 1 : Math.min(cols, images.length)) as 1 | 2 | 3;
  const imgs = images
    .map((img, index) => {
      const alt = escapeAlt(img.caption || `사진 ${index + 1}`);
      return groupImageTag(img.imageUrl, alt);
    })
    .join("");

  return `<div data-type="image-group" data-cols="${columns}" class="bw-image-group bw-image-group--${columns}" style="display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:8px;margin:12px 0;">${imgs}</div>`;
}

/** Split images into groups of `cols` (last group may be smaller). */
export function chunkImages<T>(items: T[], size: number): T[][] {
  if (size < 1) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function buildGroupedImagesHtml(
  images: PublishImageInput[],
  cols: ImageGroupCols = 2,
) {
  return chunkImages(images, cols)
    .map((chunk) => buildImageGroupHtml(chunk, cols))
    .join("");
}

export { GROUP_IMAGE_STYLE };

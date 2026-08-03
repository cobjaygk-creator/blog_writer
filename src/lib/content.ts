import { buildGroupedImagesHtml, buildImageGroupHtml, type ImageGroupCols } from "@/lib/image-group";
import { imagesToSlots, type SlotImage } from "@/lib/image-slots";
import { prepareEditorHtml, singleImageTag } from "@/lib/image-style";
import { markdownToPublishHtml } from "@/lib/markdown";
import type { PublishImageInput } from "@/lib/publish-body";

export function looksLikeHtml(source: string) {
  return /<\/?(p|h[1-6]|div|img|ul|ol|li|br|strong|em|figure|blockquote|table|thead|tbody|tr|th|td|mark)\b/i.test(
    source,
  );
}

export function escapeHtmlText(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Remove empty spacer paragraphs that show up as blank boxes under images. */
export function stripEmptyBlocks(html: string) {
  return prepareEditorHtml(html || "");
}

/** Normalize stored body (markdown or HTML) into editor HTML, ensuring images exist. */
export function toEditorHtml(
  body: string,
  images: PublishImageInput[] = [],
  slotImages?: SlotImage[],
) {
  const raw = (body || "").trim();
  const html = !raw ? "" : looksLikeHtml(raw) ? raw : markdownToPublishHtml(raw);
  return prepareEditorHtml(
    ensureImagesInHtml(html, images, slotImages ? { slotImages } : undefined),
  );
}

export function ensureImagesInHtml(
  html: string,
  images: PublishImageInput[],
  options?: { groupCols?: ImageGroupCols | "single"; slotImages?: SlotImage[] },
) {
  if (!images.length) return html;
  let next = html.trim();
  const missing = images.filter((img) => !next.includes(img.imageUrl));
  if (!missing.length) return next || "";

  let blocks = "";
  if (options?.slotImages?.length) {
    const slots = imagesToSlots(options.slotImages);
    const missingUrls = new Set(missing.map((img) => img.imageUrl));
    blocks = slots
      .map((slot) => {
        if (slot.kind === "single") {
          if (!missingUrls.has(slot.image.imageUrl)) return "";
          const alt = escapeHtmlText(slot.image.caption || "사진");
          return `<p>${singleImageTag(slot.image.imageUrl, alt)}</p><p><em>${alt}</em></p>`;
        }
        const members = slot.images.filter((img) => missingUrls.has(img.imageUrl));
        if (!members.length) return "";
        if (members.length === 1) {
          const alt = escapeHtmlText(members[0].caption || "사진");
          return `<p>${singleImageTag(members[0].imageUrl, alt)}</p>`;
        }
        return buildImageGroupHtml(
          members.map((img) => ({ imageUrl: img.imageUrl, caption: img.caption })),
          members.length >= 3 ? 3 : 2,
        );
      })
      .join("");
  } else {
    // Default to singles unless caller explicitly requests a group layout.
    const mode = options?.groupCols ?? "single";
    blocks =
      mode === "single"
        ? missing
            .map((img, index) => {
              const alt = escapeHtmlText(img.caption || `사진 ${index + 1}`);
              return `<p>${singleImageTag(img.imageUrl, alt)}</p><p><em>${alt}</em></p>`;
            })
            .join("")
        : buildGroupedImagesHtml(missing, mode);
  }

  const merged = (() => {
    if (!next) return blocks;
    const closeP = next.indexOf("</p>");
    if (closeP >= 0) {
      return `${next.slice(0, closeP + 4)}${blocks}${next.slice(closeP + 4)}`;
    }
    return `${next}${blocks}`;
  })();
  return prepareEditorHtml(merged);
}

export function htmlToPlainText(html: string) {
  return html
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, "\n[사진: $1]\n")
    .replace(/<img[^>]*>/gi, "\n[사진]\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type PublishImageInput = {
  imageUrl: string;
  caption?: string | null;
};

/** Markdown image line for a post image. */
export function imageMarkdown(image: PublishImageInput, index: number) {
  const alt = (image.caption || `사진 ${index + 1}`).replace(/[[\]]/g, "");
  return `![${alt}](${image.imageUrl})`;
}

/** True if body already references this image URL. */
export function bodyHasImage(body: string, imageUrl: string) {
  return body.includes(imageUrl);
}

/**
 * Ensure every image appears in the markdown body.
 * - Keeps existing embeds
 * - Inserts missing ones after the first paragraph block (or at end)
 */
export function ensureImagesInMarkdown(body: string, images: PublishImageInput[]): string {
  if (!images.length) return body.trim();

  let next = body.replace(/\r\n/g, "\n").trim();
  const missing = images
    .map((img, index) => ({ img, index }))
    .filter(({ img }) => !bodyHasImage(next, img.imageUrl));

  if (!missing.length) return next;

  const blocks = missing
    .map(({ img, index }) => `${imageMarkdown(img, index)}\n\n*${img.caption || `사진 ${index + 1}`}*`)
    .join("\n\n");

  // Prefer inserting after intro (first blank-line separated block)
  const parts = next.split(/\n{2,}/);
  if (parts.length >= 2) {
    const [intro, ...rest] = parts;
    return [intro, blocks, ...rest].join("\n\n").trim();
  }

  return `${next}\n\n${blocks}`.trim();
}

/** Build a simple interleaved draft body when LLM output lacks structure. */
export function buildImageAwareFallbackBody(input: {
  title: string;
  keyword: string;
  brandName: string;
  styleSummary: string;
  images: PublishImageInput[];
}) {
  const imageSections =
    input.images.length > 0
      ? input.images
          .map((img, i) => {
            const caption = img.caption || `사진 ${i + 1}`;
            return `${imageMarkdown(img, i)}\n\n${caption}\n`;
          })
          .join("\n")
      : "사진이 없어 텍스트 중심으로 작성했습니다.\n";

  return `# ${input.title}

${input.styleSummary}

이번 글의 키워드는 **${input.keyword}** 입니다.

## 본문

${imageSections}

## 마무리

${input.brandName}의 톤을 살려 ${input.keyword}를 소개해 보았습니다.
`;
}

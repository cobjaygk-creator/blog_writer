import { ensureTypographyRhythm } from "@/lib/typography-rhythm";

/** Unified inline styles so editor + Naver paste look consistent.
 *  Full frame (no crop) — contain scales within width / soft max-height. */
export const SINGLE_IMAGE_STYLE =
  "display:block;width:100%;max-width:100%;height:auto;max-height:720px;object-fit:contain;object-position:center;border-radius:8px;";

export const GROUP_IMAGE_STYLE =
  "display:block;width:100%;height:180px;object-fit:cover;object-position:center;border-radius:6px;";

/** Full image as registered (templates / banners) — no crop. */
export const NATURAL_IMAGE_STYLE =
  "display:block;width:100%;max-width:100%;height:auto;object-fit:contain;border-radius:0;";

export function singleImageTag(src: string, alt: string) {
  return `<img src="${src}" alt="${alt}" style="${SINGLE_IMAGE_STYLE}" />`;
}

export function groupImageTag(src: string, alt: string) {
  return `<img src="${src}" alt="${alt}" style="${GROUP_IMAGE_STYLE}" />`;
}

function findBalancedDivEnd(html: string, afterOpen: number) {
  let depth = 1;
  let i = afterOpen;
  const lower = html.toLowerCase();
  while (i < html.length && depth > 0) {
    const nextOpen = lower.indexOf("<div", i);
    const nextClose = lower.indexOf("</div>", i);
    if (nextClose < 0) return -1;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 4;
    } else {
      depth -= 1;
      i = nextClose + 6;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function rewriteImgTag(attrs: string, style: string) {
  const src = attrs.match(/\bsrc\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] ?? "";
  const alt = attrs.match(/\balt\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] ?? "";
  if (!src) return `<img${attrs}>`;
  const safeAlt = alt.replace(/"/g, "&quot;");
  return `<img src="${src}" alt="${safeAlt}" style="${style}" />`;
}

/** Force images to natural (uncropped) display. */
export function naturalizeImageStyles(html: string) {
  if (!html) return html;
  return html.replace(/<img\b([^>]*)>/gi, (_full, attrs: string) =>
    rewriteImgTag(attrs, NATURAL_IMAGE_STYLE),
  );
}

function extractDivBlocks(
  html: string,
  openRe: RegExp,
  tokenPrefix: string,
  mapBlock: (openAttrs: string, inner: string) => string,
) {
  const placeholders: string[] = [];
  let result = "";
  let cursor = 0;
  const re = new RegExp(openRe.source, openRe.flags.includes("g") ? openRe.flags : `${openRe.flags}g`);

  while (cursor < html.length) {
    re.lastIndex = cursor;
    const match = re.exec(html);
    if (!match) {
      result += html.slice(cursor);
      break;
    }
    const start = match.index;
    result += html.slice(cursor, start);
    const openTagEnd = start + match[0].length;
    const end = findBalancedDivEnd(html, openTagEnd);
    if (end < 0) {
      result += match[0];
      cursor = openTagEnd;
      continue;
    }
    const openAttrs = match[1] ?? "";
    const inner = html.slice(openTagEnd, end - "</div>".length);
    const block = mapBlock(openAttrs, inner);
    const token = `${tokenPrefix}${placeholders.length}__`;
    placeholders.push(block);
    result += token;
    cursor = end;
  }

  return { html: result, placeholders };
}

/** Rewrite img styles: template → natural, group → tile, others → single (uncropped). */
export function normalizeBodyImageStyles(html: string) {
  if (!html) return html;

  const templates = extractDivBlocks(
    html,
    /<div([^>]*\bdata-bw-template=["'](?:header|footer)["'][^>]*)>/gi,
    "__BW_TPL_",
    (openAttrs, inner) => `<div${openAttrs}>${naturalizeImageStyles(inner)}</div>`,
  );

  const groups = extractDivBlocks(
    templates.html,
    /<div([^>]*\bdata-type=["']image-group["'][^>]*)>/gi,
    "__BW_GROUP_",
    (openAttrs, inner) => {
      const nextInner = inner.replace(/<img\b([^>]*)>/gi, (_img, attrs: string) =>
        rewriteImgTag(attrs, GROUP_IMAGE_STYLE),
      );
      return `<div${openAttrs}>${nextInner}</div>`;
    },
  );

  let normalized = groups.html.replace(/<img\b([^>]*)>/gi, (_full, attrs: string) =>
    rewriteImgTag(attrs, SINGLE_IMAGE_STYLE),
  );

  normalized = groups.placeholders.reduce(
    (acc, block, index) => acc.replace(`__BW_GROUP_${index}__`, block),
    normalized,
  );
  normalized = templates.placeholders.reduce(
    (acc, block, index) => acc.replace(`__BW_TPL_${index}__`, block),
    normalized,
  );

  return normalized;
}

function cleanupEditorHtml(html: string) {
  return html
    .replace(/<img\b[^>]*class=["'][^"']*ProseMirror-separator[^"']*["'][^>]*>/gi, "")
    .replace(/<p>\s*(<img\b[^>]*>)\s*<\/p>/gi, "$1")
    .replace(/<p>\s*(<div[^>]*data-type=["']image-group["'][\s\S]*?<\/div>)\s*<\/p>/gi, "$1")
    .replace(/<p>\s*(<div[^>]*data-bw-template=["'][^"']*["'][\s\S]*?<\/div>)\s*<\/p>/gi, "$1")
    .replace(/<p>\s*(<br\s*\/?>|&nbsp;|\u00a0)?\s*<\/p>/gi, "")
    .replace(/<p>\s*<em>\s*<\/em>\s*<\/p>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Prepare HTML for block editors: unwrap images from empty wrappers, drop blank paragraphs. */
export function prepareEditorHtml(html: string) {
  return cleanupEditorHtml(normalizeBodyImageStyles(ensureTypographyRhythm(html || "")));
}

/** Prepare template HTML: keep full images, no crop/tile styles. */
export function prepareTemplateHtml(html: string) {
  return cleanupEditorHtml(naturalizeImageStyles(html || ""));
}

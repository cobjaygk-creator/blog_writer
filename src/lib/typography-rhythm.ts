/** Default blog typography rhythm used in editor + paste HTML. */
export const TYPE_SIZE_BODY = "15px";
export const TYPE_SIZE_EMPHASIS = "18px";
export const TYPE_SIZE_HEADING = "22px";

const DEFAULT_ACCENT = "#E85D04";

function hasFontSize(fragment: string) {
  return /font-size\s*:/i.test(fragment);
}

function extractColor(fragment: string, fallback: string) {
  const m = fragment.match(/color\s*:\s*([^;"']+)/i);
  const value = m?.[1]?.trim();
  return value || fallback;
}

/** Drop font-size from a tag's style= attribute (keep color/align/etc). */
function stripFontSizeFromAttrs(attrs: string) {
  if (!attrs) return "";
  return attrs.replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (_full, quote: string, style: string) => {
    const next = style
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part && !/^font-size\s*:/i.test(part))
      .join("; ");
    return next ? ` style=${quote}${next}${quote}` : "";
  });
}

function wrapWithSize(inner: string, size: string, color?: string) {
  const colorPart = color ? `;color:${color}` : "";
  return `<span style="font-size:${size}${colorPart}">${inner}</span>`;
}

/**
 * Ensure 15/18/22px rhythm survives TipTap (which drops style on h2/h3).
 * Moves heading font-size onto inner spans TipTap TextStyle can keep.
 * Idempotent: skips fragments that already declare font-size.
 */
export function ensureTypographyRhythm(html: string, accent = DEFAULT_ACCENT) {
  if (!html?.trim()) return html;

  let out = html;

  out = out.replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/gi, (_full, attrs = "", inner: string) => {
    const open = String(attrs || "");
    const color = extractColor(`${open} ${inner}`, accent);
    const cleaned = stripFontSizeFromAttrs(open);
    if (hasFontSize(inner)) {
      return `<h2${cleaned}>${inner}</h2>`;
    }
    return `<h2${cleaned}>${wrapWithSize(inner, TYPE_SIZE_HEADING, color)}</h2>`;
  });

  out = out.replace(/<h3(\s[^>]*)?>([\s\S]*?)<\/h3>/gi, (_full, attrs = "", inner: string) => {
    const open = String(attrs || "");
    const color = extractColor(`${open} ${inner}`, accent);
    const cleaned = stripFontSizeFromAttrs(open);
    if (hasFontSize(inner)) {
      return `<h3${cleaned}>${inner}</h3>`;
    }
    return `<h3${cleaned}>${wrapWithSize(inner, TYPE_SIZE_EMPHASIS, color)}</h3>`;
  });

  // Body paragraphs: only promote <strong>-heavy lines to 18px (idempotent).
  out = out.replace(/<p(\s[^>]*)?>([\s\S]*?)<\/p>/gi, (full, attrs = "", inner: string) => {
    const open = String(attrs || "");
    if (hasFontSize(inner) || hasFontSize(open)) return full;
    if (/<img\b/i.test(inner) && !/<strong\b/i.test(inner)) return full;
    if (!/<strong\b/i.test(inner)) return full;
    const cleaned = stripFontSizeFromAttrs(open);
    return `<p${cleaned}>${wrapWithSize(inner, TYPE_SIZE_EMPHASIS)}</p>`;
  });

  return out;
}

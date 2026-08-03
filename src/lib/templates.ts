import { naturalizeImageStyles, prepareTemplateHtml } from "@/lib/image-style";

export type TemplateKind = "header" | "footer";

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

/** Remove previously applied header/footer template wrappers from body HTML. */
export function stripTemplateBlocks(html: string, kind?: TemplateKind) {
  if (!html) return "";
  let result = html;
  const kinds: TemplateKind[] = kind ? [kind] : ["header", "footer"];

  for (const k of kinds) {
    const openRe = new RegExp(`<div\\b[^>]*\\bdata-bw-template=["']${k}["'][^>]*>`, "i");
    while (true) {
      const match = openRe.exec(result);
      if (!match) break;
      const start = match.index;
      const end = findBalancedDivEnd(result, start + match[0].length);
      if (end < 0) {
        result = result.slice(0, start) + result.slice(start + match[0].length);
      } else {
        result = `${result.slice(0, start)}${result.slice(end)}`;
      }
      openRe.lastIndex = 0;
    }
  }

  return result.replace(/\n{3,}/g, "\n\n").trim();
}

export function wrapTemplateHtml(kind: TemplateKind, html: string, templateId?: string) {
  const inner = prepareTemplateHtml(naturalizeImageStyles(html || ""));
  if (!inner) return "";
  const idAttr = templateId ? ` data-template-id="${templateId}"` : "";
  return `<div data-bw-template="${kind}"${idAttr} class="bw-template-block">${inner}</div>`;
}

/** Insert or replace a header/footer template block in the post body. */
export function applyTemplateToBody(
  body: string,
  kind: TemplateKind,
  html: string,
  templateId?: string,
) {
  const cleaned = stripTemplateBlocks(body || "", kind);
  const block = wrapTemplateHtml(kind, html, templateId);
  if (!block) return cleaned;
  if (kind === "header") {
    return [block, cleaned].filter(Boolean).join("\n");
  }
  return [cleaned, block].filter(Boolean).join("\n");
}

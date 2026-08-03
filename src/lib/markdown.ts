/** Plain text for pasting into Naver/Tistory editors. */
export function markdownToPlainText(source: string): string {
  return source
    .replace(/\r\n/g, "\n")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => `\n[사진: ${alt || "이미지"}]\n${url}\n`)
    .replace(/```[\s\S]*?```/g, (block) =>
      block
        .replace(/^```[^\n]*\n?/, "")
        .replace(/```$/, "")
        .trim(),
    )
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Minimal HTML for editors that accept HTML paste (Tistory HTML mode, etc.). */
export function markdownToPublishHtml(source: string): string {
  const escaped = escapeHtml(source.replace(/\r\n/g, "\n"));
  const lines = escaped.split("\n");
  const html: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    const imageOnly = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageOnly) {
      closeList();
      const alt = imageOnly[1] || "이미지";
      const src = imageOnly[2];
      html.push(
        `<p><img src="${src}" alt="${alt}" style="max-width:100%;height:auto;" /></p><p>${alt}</p>`,
      );
      continue;
    }
    if (/^###\s+/.test(line)) {
      closeList();
      html.push(`<h3>${inlinePlain(line.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      closeList();
      html.push(`<h2>${inlinePlain(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (/^#\s+/.test(line)) {
      closeList();
      html.push(`<h1>${inlinePlain(line.replace(/^#\s+/, ""))}</h1>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlinePlain(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    closeList();
    html.push(`<p>${inlinePlain(line)}</p>`);
  }
  closeList();
  return html.join("\n");
}

function inlinePlain(text: string) {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
      const a = alt || "이미지";
      return `<img src="${src}" alt="${a}" style="max-width:100%;height:auto;" />`;
    })
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

/** Lightweight markdown → safe HTML for draft preview (no external deps). */
export function markdownToHtml(source: string): string {
  const escaped = escapeHtml(source.replace(/\r\n/g, "\n"));
  const lines = escaped.split("\n");
  const html: string[] = [];
  let inList = false;
  let inCode = false;
  let codeBuf: string[] = [];

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre class="overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs"><code>${codeBuf.join("\n")}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    const imageOnly = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageOnly) {
      closeList();
      const alt = imageOnly[1] || "이미지";
      const src = imageOnly[2];
      html.push(
        `<figure class="mt-4"><img src="${src}" alt="${alt}" class="w-full rounded-lg object-cover" /><figcaption class="mt-2 text-xs text-zinc-500">${alt}</figcaption></figure>`,
      );
      continue;
    }

    if (/^###\s+/.test(line)) {
      closeList();
      html.push(`<h3 class="mt-4 text-base font-semibold text-zinc-900">${inline(line.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      closeList();
      html.push(`<h2 class="mt-5 text-lg font-semibold text-zinc-900">${inline(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (/^#\s+/.test(line)) {
      closeList();
      html.push(`<h1 class="mt-6 text-xl font-semibold text-zinc-900">${inline(line.replace(/^#\s+/, ""))}</h1>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        html.push('<ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-800">');
        inList = true;
      }
      html.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    closeList();
    html.push(`<p class="mt-2 text-sm leading-7 text-zinc-800">${inline(line)}</p>`);
  }

  closeList();
  if (inCode) {
    html.push(`<pre class="overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs"><code>${codeBuf.join("\n")}</code></pre>`);
  }
  return html.join("\n");
}

function inline(text: string) {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
      const a = alt || "이미지";
      return `<img src="${src}" alt="${a}" class="my-2 max-w-full rounded-lg" />`;
    })
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="rounded bg-zinc-100 px-1 py-0.5 text-[12px]">$1</code>');
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

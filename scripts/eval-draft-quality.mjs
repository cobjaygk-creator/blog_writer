import { readdirSync, readFileSync } from "fs";
import path from "path";

const ROOT = path.join(process.cwd(), "evals", "draft-quality", "fixtures");

const BANNED = [
  /세련된\s*변신/,
  /매력적으로\s*변신/,
  /유익한\s*정보로/,
  /좋은\s*하루\s*되세/,
  /종합적인\s*분석/,
  /전반적인\s*만족도/,
];

function scoreDraft(text) {
  const issues = [];
  let score = 100;
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < 40) {
    score -= 30;
    issues.push("too_short");
  }
  for (const re of BANNED) {
    if (re.test(trimmed)) {
      score -= 20;
      issues.push(`banned:${re.source}`);
    }
  }
  const sentences = trimmed.split(/[.!?。\n]+/).filter((s) => s.trim().length > 8);
  const unique = new Set(sentences.map((s) => s.trim()));
  if (sentences.length >= 2 && unique.size < sentences.length) {
    score -= 25;
    issues.push("repeated_sentences");
  }
  const emoji = (trimmed.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length;
  if (emoji >= 3) {
    score -= 10;
    issues.push("emoji_heavy");
  }
  // Prefer concrete work nouns for "good" worklog-ish drafts
  const concrete = /(장착|시공|범퍼|스커트|볼트|점검|도장|재질|FRP)/i.test(trimmed);
  if (concrete) score += 5;
  return { score: Math.max(0, Math.min(100, score)), issues };
}

function loadDir(kind) {
  const dir = path.join(ROOT, kind);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => ({
      kind,
      name: f,
      text: readFileSync(path.join(dir, f), "utf8"),
    }));
}

function main() {
  const goods = loadDir("good");
  const bads = loadDir("bad");
  const rows = [...goods, ...bads].map((f) => {
    const r = scoreDraft(f.text);
    const expectPass = f.kind === "good";
    const pass = expectPass ? r.score >= 70 : r.score < 70;
    return { ...f, ...r, expectPass, pass };
  });

  let failed = 0;
  for (const row of rows) {
    const mark = row.pass ? "OK" : "FAIL";
    if (!row.pass) failed += 1;
    console.log(
      `${mark} [${row.kind}] ${row.name} score=${row.score} issues=${row.issues.join(",") || "-"}`,
    );
  }

  console.log(`\n${rows.length - failed}/${rows.length} passed`);
  if (failed) process.exit(1);
}

main();

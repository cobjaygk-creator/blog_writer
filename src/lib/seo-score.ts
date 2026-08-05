import { htmlToPlainText } from "@/lib/content";
import { allowFallback, isLlmConfigured } from "@/lib/integrations";
import { chatCompletion } from "@/lib/llm";
import type { DraftProvider, DraftTokenUsage } from "@/lib/llm-providers";
import type { TopicPlan } from "@/lib/topic-draft";
import type { TopicResearchBrief } from "@/lib/topic-research";
import { getTopicLengthPreset, type TopicLength } from "@/lib/topic-length";

export type SeoScoreResult = {
  /** 0–100 heuristic content checklist (not a search ranking guarantee). */
  score: number;
  issues: string[];
  checks: Record<string, number>;
};

const DEFAULT_THRESHOLD = 55;

function clamp100(n: number) {
  return Math.min(100, Math.max(0, Math.round(n)));
}

function countH2(html: string) {
  return (html.match(/<h2[\s>]/gi) || []).length;
}

function keywordInLead(plain: string, keyword: string) {
  const k = keyword.trim().toLowerCase();
  if (!k) return false;
  const lead = plain.slice(0, Math.min(280, plain.length)).toLowerCase();
  return lead.includes(k) || k.split(/\s+/).filter((w) => w.length >= 2).some((w) => lead.includes(w));
}

/** Heuristic SEO/content checklist for topic drafts. Does not predict rankings. */
export function scoreTopicSeo(input: {
  html: string;
  title?: string | null;
  topic: string;
  length?: TopicLength | string | null;
  plan?: TopicPlan | null;
  research?: TopicResearchBrief | null;
  imageCount?: number;
}): SeoScoreResult {
  const plain = htmlToPlainText(input.html);
  const issues: string[] = [];
  const checks: Record<string, number> = {};
  const topic = input.topic.trim();
  const title = (input.title || "").trim();

  if (!plain.trim()) {
    return {
      score: 0,
      issues: ["본문이 비어 있습니다"],
      checks: { empty: 0 },
    };
  }

  // Keyword / topic in title (15)
  const titleHit =
    title &&
    (title.toLowerCase().includes(topic.toLowerCase()) ||
      topic.split(/\s+/).some((w) => w.length >= 2 && title.includes(w)));
  checks.titleKeyword = titleHit ? 15 : 0;
  if (!titleHit) issues.push("제목에 주제 키워드가 약합니다");

  // Keyword in lead (15)
  const leadHit = keywordInLead(plain, topic);
  checks.leadKeyword = leadHit ? 15 : 0;
  if (!leadHit) issues.push("도입부에 주제가 잘 보이지 않습니다");

  // H2 structure (15)
  const h2 = countH2(input.html);
  const wantSections =
    input.plan?.sections?.length ||
    (input.length && typeof input.length === "string"
      ? getTopicLengthPreset(input.length as TopicLength).sectionCount
      : 4);
  const h2Score =
    h2 === 0 ? 0 : h2 >= Math.max(2, Math.min(wantSections, 6)) ? 15 : h2 >= 2 ? 10 : 5;
  checks.headings = h2Score;
  if (h2 < 2) issues.push("소제목(H2) 구조가 부족합니다");

  // Length vs preset (15)
  const preset =
    input.length && typeof input.length === "string"
      ? getTopicLengthPreset(input.length as TopicLength)
      : getTopicLengthPreset("medium");
  const midTarget = (preset.targetChars.min + preset.targetChars.max) / 2;
  const lenRatio = plain.length / Math.max(midTarget, 1);
  let lengthScore = 15;
  if (lenRatio < 0.55) {
    lengthScore = 5;
    issues.push("본문 분량이 목표보다 짧습니다");
  } else if (lenRatio < 0.75) {
    lengthScore = 10;
  } else if (lenRatio > 1.6) {
    lengthScore = 10;
    issues.push("본문이 목표 분량보다 깁니다");
  }
  checks.length = lengthScore;

  // Research grounding (15)
  const factHints = (input.research?.facts || [])
    .map((f) => f.slice(0, 24))
    .filter((f) => f.length >= 4);
  let researchHits = 0;
  for (const f of factHints.slice(0, 6)) {
    if (plain.includes(f.slice(0, Math.min(12, f.length)))) researchHits += 1;
  }
  const researchScore =
    !input.research || !factHints.length
      ? 8
      : researchHits >= 2
        ? 15
        : researchHits === 1
          ? 10
          : 4;
  checks.research = researchScore;
  if (input.research?.facts?.length && researchHits === 0) {
    issues.push("리서치 근거가 본문에 잘 드러나지 않습니다");
  }

  // Images / captions (10)
  const imgCount = (input.html.match(/<img[\s>]/gi) || []).length || input.imageCount || 0;
  checks.images = imgCount > 0 ? 10 : 3;
  if (imgCount === 0) issues.push("본문·첨부 이미지가 없습니다");

  // Disclaimer domains (10)
  const needsDisclaimer =
    Boolean(input.plan?.disclaimer) ||
    /(투자|주식|의료|병원|법률|세금|대출)/i.test(topic);
  const hasDisclaimer =
    /참고|면책|전문의|투자\s*권유|법적\s*조언|개인차/i.test(plain) ||
    Boolean(input.plan?.disclaimer && plain.includes(input.plan.disclaimer.slice(0, 12)));
  checks.disclaimer = !needsDisclaimer ? 10 : hasDisclaimer ? 10 : 2;
  if (needsDisclaimer && !hasDisclaimer) {
    issues.push("민감 주제인데 주의/면책 안내가 약합니다");
  }

  // Source variety signal (5)
  checks.sources =
    (input.research?.sources?.length || 0) >= 2 ? 5 : (input.research?.sources?.length || 0) === 1 ? 3 : 1;

  const score = clamp100(
    Object.values(checks).reduce((a, b) => a + b, 0),
  );

  return { score, issues, checks };
}

async function repairTopicSeoOnce(input: {
  html: string;
  title?: string | null;
  topic: string;
  issues: string[];
  plan?: TopicPlan | null;
  research?: TopicResearchBrief | null;
  draftProvider?: DraftProvider;
}): Promise<{ body: string; repaired: boolean; tokenUsage?: DraftTokenUsage }> {
  if (!isLlmConfigured()) {
    if (!allowFallback()) throw new Error("LLM_API_KEY가 설정되지 않았습니다.");
    return { body: input.html, repaired: false };
  }

  try {
    const facts = (input.research?.facts || []).slice(0, 6).join("\n- ");
    const { text, tokenUsage } = await chatCompletion(
      [
        {
          role: "system",
          content: `당신은 한국어 정보형 블로그 교정기입니다. JSON만 반환. 키: body(string HTML), title(string 선택).
규칙:
- 검색 순위를 보장한다고 쓰지 말 것. 구조·도입부 키워드·근거 문장만 보강
- 사실 왜곡·새 스펙 날조 금지. 리서치 팩트가 있으면 자연히 녹일 것
- h2 구조 유지·보강. 이미지 URL 유지
- 마크다운 금지. 허용: p, br, h2, h3, strong, em, ul, li, span, img, div`,
        },
        {
          role: "user",
          content: `주제: ${input.topic}
제목: ${input.title || "(없음)"}
문제점: ${input.issues.join(" · ") || "(체크리스트 미달)"}
리서치 팩트:
- ${facts || "(없음)"}
면책 힌트: ${input.plan?.disclaimer || "(없음)"}

원본 HTML:
${input.html.slice(0, 12000)}`,
        },
      ],
      {
        json: true,
        temperature: 0.35,
        maxTokens: 3500,
        draftProvider: input.draftProvider || "gpt",
      },
    );
    const parsed = JSON.parse(text) as { body?: string };
    const body = typeof parsed.body === "string" && parsed.body.trim() ? parsed.body.trim() : "";
    if (!body) return { body: input.html, repaired: false, tokenUsage };
    return { body, repaired: true, tokenUsage };
  } catch (e) {
    console.warn("[seo-score] repair failed:", e);
    return { body: input.html, repaired: false };
  }
}

export async function maybeRepairTopicSeo(input: {
  html: string;
  title?: string | null;
  topic: string;
  length?: TopicLength | string | null;
  plan?: TopicPlan | null;
  research?: TopicResearchBrief | null;
  imageCount?: number;
  threshold?: number;
  draftProvider?: DraftProvider;
}): Promise<{
  body: string;
  score: SeoScoreResult;
  repaired: boolean;
  tokenUsage?: DraftTokenUsage;
}> {
  const score = scoreTopicSeo(input);
  const threshold = input.threshold ?? DEFAULT_THRESHOLD;
  if (score.score >= threshold || !input.html.trim()) {
    return { body: input.html, score, repaired: false };
  }
  const repaired = await repairTopicSeoOnce({
    html: input.html,
    title: input.title,
    topic: input.topic,
    issues: score.issues,
    plan: input.plan,
    research: input.research,
    draftProvider: input.draftProvider,
  });
  const after = scoreTopicSeo({ ...input, html: repaired.body });
  if (after.score < score.score) {
    return { body: input.html, score, repaired: false, tokenUsage: repaired.tokenUsage };
  }
  return {
    body: repaired.body,
    score: after,
    repaired: repaired.repaired,
    tokenUsage: repaired.tokenUsage,
  };
}

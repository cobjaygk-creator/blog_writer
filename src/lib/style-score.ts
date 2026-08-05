import { htmlToPlainText } from "@/lib/content";
import { allowFallback, isLlmConfigured } from "@/lib/integrations";
import { chatCompletion } from "@/lib/llm";
import type { DraftProvider, DraftTokenUsage } from "@/lib/llm-providers";
import {
  normalizeExtendedTraits,
  type ExtendedStyleTraits,
} from "@/lib/style-traits";

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]|[\u2600-\u26FF]|[\u2700-\u27BF]/gu;

export type StyleScoreBreakdown = {
  emoji: number;
  phrases: number;
  domain: number;
  fluff: number;
  color: number;
  fonts: number;
};

export type StyleScoreResult = {
  score: number;
  breakdown: StyleScoreBreakdown;
  issues: string[];
};

const DEFAULT_THRESHOLD = 0.62;

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function expectedEmojiBand(usage: string): "none" | "low" | "mid" | "high" {
  if (/거의\s*없음|없음|none/i.test(usage)) return "none";
  if (/적음|적게|낮/i.test(usage)) return "low";
  if (/많음|자주|frequent/i.test(usage)) return "high";
  return "mid";
}

function actualEmojiBand(plain: string): "none" | "low" | "mid" | "high" {
  const emojis = plain.match(EMOJI_RE) || [];
  const density = emojis.length / Math.max(plain.length / 100, 1);
  if (emojis.length === 0 || density < 0.08) return "none";
  if (density < 0.35) return "low";
  if (density >= 1.2) return "high";
  return "mid";
}

export function scoreDraftStyle(html: string, traits: ExtendedStyleTraits): StyleScoreResult {
  const plain = htmlToPlainText(html);
  const issues: string[] = [];
  const breakdown: StyleScoreBreakdown = {
    emoji: 1,
    phrases: 1,
    domain: 1,
    fluff: 1,
    color: 1,
    fonts: 1,
  };

  if (!plain.trim()) {
    return {
      score: 0,
      breakdown: { emoji: 0, phrases: 0, domain: 0, fluff: 0, color: 0, fonts: 0 },
      issues: ["본문이 비어 있습니다"],
    };
  }

  const wantEmoji = expectedEmojiBand(traits.emojiUsage);
  const gotEmoji = actualEmojiBand(plain);
  const emojiDist = Math.abs(
    ["none", "low", "mid", "high"].indexOf(wantEmoji) -
      ["none", "low", "mid", "high"].indexOf(gotEmoji),
  );
  breakdown.emoji = clamp01(1 - emojiDist * 0.35);
  if (emojiDist >= 2) {
    issues.push(`이모지 밀도가 학습(${traits.emojiUsage})과 어긋남`);
  }

  const phrases = (traits.commonPhrases || []).filter((p) => p.trim().length >= 2);
  if (phrases.length) {
    const hits = phrases.filter((p) => plain.includes(p)).length;
    breakdown.phrases = clamp01(hits / Math.min(2, phrases.length));
    if (hits === 0) issues.push("학습 상용 표현이 본문에 거의 없음");
  }

  const domain = (traits.domainTerms || []).filter((t) => t.trim().length >= 2);
  if (domain.length) {
    const hits = domain.filter((t) => plain.toLowerCase().includes(t.toLowerCase())).length;
    breakdown.domain = hits >= 1 ? 1 : 0.35;
    if (hits === 0) issues.push("학습 도메인 용어가 본문에 거의 없음");
  }

  const fluff = (traits.bannedFluff || []).filter((f) => f.trim().length >= 2);
  if (fluff.length) {
    const hit = fluff.find((f) => plain.includes(f));
    breakdown.fluff = hit ? 0 : 1;
    if (hit) issues.push(`금지 표현 사용: ${hit}`);
  }

  const colors = [...html.matchAll(/color\s*:\s*(#[0-9a-fA-F]{3,8})/gi)].map((m) =>
    m[1].toUpperCase(),
  );
  const palette = (traits.colorPalette || []).map((c) => c.toUpperCase());
  if (colors.length && palette.length) {
    const ok = colors.filter((c) => palette.includes(c)).length;
    breakdown.color = clamp01(ok / colors.length);
    if (breakdown.color < 0.5) issues.push("강조색이 학습 팔레트와 다름");
  }

  const sizes = [...html.matchAll(/font-size\s*:\s*([\d.]+px)/gi)].map((m) => m[1].toLowerCase());
  const allowed = (traits.fontSizes || []).map((s) => s.toLowerCase());
  if (sizes.length && allowed.length) {
    const ok = sizes.filter((s) => allowed.includes(s)).length;
    breakdown.fonts = clamp01(ok / sizes.length);
    if (breakdown.fonts < 0.4) issues.push("글자 크기가 학습 리듬과 다름");
  }

  const score = clamp01(
    breakdown.emoji * 0.18 +
      breakdown.phrases * 0.18 +
      breakdown.domain * 0.16 +
      breakdown.fluff * 0.22 +
      breakdown.color * 0.13 +
      breakdown.fonts * 0.13,
  );

  return { score, breakdown, issues };
}

export async function repairDraftStyleOnce(input: {
  html: string;
  title?: string;
  traits: ExtendedStyleTraits;
  issues: string[];
  draftProvider?: DraftProvider;
}): Promise<{ body: string; repaired: boolean; tokenUsage?: DraftTokenUsage }> {
  if (!isLlmConfigured()) {
    if (!allowFallback()) throw new Error("LLM_API_KEY가 설정되지 않았습니다.");
    return { body: input.html, repaired: false };
  }

  try {
    const { text, tokenUsage } = await chatCompletion(
      [
        {
          role: "system",
          content: `당신은 한국어 블로그 문체 교정기입니다. JSON만 반환. 키: body(string HTML).
규칙:
- 사실·이미지 URL·구조(h2 순서)는 유지하고 말투·이모지·강조·금지표현만 교정
- 학습 이모지 밀도·색·글자크기·상용 표현을 반영
- bannedFluff 표현 제거
- 마크다운 금지. 허용: p, br, h2, h3, strong, em, ul, li, span, img, div`,
        },
        {
          role: "user",
          content: `제목: ${input.title || "(없음)"}
말투: ${input.traits.tone}
이모지: ${input.traits.emojiUsage}
상용 표현: ${(input.traits.commonPhrases || []).slice(0, 6).join(" / ") || "(없음)"}
도메인 용어: ${(input.traits.domainTerms || []).slice(0, 12).join(", ") || "(없음)"}
금지: ${(input.traits.bannedFluff || []).slice(0, 8).join(" / ") || "(없음)"}
색: ${(input.traits.colorPalette || []).join(", ") || "(없음)"}
글자크기: ${(input.traits.fontSizes || []).join(", ") || "(없음)"}
문제점: ${input.issues.join(" · ") || "(점수 미달)"}

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
    console.warn("[style-score] repair failed:", e);
    return { body: input.html, repaired: false };
  }
}

export async function maybeRepairDraftStyle(input: {
  html: string;
  title?: string;
  traitsJson: unknown;
  threshold?: number;
  draftProvider?: DraftProvider;
}): Promise<{
  body: string;
  score: StyleScoreResult;
  repaired: boolean;
  tokenUsage?: DraftTokenUsage;
}> {
  const traits = normalizeExtendedTraits(input.traitsJson);
  const score = scoreDraftStyle(input.html, traits);
  const threshold = input.threshold ?? DEFAULT_THRESHOLD;
  if (score.score >= threshold || !input.html.trim()) {
    return { body: input.html, score, repaired: false };
  }
  const repaired = await repairDraftStyleOnce({
    html: input.html,
    title: input.title,
    traits,
    issues: score.issues,
    draftProvider: input.draftProvider,
  });
  const after = scoreDraftStyle(repaired.body, traits);
  // Keep repair only if it did not get worse on fluff (banned)
  if (after.breakdown.fluff < score.breakdown.fluff) {
    return { body: input.html, score, repaired: false, tokenUsage: repaired.tokenUsage };
  }
  return {
    body: repaired.body,
    score: after,
    repaired: repaired.repaired,
    tokenUsage: repaired.tokenUsage,
  };
}

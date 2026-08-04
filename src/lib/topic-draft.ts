import { chatCompletion } from "@/lib/llm";
import { allowFallback, isLlmConfigured, llmMaxTokens } from "@/lib/integrations";
import { prepareEditorHtml, SINGLE_IMAGE_STYLE, singleImageTag } from "@/lib/image-style";
import { normalizeExtendedTraits } from "@/lib/style-traits";
import {
  getTopicLengthPreset,
  normalizeTopicLength,
  type TopicLength,
} from "@/lib/topic-length";

export type TopicSection = {
  heading: string;
  bulletPoints: string[];
  imagePrompt: string;
  sceneKeyword: string;
};

export type TopicPlan = {
  title: string;
  titleCandidates: string[];
  sections: TopicSection[];
  disclaimer: string | null;
};

export type TopicDraftResult = {
  title: string;
  titleCandidates: string[];
  body: string;
  meta: { usedFallback: boolean; provider: "llm" | "fallback" };
};

export type TopicImageSlot = {
  imageUrl: string;
  caption: string | null;
  heading: string;
  bulletPoints: string[];
};

/** Plan sections + English image prompts for a topic. */
export async function planTopicDraft(input: {
  topic: string;
  brandName: string;
  imageCount?: number;
  length?: TopicLength | string | null;
  styleSummary?: string | null;
  traitsJson?: unknown;
}): Promise<TopicPlan> {
  const preset = getTopicLengthPreset(input.length);
  const count = Math.min(
    6,
    Math.max(1, Math.floor(input.imageCount ?? preset.sectionCount) || preset.sectionCount),
  );
  const traits = normalizeExtendedTraits(input.traitsJson);

  if (!isLlmConfigured()) {
    if (!allowFallback()) throw new Error("LLM_API_KEY가 설정되지 않았습니다.");
    return fallbackTopicPlan(input.topic, count, preset.bulletMin);
  }

  try {
    const { text } = await chatCompletion(
      [
        {
          role: "system",
          content: `당신은 한국어 블로그 기획자입니다. JSON만 반환.
키: title(string), titleCandidates(string[] 3개), disclaimer(string|null), sections(array 길이 정확히 ${count}).
각 section: heading(string), bulletPoints(string[] ${preset.bulletMin}~${preset.bulletMax}개, 구체적·중복 금지), sceneKeyword(한국어 짧은 장면 키워드), imagePrompt(영어, 블로그용 일러스트/인포그래픽 스타일 이미지 프롬프트, 텍스트·워터마크·실존 인물 얼굴 과다 금지).
목표 분량: ${preset.label} (${preset.targetChars.min}~${preset.targetChars.max}자 분량의 글을 쓸 수 있게 섹션·포인트를 충분히 촘촘히).
금융·투자·의료·법률 주제면 disclaimer에 한 줄 면책(예: 투자 조언이 아님)을 넣고, 아니면 null.
과장·허위 수치·출처 없는 단정 금지. 설명형·읽기 쉬운 구성.`,
        },
        {
          role: "user",
          content: `주제: ${input.topic}
브랜드/채널: ${input.brandName}
문체 힌트: ${input.styleSummary?.trim() || "(기본 친근 설명 톤)"}
톤: ${traits.tone}
글 길이: ${preset.label} — ${preset.hint}
섹션 수(=이미지 수): ${count}
섹션당 포인트: ${preset.bulletMin}~${preset.bulletMax}개`,
        },
      ],
      {
        json: true,
        temperature: 0.5,
        maxTokens: Math.min(Math.max(llmMaxTokens(), preset.planMaxTokens), preset.planMaxTokens),
      },
    );
    const parsed = JSON.parse(text) as Partial<TopicPlan>;
    return normalizeTopicPlan(parsed, input.topic, count, preset.bulletMax);
  } catch (error) {
    if (!allowFallback()) throw error;
    console.warn("[topic-plan] failed, using fallback:", error);
    return fallbackTopicPlan(input.topic, count, preset.bulletMin);
  }
}

/** Write TipTap HTML for a topic article with optional AI images. */
export async function generateTopicBlogDraft(input: {
  topic: string;
  brandName: string;
  plan: TopicPlan;
  slots: TopicImageSlot[];
  length?: TopicLength | string | null;
  styleSummary?: string | null;
  traitsJson?: unknown;
}): Promise<TopicDraftResult> {
  const traits = normalizeExtendedTraits(input.traitsJson);
  const preset = getTopicLengthPreset(input.length);
  const lengthId = normalizeTopicLength(input.length);

  if (!isLlmConfigured()) {
    if (!allowFallback()) throw new Error("LLM_API_KEY가 설정되지 않았습니다.");
    return {
      ...fallbackTopicBody(input),
      meta: { usedFallback: true, provider: "fallback" },
    };
  }

  const slotLines = input.slots
    .map((s, i) => {
      const bullets = s.bulletPoints.map((b) => `  - ${b}`).join("\n");
      return `${i + 1}. 소제목: ${s.heading}
장면키워드: ${s.caption || s.heading}
이미지URL: ${s.imageUrl || "(없음 — 이 섹션은 텍스트만)"}
포인트:
${bullets || "  - (없음)"}`;
    })
    .join("\n\n");

  try {
    const { text } = await chatCompletion(
      [
        {
          role: "system",
          content: `당신은 한국어 블로그 작가입니다. JSON만 반환. 키: title, titleCandidates(string[]), body(HTML).
규칙:
1) HTML만 (마크다운 금지). 허용: p, br, h2, h3, strong, em, ul, li, span, img
2) 설명형·읽기 쉬운 톤. 시공/작업기 말투 금지. "다음에도 유익한 정보로 돌아오겠습니다" 류 상투 문구 금지.
3) 제공된 이미지 URL만 사용. 임의 URL 금지. URL이 "(없음)"이면 해당 섹션은 텍스트만.
4) 이미지: <p><img src="URL" alt="장면키워드" style="${SINGLE_IMAGE_STYLE}" /></p>
5) 스톡/AI 이미지는 분위기·설명 보조. "실제 촬영/공식 자료"처럼 단정하지 말 것.
6) 수치·사실은 과장하지 말 것. disclaimer가 있으면 도입 또는 마무리에 한 줄 포함.
7) 이모지·<strong>·색 span을 적당히 사용. 밋밋한 plain만 쓰지 말 것.
8) 구조: 도입(2~3문단) → 각 섹션(h2 + ${preset.paragraphsPerSection} + 이미지) → 실용 팁/요약 → 마무리.
9) 분량(필수): ${preset.label}. 본문 순수 텍스트 기준 약 ${preset.targetChars.min}~${preset.targetChars.max}자.
   짧게 요약만 쓰지 마세요. 각 섹션 포인트를 문장으로 충분히 풀어 쓰세요.
   ${lengthId === "long" ? "구체 예시, 왜 그런지, 실생활 적용을 넣으세요." : ""}
   ${lengthId === "short" ? "핵심만 간결히. 군더더기 금지." : ""}`,
        },
        {
          role: "user",
          content: `주제: ${input.topic}
브랜드: ${input.brandName}
가제: ${input.plan.title}
면책: ${input.plan.disclaimer || "(없음)"}
글 길이 목표: ${preset.label} (${preset.targetChars.min}~${preset.targetChars.max}자)
문체 요약: ${input.styleSummary?.trim() || traits.tone}
편집 힌트: tone=${traits.tone}, opener=${traits.openerStyle}, closer=${traits.closerStyle}
색 예시: ${(traits.colorPalette || []).join(", ") || "#0B7285"}

섹션·이미지:
${slotLines}

요청: 위 섹션 순서로 본문을 쓰고, 이미지 URL이 있는 섹션에는 이미지를 넣으세요. 목표 분량을 맞추세요.`,
        },
      ],
      {
        json: true,
        temperature: 0.55,
        maxTokens: Math.max(llmMaxTokens(), preset.draftMaxTokens),
      },
    );
    const parsed = JSON.parse(text) as Partial<TopicDraftResult>;
    const title =
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : input.plan.title;
    const titleCandidates = Array.isArray(parsed.titleCandidates)
      ? parsed.titleCandidates.filter((t): t is string => typeof t === "string").slice(0, 5)
      : input.plan.titleCandidates;
    const rawBody =
      typeof parsed.body === "string" && parsed.body.trim()
        ? parsed.body.trim()
        : fallbackTopicBody(input).body;
    return {
      title,
      titleCandidates: titleCandidates.length ? titleCandidates : [title],
      body: prepareEditorHtml(unwrapHtml(rawBody)),
      meta: { usedFallback: false, provider: "llm" },
    };
  } catch (error) {
    if (!allowFallback()) throw error;
    console.warn("[topic-draft] failed, using fallback:", error);
    return {
      ...fallbackTopicBody(input),
      meta: { usedFallback: true, provider: "fallback" },
    };
  }
}

function normalizeTopicPlan(
  raw: Partial<TopicPlan>,
  topic: string,
  count: number,
  bulletMax: number,
): TopicPlan {
  const sectionsIn = Array.isArray(raw.sections) ? raw.sections : [];
  const sections: TopicSection[] = [];
  for (let i = 0; i < count; i++) {
    const s = sectionsIn[i] as Partial<TopicSection> | undefined;
    const heading =
      typeof s?.heading === "string" && s.heading.trim()
        ? s.heading.trim()
        : `${topic} 포인트 ${i + 1}`;
    const bulletPoints = Array.isArray(s?.bulletPoints)
      ? s!.bulletPoints
          .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
          .slice(0, bulletMax)
      : [`${heading} 핵심 설명`, `${heading} 보충 설명`];
    const sceneKeyword =
      typeof s?.sceneKeyword === "string" && s.sceneKeyword.trim()
        ? s.sceneKeyword.trim()
        : heading;
    const imagePrompt =
      typeof s?.imagePrompt === "string" && s.imagePrompt.trim()
        ? s.imagePrompt.trim()
        : `Clean editorial blog illustration about ${topic}, section ${i + 1}, no text, no watermark`;
    sections.push({ heading, bulletPoints, sceneKeyword, imagePrompt });
  }
  const title =
    typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : topic;
  const titleCandidates = Array.isArray(raw.titleCandidates)
    ? raw.titleCandidates.filter((t): t is string => typeof t === "string").slice(0, 5)
    : [title, `${topic} 정리`, `${topic} 핵심 포인트`];
  const disclaimer =
    typeof raw.disclaimer === "string" && raw.disclaimer.trim()
      ? raw.disclaimer.trim()
      : null;
  return { title, titleCandidates, sections, disclaimer };
}

function fallbackTopicPlan(topic: string, count: number, bulletMin: number): TopicPlan {
  const sections: TopicSection[] = Array.from({ length: count }, (_, i) => ({
    heading: `${topic} — 포인트 ${i + 1}`,
    bulletPoints: Array.from(
      { length: Math.max(2, bulletMin) },
      (_, j) => `${topic} 관련 설명 ${i + 1}-${j + 1}`,
    ),
    sceneKeyword: `참고 이미지 · ${topic} ${i + 1}`,
    imagePrompt: `Simple modern editorial illustration for a blog about "${topic}", concept ${i + 1}, flat design, no text, no watermark`,
  }));
  return {
    title: topic,
    titleCandidates: [topic, `${topic} 정리`, `${topic} 핵심 포인트`],
    sections,
    disclaimer: /주가|투자|주식|코인|의료|법률|폭염|건강/.test(topic)
      ? "본 글은 일반 정보 안내용이며 전문 조언이 아닙니다."
      : null,
  };
}

function fallbackTopicBody(input: {
  topic: string;
  brandName: string;
  plan: TopicPlan;
  slots: TopicImageSlot[];
}): Omit<TopicDraftResult, "meta"> {
  const accent = "#0B7285";
  const parts = [
    `<p><span style="font-size:18px;color:${accent}"><strong>${input.plan.title}</strong></span></p>`,
    `<p>${input.topic}에 대해 핵심을 정리했습니다.</p>`,
  ];
  if (input.plan.disclaimer) {
    parts.push(`<p><em>${input.plan.disclaimer}</em></p>`);
  }
  for (const slot of input.slots) {
    parts.push(
      `<h2><span style="font-size:22px;color:${accent}">${escapeHtml(slot.heading)}</span></h2>`,
    );
    for (const b of slot.bulletPoints) {
      parts.push(`<p>${escapeHtml(b)}</p>`);
    }
    if (slot.imageUrl) {
      const alt = (slot.caption || slot.heading).replace(/"/g, "");
      parts.push(`<p>${singleImageTag(slot.imageUrl, alt)}</p>`);
      parts.push(`<p><span style="font-size:13px;color:#71717a">${escapeHtml(slot.caption || "참고 이미지")}</span></p>`);
    }
  }
  parts.push(`<p>${escapeHtml(input.brandName)}에서 전하는 정리였습니다.</p>`);
  return {
    title: input.plan.title,
    titleCandidates: input.plan.titleCandidates,
    body: prepareEditorHtml(parts.join("\n")),
  };
}

function unwrapHtml(body: string) {
  return body
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

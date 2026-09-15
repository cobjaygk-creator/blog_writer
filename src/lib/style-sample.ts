import { isLlmConfigured } from "@/lib/integrations";
import { chatCompletion } from "@/lib/llm";
import type { ExtendedStyleTraits } from "@/lib/style-traits";

/**
 * One freshly *generated* paragraph in the learned voice — for the onboarding
 * "이 말투로 쓰면 이런 문장이 나옵니다" card. Must not be a hardcoded literal;
 * when the LLM is unreachable we fall back to a real learned anchor excerpt
 * instead (still the user's own data, never invented copy).
 */
export async function generateStyleSample(input: {
  traits: ExtendedStyleTraits;
  summaryText: string;
  sampleAnchors: Array<{ excerpt: string }>;
}): Promise<{ text: string; usedFallback: boolean }> {
  const topicHint =
    input.traits.productMentions?.[0] ||
    input.traits.domainTerms?.[0] ||
    input.traits.commonPhrases?.[0] ||
    "오늘 진행한 작업";

  if (!isLlmConfigured()) {
    return { text: fallbackSample(input), usedFallback: true };
  }

  try {
    const { text } = await chatCompletion(
      [
        {
          role: "system",
          content:
            "당신은 사용자의 블로그 말투를 학습해 새 문단을 쓰는 에디터입니다. 따옴표나 설명 없이 본문 문단만 출력하세요.",
        },
        {
          role: "user",
          content: `다음 말투 특징을 반영해 "${topicHint}"에 관한 2~3문장짜리 예시 문단을 새로 쓰세요. 실제 블로그 도입부처럼 자연스러워야 합니다.

말투 요약: ${input.summaryText || "정보 없음"}
문장 길이: ${input.traits.sentenceLength}
맺음말 습관: ${input.traits.closerStyle}
자주 쓰는 표현: ${(input.traits.commonPhrases || []).join(", ") || "없음"}`,
        },
      ],
      { temperature: 0.6, maxTokens: 220 },
    );
    const trimmed = text.trim().replace(/^["'“]|["'”]$/g, "");
    if (trimmed.length >= 20) return { text: trimmed, usedFallback: false };
    return { text: fallbackSample(input), usedFallback: true };
  } catch {
    return { text: fallbackSample(input), usedFallback: true };
  }
}

function fallbackSample(input: { sampleAnchors: Array<{ excerpt: string }> }): string {
  const anchor = input.sampleAnchors[0]?.excerpt?.trim();
  if (anchor) {
    return anchor.length > 220 ? `${anchor.slice(0, 220)}…` : anchor;
  }
  return "등록한 원문에서 예시를 아직 찾지 못했습니다. 원문을 조금 더 등록해 주세요.";
}

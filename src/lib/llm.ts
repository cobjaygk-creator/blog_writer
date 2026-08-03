import {
  allowFallback,
  fetchWithTimeout,
  isLlmConfigured,
  llmMaxTokens,
  llmTimeoutMs,
} from "@/lib/integrations";
import {
  buildImageAwareFallbackBody,
  ensureImagesInMarkdown,
  imageMarkdown,
  type PublishImageInput,
} from "@/lib/publish-body";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatResult = {
  text: string;
  usedFallback: boolean;
};

function getLlmConfig() {
  return {
    apiKey: process.env.LLM_API_KEY?.trim() || "",
    baseUrl: (process.env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.LLM_MODEL?.trim() || "gpt-4o-mini",
  };
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { temperature?: number; json?: boolean; maxTokens?: number },
): Promise<ChatResult> {
  const { apiKey, baseUrl, model } = getLlmConfig();

  if (!apiKey) {
    if (!allowFallback()) {
      throw new Error("LLM_API_KEY가 설정되지 않았습니다.");
    }
    return { text: "", usedFallback: true };
  }

  const response = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: options?.temperature ?? 0.4,
        max_tokens: options?.maxTokens ?? llmMaxTokens(),
        response_format: options?.json ? { type: "json_object" } : undefined,
        messages,
      }),
    },
    llmTimeoutMs(),
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LLM 요청 실패 (${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    throw new Error("LLM 응답이 비어 있습니다.");
  }
  return { text, usedFallback: false };
}

async function withProviderFallback<T>(
  live: () => Promise<T>,
  fallback: () => T,
  label: string,
): Promise<{ result: T; usedFallback: boolean; provider: "llm" | "fallback" }> {
  if (!isLlmConfigured()) {
    if (!allowFallback()) {
      throw new Error("LLM_API_KEY가 설정되지 않았습니다.");
    }
    return { result: fallback(), usedFallback: true, provider: "fallback" };
  }

  try {
    const result = await live();
    return { result, usedFallback: false, provider: "llm" };
  } catch (error) {
    if (!allowFallback()) {
      throw error;
    }
    console.warn(`[${label}] provider failed, using fallback:`, error);
    return { result: fallback(), usedFallback: true, provider: "fallback" };
  }
}

export type StyleLearnResult = {
  summaryText: string;
  sampleAnchors: Array<{ excerpt: string; sourcePostId: string }>;
  traitsJson: {
    tone: string;
    sentenceLength: string;
    commonPhrases: string[];
    structureNotes: string;
  };
  meta: {
    usedFallback: boolean;
    provider: "llm" | "fallback";
  };
};

export async function learnStyleFromSources(
  sources: Array<{ id: string; rawText: string }>,
): Promise<StyleLearnResult> {
  const joined = sources
    .map((s, i) => `[원문 ${i + 1} id=${s.id}]\n${s.rawText.slice(0, 4000)}`)
    .join("\n\n");

  const { result, usedFallback, provider } = await withProviderFallback(
    async () => {
      const { text } = await chatCompletion(
        [
          {
            role: "system",
            content:
              "당신은 한국어 블로그 문체 분석가입니다. 반드시 JSON만 반환하세요. 키: summaryText(string), sampleAnchors(array of {excerpt, sourcePostId}), traitsJson({tone, sentenceLength, commonPhrases:string[], structureNotes}).",
          },
          {
            role: "user",
            content: `다음 원문들을 분석해 재사용 가능한 문체 프로필을 만드세요.\n\n${joined}`,
          },
        ],
        { json: true, temperature: 0.3, maxTokens: Math.min(llmMaxTokens(), 1800) },
      );
      try {
        return normalizeStyleLearn(JSON.parse(text) as Partial<StyleLearnResult>, sources);
      } catch {
        throw new Error("LLM 스타일 JSON 파싱에 실패했습니다.");
      }
    },
    () => normalizeStyleLearn({}, sources),
    "style-learn",
  );

  return { ...result, meta: { usedFallback, provider } };
}

function normalizeStyleLearn(
  parsed: Partial<StyleLearnResult>,
  sources: Array<{ id: string; rawText: string }>,
): Omit<StyleLearnResult, "meta"> {
  const fallback = fallbackStyleLearn(sources);
  return {
    summaryText:
      typeof parsed.summaryText === "string" && parsed.summaryText.trim()
        ? parsed.summaryText.trim()
        : fallback.summaryText,
    sampleAnchors: Array.isArray(parsed.sampleAnchors)
      ? parsed.sampleAnchors
          .filter(
            (a): a is { excerpt: string; sourcePostId: string } =>
              Boolean(a && typeof a.excerpt === "string" && typeof a.sourcePostId === "string"),
          )
          .slice(0, 5)
      : fallback.sampleAnchors,
    traitsJson: {
      tone: parsed.traitsJson?.tone || fallback.traitsJson.tone,
      sentenceLength: parsed.traitsJson?.sentenceLength || fallback.traitsJson.sentenceLength,
      commonPhrases: Array.isArray(parsed.traitsJson?.commonPhrases)
        ? parsed.traitsJson.commonPhrases.filter((p): p is string => typeof p === "string").slice(0, 8)
        : fallback.traitsJson.commonPhrases,
      structureNotes: parsed.traitsJson?.structureNotes || fallback.traitsJson.structureNotes,
    },
  };
}

function fallbackStyleLearn(sources: Array<{ id: string; rawText: string }>): Omit<StyleLearnResult, "meta"> {
  const texts = sources.map((s) => s.rawText.trim()).filter(Boolean);
  const avgLen =
    texts.reduce((sum, t) => sum + t.split(/[.!?。！？\n]/).filter(Boolean).length, 0) /
    Math.max(texts.length, 1);

  const sampleAnchors = sources.slice(0, 3).map((s) => ({
    sourcePostId: s.id,
    excerpt: s.rawText.replace(/\s+/g, " ").trim().slice(0, 180),
  }));

  const phrases = Array.from(
    new Set(
      texts
        .flatMap((t) => t.match(/[가-힣]{2,8}/g) ?? [])
        .filter((w) => w.length >= 2)
        .slice(0, 40),
    ),
  ).slice(0, 6);

  return {
    summaryText: `총 ${sources.length}편의 원문을 바탕으로 한 로컬 문체 요약입니다. 문장은 ${
      avgLen > 8 ? "비교적 길고 설명형" : "짧고 직설적"
    }이며, 친근한 안내 톤을 유지합니다. (로컬 폴백)`,
    sampleAnchors,
    traitsJson: {
      tone: "친근하고 실용적인 안내 톤",
      sentenceLength: avgLen > 8 ? "중장문 위주" : "짧은 문장 위주",
      commonPhrases: phrases,
      structureNotes: "도입 → 핵심 포인트 → 마무리 추천 순서를 선호",
    },
  };
}

export type DraftGenerateResult = {
  title: string;
  titleCandidates: string[];
  body: string;
  meta: {
    usedFallback: boolean;
    provider: "llm" | "fallback";
  };
};

export async function generateBlogDraft(input: {
  brandName: string;
  keyword: string;
  styleSummary: string;
  traitsJson: unknown;
  sampleAnchors: Array<{ excerpt: string }>;
  images: PublishImageInput[];
}): Promise<DraftGenerateResult> {
  const anchors = input.sampleAnchors
    .map((a, i) => `${i + 1}. ${a.excerpt}`)
    .join("\n");
  const imageLines =
    input.images.length > 0
      ? input.images
          .map((img, i) => `${i + 1}. ${imageMarkdown(img, i)}  (캡션: ${img.caption || "없음"})`)
          .join("\n")
      : "(없음)";

  const { result, usedFallback, provider } = await withProviderFallback(
    async () => {
      const { text } = await chatCompletion(
        [
          {
            role: "system",
            content:
              "당신은 한국어 블로그 작가입니다. JSON만 반환하세요. 키: title(string), titleCandidates(string[] 3개), body(string, 마크다운). body에는 제공된 이미지 마크다운(![캡션](URL))을 URL 그대로 본문 중간에 삽입하세요. URL을 바꾸거나 생략하지 마세요.",
          },
          {
            role: "user",
            content: `업체: ${input.brandName}
키워드: ${input.keyword}
문체 요약: ${input.styleSummary}
문체 특성: ${JSON.stringify(input.traitsJson)}
문체 샘플:
${anchors || "(없음)"}
사진 (아래 마크다운을 본문에 순서대로 삽입):
${imageLines}

요청: 위 문체를 모방해 블로그 초안을 작성하세요. 각 사진 마크다운은 관련 문단 바로 위/아래에 넣으세요.`,
          },
        ],
        { json: true, temperature: 0.6, maxTokens: llmMaxTokens() },
      );
      try {
        const parsed = JSON.parse(text) as Partial<DraftGenerateResult>;
        const title =
          typeof parsed.title === "string" && parsed.title.trim()
            ? parsed.title.trim()
            : `${input.keyword} 가이드`;
        const titleCandidates = Array.isArray(parsed.titleCandidates)
          ? parsed.titleCandidates.filter((t): t is string => typeof t === "string").slice(0, 5)
          : [title];
        const rawBody =
          typeof parsed.body === "string" && parsed.body.trim()
            ? parsed.body.trim()
            : fallbackDraft(input).body;
        return {
          title,
          titleCandidates: titleCandidates.length ? titleCandidates : [title],
          body: ensureImagesInMarkdown(rawBody, input.images),
        };
      } catch {
        throw new Error("LLM 초안 JSON 파싱에 실패했습니다.");
      }
    },
    () => fallbackDraft(input),
    "draft-generate",
  );

  return {
    ...result,
    body: ensureImagesInMarkdown(result.body, input.images),
    meta: { usedFallback, provider },
  };
}

function fallbackDraft(input: {
  brandName: string;
  keyword: string;
  styleSummary: string;
  images: PublishImageInput[];
}): Omit<DraftGenerateResult, "meta"> {
  const title = `${input.keyword} — ${input.brandName} 이야기`;
  const body = buildImageAwareFallbackBody({
    title,
    keyword: input.keyword,
    brandName: input.brandName,
    styleSummary: input.styleSummary,
    images: input.images,
  });

  return {
    title,
    titleCandidates: [title, `${input.keyword} 추천 정리`, `${input.brandName}이 전하는 ${input.keyword}`],
    body,
  };
}

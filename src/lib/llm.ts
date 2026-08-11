import {
  allowFallback,
  fetchWithTimeout,
  isLlmConfigured,
  llmMaxTokens,
  llmTimeoutMs,
} from "@/lib/integrations";
import { buildGroupedImagesHtml } from "@/lib/image-group";
import { prepareEditorHtml, SINGLE_IMAGE_STYLE, singleImageTag } from "@/lib/image-style";
import { type PublishImageInput } from "@/lib/publish-body";
import {
  analyzeSourceFormatting,
  normalizeExtendedTraits,
  normalizeTraitsJson,
  stripStyleMarkers,
  type StyleTraits,
} from "@/lib/style-traits";
import {
  chatCompletionWithProvider,
  type DraftProvider,
  type DraftTokenUsage,
  getDraftProviderConfig,
  isDraftProviderConfigured,
} from "@/lib/llm-providers";
import { applyHeliconeBaseUrl, recordLlmTrace } from "@/lib/llm-trace";
import { getTopicLengthPreset, type TopicLength } from "@/lib/topic-length";
import {
  TYPE_SIZE_BODY,
  TYPE_SIZE_EMPHASIS,
  TYPE_SIZE_HEADING,
} from "@/lib/typography-rhythm";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatResult = {
  text: string;
  usedFallback: boolean;
  tokenUsage?: DraftTokenUsage;
  modelId?: string;
};

function getLlmConfig() {
  // Prefer LLM_GPT_*; fall back to legacy LLM_* for style-learn and other single-provider calls
  const gpt = getDraftProviderConfig("gpt");
  return {
    apiKey: gpt.apiKey,
    baseUrl: gpt.baseUrl,
    model: gpt.model,
  };
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    json?: boolean;
    maxTokens?: number;
    draftProvider?: DraftProvider;
  },
): Promise<ChatResult> {
  const provider = options?.draftProvider || "gpt";

  if (!(await isDraftProviderConfigured(provider)) && !getLlmConfig().apiKey) {
    if (!allowFallback()) {
      throw new Error("LLM API 키가 설정되지 않았습니다.");
    }
    return { text: "", usedFallback: true, modelId: getDraftProviderConfig(provider).model };
  }

  // Style-learn / generic calls: use gpt config (legacy LLM_* supported)
  if (!options?.draftProvider) {
    const { apiKey, baseUrl, model } = getLlmConfig();
    if (!apiKey) {
      if (!allowFallback()) {
        throw new Error("LLM_API_KEY가 설정되지 않았습니다.");
      }
      return { text: "", usedFallback: true, modelId: model };
    }
    const started = Date.now();
    const helicone = applyHeliconeBaseUrl(baseUrl);
    const messageChars = messages.reduce((n, m) => n + (m.content?.length || 0), 0);
    const response = await fetchWithTimeout(
      `${helicone.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...helicone.headers,
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
      recordLlmTrace({
        provider: "gpt",
        model,
        ok: false,
        latencyMs: Date.now() - started,
        messageChars,
        helicone: helicone.enabled,
        error: `http_${response.status}`,
      });
      throw new Error(`LLM 요청 실패 (${response.status}): ${detail.slice(0, 200)}`);
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      recordLlmTrace({
        provider: "gpt",
        model,
        ok: false,
        latencyMs: Date.now() - started,
        messageChars,
        helicone: helicone.enabled,
        error: "empty_response",
      });
      throw new Error("LLM 응답이 비어 있습니다.");
    }
    const tokenUsage =
      typeof data.usage?.prompt_tokens === "number" ||
      typeof data.usage?.completion_tokens === "number"
        ? {
            input: Number(data.usage?.prompt_tokens || 0),
            output: Number(data.usage?.completion_tokens || 0),
          }
        : undefined;
    recordLlmTrace({
      provider: "gpt",
      model,
      ok: true,
      latencyMs: Date.now() - started,
      inputTokens: tokenUsage?.input,
      outputTokens: tokenUsage?.output,
      messageChars,
      helicone: helicone.enabled,
    });
    return {
      text,
      usedFallback: false,
      modelId: model,
      tokenUsage,
    };
  }

  const result = await chatCompletionWithProvider(provider, messages, options);
  return {
    text: result.text,
    usedFallback: result.usedFallback,
    modelId: result.modelId,
    tokenUsage: result.tokenUsage,
  };
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
  traitsJson: StyleTraits;
  meta: {
    usedFallback: boolean;
    provider: "llm" | "fallback";
  };
};

const STYLE_TONE_CHOICES = [
  "친근하고 실용적인 안내 톤",
  "전문적이고 신뢰감 있는 톤",
  "담백하고 사실 위주의 톤",
  "감성적이고 따뜻한 톤",
  "밝고 활기찬 홍보 톤",
  "짧고 핵심만 전하는 톤",
] as const;

const STYLE_LEARN_SYSTEM = `당신은 한국어 블로그(네이버/티스토리) 문체·편집 스타일 분석가입니다.
반드시 JSON만 반환하세요. 같은 원문이면 가능한 한 같은 결과를 내세요.

키:
- summaryText(string): 문체+편집 습관을 4~7문장으로 요약. 줄바꿈 리듬, 이모지, 강조색, 글자 크기 습관을 반드시 포함
- sampleAnchors(array of {excerpt, sourcePostId}): 원문 리듬이 잘 드러나는 발췌 3~5개. 줄바꿈과 이모지를 최대한 유지(최대 350자)
- traitsJson(object):
  - tone: 아래 목록 중 하나만 정확히 선택 → ${STYLE_TONE_CHOICES.map((t) => `"${t}"`).join(" | ")}
  - sentenceLength, commonPhrases(string[]), structureNotes
  - emojiUsage(string), frequentEmojis(string[] 최대 8)
  - lineBreakStyle(string): 짧은 문단/빈 줄/한 줄 호흡 등
  - emphasisStyle(string): 굵게·색상·크기 강조 방식
  - colorPalette(string[] hex, 최대 6): 원문에 [style color=#...]가 있으면 우선 반영
  - fontSizes(string[] 예: "15px","18px","22px")
  - openerStyle, closerStyle

원문의 [style color=#.. size=..] 마커는 실제 블로그 서식 힌트입니다.`;

export async function learnStyleFromSources(
  sources: Array<{ id: string; rawText: string }>,
): Promise<StyleLearnResult> {
  const joined = sources
    .map((s, i) => `[원문 ${i + 1} id=${s.id}]\n${s.rawText.slice(0, 5000)}`)
    .join("\n\n");

  const { result, usedFallback, provider } = await withProviderFallback(
    async () => {
      const { text } = await chatCompletion(
        [
          { role: "system", content: STYLE_LEARN_SYSTEM },
          {
            role: "user",
            content: `다음 원문들을 분석해 재사용 가능한 문체·편집 프로필을 만드세요. 밋밋한 톤 요약이 아니라, 실제 글을 다시 쓸 때 바로 쓸 수 있는 편집 가이드로 작성하세요.\n\n${joined}`,
          },
        ],
        // Deterministic-ish: re-learn should not rewrite the profile with random phrasing.
        { json: true, temperature: 0, maxTokens: Math.min(llmMaxTokens(), 2200) },
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
  const texts = sources.map((s) => s.rawText);
  const rawTraits =
    parsed.traitsJson && typeof parsed.traitsJson === "object"
      ? (parsed.traitsJson as Record<string, unknown>)
      : {};
  const snappedTone =
    typeof rawTraits.tone === "string" ? snapStyleTone(rawTraits.tone) : undefined;
  const traitsJson = normalizeTraitsJson(
    {
      ...fallback.traitsJson,
      ...rawTraits,
      ...(snappedTone ? { tone: snappedTone } : {}),
    },
    texts,
  );

  const sampleAnchors = Array.isArray(parsed.sampleAnchors)
    ? parsed.sampleAnchors
        .filter(
          (a): a is { excerpt: string; sourcePostId: string } =>
            Boolean(a && typeof a.excerpt === "string" && typeof a.sourcePostId === "string"),
        )
        .map((a) => ({
          sourcePostId: a.sourcePostId,
          excerpt: a.excerpt.replace(/\r\n/g, "\n").trim().slice(0, 400),
        }))
        .slice(0, 5)
    : fallback.sampleAnchors;

  return {
    summaryText:
      typeof parsed.summaryText === "string" && parsed.summaryText.trim()
        ? parsed.summaryText.trim()
        : fallback.summaryText,
    sampleAnchors: sampleAnchors.length ? sampleAnchors : fallback.sampleAnchors,
    traitsJson,
  };
}

function snapStyleTone(tone: string): string {
  const trimmed = tone.trim();
  if ((STYLE_TONE_CHOICES as readonly string[]).includes(trimmed)) return trimmed;

  const scored = STYLE_TONE_CHOICES.map((choice) => {
    const keywords = choice.replace(/\s*톤$/, "").split(/\s+/).filter((w) => w.length >= 2);
    const hits = keywords.filter((w) => trimmed.includes(w)).length;
    return { choice, hits };
  }).sort((a, b) => b.hits - a.hits);

  return scored[0]?.hits ? scored[0].choice : STYLE_TONE_CHOICES[0];
}

function fallbackStyleLearn(sources: Array<{ id: string; rawText: string }>): Omit<StyleLearnResult, "meta"> {
  const texts = sources.map((s) => s.rawText.trim()).filter(Boolean);
  const heuristic = analyzeSourceFormatting(texts);
  const traits = normalizeTraitsJson(heuristic, texts);

  const sampleAnchors = sources.slice(0, 3).map((s) => ({
    sourcePostId: s.id,
    excerpt: s.rawText.replace(/\r\n/g, "\n").trim().slice(0, 350),
  }));

  const phrases = Array.from(
    new Set(
      texts
        .flatMap((t) => stripStyleMarkers(t).match(/[가-힣]{2,8}/g) ?? [])
        .filter((w) => w.length >= 2)
        .slice(0, 40),
    ),
  ).slice(0, 6);

  traits.commonPhrases = phrases;

  return {
    summaryText: `총 ${sources.length}편의 원문을 바탕으로 한 문체·편집 요약입니다. ${traits.tone}. 문장은 ${traits.sentenceLength}이며, ${traits.lineBreakStyle}. 이모지는 ${traits.emojiUsage}. 강조는 ${traits.emphasisStyle}.`,
    sampleAnchors,
    traitsJson: traits,
  };
}

export type DraftGenerateResult = {
  title: string;
  titleCandidates: string[];
  body: string;
  meta: {
    usedFallback: boolean;
    provider: "llm" | "fallback";
    draftProvider?: DraftProvider;
    modelId?: string;
    tokenUsage?: DraftTokenUsage;
  };
};

function resolveDraftTypeSizes(fontSizes: string[] | undefined) {
  const parsed = (fontSizes || [])
    .map((s) => {
      const n = Number.parseFloat(String(s).replace(/px/i, ""));
      return Number.isFinite(n) ? n : NaN;
    })
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (parsed.length >= 3) {
    return {
      body: `${parsed[0]}px`,
      emphasis: `${parsed[Math.floor(parsed.length / 2)]}px`,
      heading: `${parsed[parsed.length - 1]}px`,
    };
  }
  if (parsed.length === 2) {
    return { body: `${parsed[0]}px`, emphasis: `${parsed[1]}px`, heading: `${parsed[1]}px` };
  }
  if (parsed.length === 1) {
    return {
      body: TYPE_SIZE_BODY,
      emphasis: `${parsed[0]}px`,
      heading: TYPE_SIZE_HEADING,
    };
  }
  return { body: TYPE_SIZE_BODY, emphasis: TYPE_SIZE_EMPHASIS, heading: TYPE_SIZE_HEADING };
}

function emojiDensityGuidance(emojiUsage: string) {
  if (/거의\s*없음|없음|none/i.test(emojiUsage)) {
    return `3) 이모지: 학습 프로필이 "${emojiUsage}"이므로 이모지를 거의 쓰지 마세요. 제목·마무리에 많아도 1개. 강제 삽입 금지.`;
  }
  if (/적음|적게|낮/i.test(emojiUsage)) {
    return `3) 이모지: 학습 프로필이 "${emojiUsage}" — 도입/마무리·핵심 소제목에만 드물게 사용. frequentEmojis 우선. 2~3문단마다 강제하지 말 것.`;
  }
  if (/많음|자주|frequent/i.test(emojiUsage)) {
    return `3) 이모지 적극 사용:
   - frequentEmojis를 우선. 없으면 시공/자동차 맥락 이모지(🔧✨👍🚗📦✅🙏)
   - 제목·h2/h3·도입·마무리 CTA·사진 직후 문장에 이모지
   - 2~3문단마다 최소 1개`;
  }
  return `3) 이모지 적절히 사용(학습: ${emojiUsage}):
   - frequentEmojis 우선. 없으면 🔧✨👍🚗📦✅🙏
   - 소제목·포인트에 자연스럽게. 밋밋한 plain만 이어지지 않게`;
}

function buildDraftSystem(opts: {
  hasImages: boolean;
  emojiUsage: string;
  bodySize: string;
  emphasisSize: string;
  headingSize: string;
}) {
  const imageRules = opts.hasImages
    ? `6) 사진은 반드시 제공 URL 그대로 사용(변경·생략 금지). 배치 규칙은 아래 "사진 배치"를 절대적으로 따릅니다.
   - [단독] 슬롯: 세로로 하나씩 <p><img src="URL" alt="장면키워드" style="${SINGLE_IMAGE_STYLE}" /></p>
   - [묶음] 슬롯만 image-group 사용
   - 사용자가 묶지 않은 사진을 임의로 묶지 마세요.
7) 장면 키워드 → 문장체 확장(최우선):
   - 키워드를 복붙하지 말고 말투로 충분히 풀어 쓰세요. 없는 스펙은 제품 팩트/웹 리서치로만 보강.
   - 단락마다: (도입 1문장+이모지) → 이미지 → (설명 2~3문장). 빈 <p> 금지.
   - 사진 뒤 설명은 한 줄로 끝내지 마세요. 무엇을/왜 확인·작업했는지, 결과·포인트까지 구체적으로.
8) 시공/제품 흐름: 짧은 도입 → 포인트 → 사진별 설명 → CTA. 라이프스타일 감성 소개문 금지`
    : `6) 사진이 없습니다. img 태그를 넣지 마세요. 임의 이미지 URL 금지.
7) 텍스트 전용 구성(필수):
   - 도입(2~3문단) → h2 섹션 3~5개(특장점·과정·주의·팁) → 마무리 CTA
   - 각 섹션은 제품 팩트·웹 리서치·유사 사례 용어를 근거로 구체적 문장으로 쓰세요
   - "사진이 없어 설명이 부족하다"는 식의 메타 멘트 금지
8) 시공/제품 흐름: 짧은 도입 → 핵심 포인트(텍스트) → 주의/팁 → CTA. 라이프스타일 감성 소개문 금지`;

  return `당신은 네이버/티스토리 감성의 한국어 블로그 작가 겸 편집자입니다.
반드시 JSON만 반환하세요. 키: title(string), titleCandidates(string[] 3개), body(string, HTML).

body 작성 규칙:
1) HTML만 사용 (마크다운 금지). 허용 태그: p, br, h2, h3, strong, em, ul, li, span${opts.hasImages ? ", img, div" : ""}
2) 학습된 줄바꿈 리듬을 따르세요. 긴 문단 금지. 한 문단은 1~2문장, 호흡마다 새 <p>
${emojiDensityGuidance(opts.emojiUsage)}
4) 강조·색 사용:
   - 제품명·스펙·핵심 동사에 <strong> 또는 <span style="color:#HEX"> (colorPalette 순환)
   - 밋밋한 회색 본문만 쓰지 말 것. 학습 emphasisStyle을 우선
5) 글자 크기 — 학습 프로필 우선: 본문 ${opts.bodySize} / 강조 ${opts.emphasisSize} / 제목 ${opts.headingSize}.
   반드시 <span style="font-size:..."> 안에 넣으세요 (h2/h3 태그 style은 에디터가 버림):
   - 소제목: <h2><span style="font-size:${opts.headingSize};color:#HEX">제목</span></h2>
   - 포인트: <p><span style="font-size:${opts.emphasisSize}">...</span></p>
   - 본문: <p><span style="font-size:${opts.bodySize}">...</span></p>
${imageRules}
9) 같은 문장 패턴 반복 금지. "세련된 변신/매력적으로 변신/유익한 정보로 돌아오겠습니다" 류 금지
10) 설명조 보고서 문체 금지. 원문·유사 사례·웹 리서치의 용어·호흡을 테마 말투로 재작성
11) HTML 전체를 코드블록으로 감싸지 말 것`;
}

export type DraftImageSlot = {
  type: "single" | "group";
  images: PublishImageInput[];
};

export async function generateBlogDraft(input: {
  brandName: string;
  keyword: string;
  styleSummary: string;
  traitsJson: unknown;
  sampleAnchors: Array<{ excerpt: string }>;
  images: PublishImageInput[];
  imageSlots?: DraftImageSlot[];
  similarSources?: Array<{ title: string | null; excerpt: string }>;
  productFacts?: {
    productName: string;
    highlights: string[];
    caution?: string;
  } | null;
  /** Overrides StyleTraits.tone for this draft (말투). */
  voiceTone?: string | null;
  /** short | medium | long — target body length */
  length?: TopicLength | string | null;
  /** Dual-draft: which provider runs this call (gpt | gemini) */
  draftProvider?: DraftProvider;
  /** worklog | product — shapes structure & fact emphasis */
  postMode?: "worklog" | "product" | null;
  /** Formatted web research (blogs/news snippets) */
  webResearch?: string | null;
  /** Same-product process/check/tip points from learned sources */
  learnedSupplements?: Array<{
    point: string;
    kind: "process" | "check" | "tip" | "caution" | "other";
  }> | null;
}): Promise<DraftGenerateResult> {
  const draftProvider = input.draftProvider || "gpt";
  const traits = normalizeExtendedTraits(input.traitsJson);
  const voiceTone = input.voiceTone?.trim() || traits.tone;
  const draftTraits = { ...traits, tone: voiceTone };
  const lengthPreset = getTopicLengthPreset(input.length);
  const anchors = input.sampleAnchors
    .map((a, i) => `--- 샘플 ${i + 1} ---\n${a.excerpt}`)
    .join("\n\n");
  const similar =
    input.similarSources
      ?.map(
        (s, i) =>
          `--- 유사 사례 ${i + 1}${s.title ? ` · ${s.title}` : ""} ---\n${s.excerpt}`,
      )
      .join("\n\n") || "";
  const hasImages = (input.images?.length || 0) > 0;
  const imageLines = formatImageSlotLines(input.imageSlots, input.images);
  const sceneKeywords = formatSceneKeywords(input.imageSlots, input.images);
  const hasSceneKeywords = sceneKeywords !== "(장면 키워드 없음)";
  const typeSizes = resolveDraftTypeSizes(draftTraits.fontSizes);
  const productBlock = input.productFacts?.highlights?.length
    ? `제품: ${input.productFacts.productName}\n특장점:\n${input.productFacts.highlights
        .map((h) => `- ${h}`)
        .join("\n")}\n주의: ${input.productFacts.caution || "키워드·사진과 관련될 때만. 불확실 스펙 금지"}`
    : "(없음 — 키워드에 없는 스펙은 추측하지 말 것)";
  const isProductMode = input.postMode === "product";
  const modeBlock = isProductMode
    ? `글 모드: 제품·리뷰 (필수)
- 흐름: 제품 소개 → 핵심 스펙/특장점(제품 팩트·웹 리서치 반영) → 장단점 → 구매·사용 팁 → CTA
- 제품 팩트·특장점을 본문에 명시적으로 녹이세요. 팩트가 비어 있으면 웹 리서치·키워드만으로 짧게, 추측 스펙 금지.
- 시공 공정 나열보다 제품 가치·스펙·사용감에 비중을 두세요.`
    : hasImages
      ? `글 모드: 시공·후기
- 흐름: 짧은 도입 → 제품/작업 포인트 → 사진·공정 키워드 중심 설명 → CTA
- 사진 장면 키워드와 시공 용어를 우선하세요.`
      : `글 모드: 시공·후기 (사진 없음 — 텍스트 보강)
- 흐름: 짧은 도입 → 작업/제품 포인트 → 주의·팁 → CTA
- 웹 리서치·유사 사례·제품 팩트로 정보량을 채우되, 없는 차종·가격·스펙은 쓰지 마세요.`;
  const styleHardConstraints = `학습 스타일 강제(JSON보다 우선):
- 문장 길이: ${draftTraits.sentenceLength}
- 줄바꿈: ${draftTraits.lineBreakStyle}
- 강조: ${draftTraits.emphasisStyle}
- 구조 메모: ${draftTraits.structureNotes || "(없음)"}
- 골격: ${(draftTraits.sectionPatterns || []).join(" → ") || "(없음)"}
- 자주 쓰는 표현(가능하면 2개 이상 자연스럽게): ${(draftTraits.commonPhrases || []).slice(0, 6).join(" / ") || "(없음)"}
- 이모지 밀도: ${draftTraits.emojiUsage}`;
  const accent =
    draftTraits.colorPalette.find((c) => c.toUpperCase() !== "#222222") || "#E85D04";
  const emojiPool =
    draftTraits.frequentEmojis.length > 0
      ? draftTraits.frequentEmojis.join(" ")
      : "🔧 ✨ 👍 🚗 📦 ✅ 🙏";
  const webResearchBlock = input.webResearch?.trim()
    ? input.webResearch.trim()
    : "(웹 리서치 없음)";
  const learnedBlock =
    input.learnedSupplements?.length
      ? input.learnedSupplements
          .map((p, i) => `${i + 1}. [${p.kind}] ${p.point}`)
          .join("\n")
      : "(없음)";
  const draftSystem = buildDraftSystem({
    hasImages,
    emojiUsage: draftTraits.emojiUsage,
    bodySize: typeSizes.body,
    emphasisSize: typeSizes.emphasis,
    headingSize: typeSizes.heading,
  });

  let tokenUsage: DraftTokenUsage | undefined;
  let modelId = getDraftProviderConfig(draftProvider).model;

  const { result, usedFallback, provider } = await withProviderFallback(
    async () => {
      const chat = await chatCompletion(
        [
          { role: "system", content: draftSystem },
          {
            role: "user",
            content: `테마: ${input.brandName}
키워드: ${input.keyword}

${modeBlock}

이번 글 말투(최우선, 문장체 옵션): ${voiceTone}
오프닝 스타일: ${draftTraits.openerStyle}
클로징 스타일: ${draftTraits.closerStyle}

${styleHardConstraints}

문체·편집 요약:
${input.styleSummary}

편집 특성(JSON, tone은 위 말투로 이미 반영됨):
${JSON.stringify(draftTraits, null, 2)}

사용할 이모지 풀: ${emojiPool}
강조색 예시: ${accent} (colorPalette: ${draftTraits.colorPalette.join(", ") || accent})
글자 크기(학습 우선): 본문 ${typeSizes.body} / 강조 ${typeSizes.emphasis} / 제목 ${typeSizes.heading}

학습 용어(domainTerms): ${(draftTraits.domainTerms || []).join(", ") || "(없음)"}
학습 제품명(productMentions, 관련될 때만 자연스럽게): ${(draftTraits.productMentions || []).join(", ") || "(없음)"}
학습 CTA: ${(draftTraits.ctaPhrases || []).join(", ") || "(없음)"}
금지 표현: ${(draftTraits.bannedFluff || []).join(" / ") || "(없음)"}

원문 샘플(리듬·이모지·말투 참고, 내용 복붙 금지):
${anchors || "(없음)"}

유사 사례(시공 용어·섹션 흐름·호응을 강하게 참고. 문장 복붙 금지. 사례의 차종·색·가격·사진 사실은 새 글에 옮기지 말 것):
${similar || "(없음)"}

제품 팩트(${isProductMode ? "제품 모드 — 본문에 특장점을 적극 반영. 관련 사실만" : "검색/수동 — 스펙 보강용. 관련될 때만"}):
${productBlock}

웹 리서치(블로그·뉴스 스니펫 증류 — 스니펫에 없는 사실 금지. 문장 복붙 금지, 테마 말투로 재작성):
${webResearchBlock}

학습 보충 포인트(같은 제품 과거 시공글 · 참고용. 사진 프롬프트·참고 내용 최우선 / 단락 구체화에만 사용 / 복붙·없는 스펙 금지. 키워드·장면과 모순되면 무시):
${learnedBlock}

단락별 장면 키워드(사용자 입력 우선. 사실 근거. 이와 모순되면 안 됨. 복붙 금지 → 말투로 확장):
${sceneKeywords}

사진 배치(사용자가 정한 단독/묶음만 사용. 임의 묶음 금지):
${imageLines}

요청:
- 목표 분량: ${lengthPreset.label} — 본문 순수 텍스트 약 ${lengthPreset.targetChars.min}~${lengthPreset.targetChars.max}자 (${lengthPreset.hint}). ${lengthPreset.paragraphsPerSection}.
- 사실 우선순위: ${
              !hasImages
                ? "1) 제품 팩트 2) 웹 리서치 3) 학습 보충 포인트 4) 유사 사례 용어·흐름 5) 편집 프로필"
                : isProductMode
                  ? "1) 제품 팩트·특장점 2) 단락 장면 키워드 3) 학습 보충 포인트 4) 웹 리서치/유사 사례 5) 편집 프로필"
                  : "1) 단락 장면 키워드 2) 제품 팩트 3) 학습 보충 포인트 4) 웹 리서치/유사 사례 5) 편집 프로필"
            }
- 모든 문장은 "${voiceTone}" 말투로 쓰세요. opener/closer·학습 스타일 강제 항목을 지키세요.
- 장면 키워드·리서치를 복붙하지 말고 말투로 풀어 쓰세요. 없는 스펙은 팩트/리서치로만 보강.
- 학습 용어·productMentions·CTA·commonPhrases를 자연스럽게 넣고, bannedFluff는 쓰지 마세요.
${hasImages ? `- 단락마다: (짧은 ${isProductMode ? "제품" : "시공"} 도입 1문장) → 이미지 → (장면 키워드를 풀어쓴 설명 2~3문장. 한 문장 끝맺음 금지).\n- 설명에는 확인·작업 포인트, 상태/결과, 독자가 알면 좋은 팁 중 2가지 이상 넣으세요.\n- [단독]은 세로 1장씩, [묶음]만 가로 그리드.` : "- 사진 없이 섹션형 본문으로 정보량을 채우세요."}
- 목표 분량을 맞추세요. 사진이 있어도 장면마다 짧게 끊지 말고 분량을 채우세요.`,
          },
        ],
        {
          json: true,
          temperature: hasSceneKeywords || Boolean(input.webResearch?.trim()) ? 0.5 : 0.65,
          maxTokens: Math.max(llmMaxTokens(), lengthPreset.draftMaxTokens),
          draftProvider,
        },
      );
      tokenUsage = chat.tokenUsage;
      modelId = chat.modelId || modelId;
      const text = chat.text;
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
            : fallbackDraft(input, draftTraits).body;
        return {
          title,
          titleCandidates: titleCandidates.length ? titleCandidates : [title],
          body: applySlotLayoutToHtml(unwrapHtmlBody(rawBody), input.imageSlots),
        };
      } catch {
        throw new Error("LLM 초안 JSON 파싱에 실패했습니다.");
      }
    },
    () => fallbackDraft(input, draftTraits),
    `draft-generate:${draftProvider}`,
  );

  return {
    ...result,
    body: prepareEditorHtml(applySlotLayoutToHtml(result.body, input.imageSlots)),
    meta: {
      usedFallback,
      provider,
      draftProvider,
      modelId,
      tokenUsage,
    },
  };
}

function unwrapHtmlBody(body: string) {
  return body
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/** If user has no group slots, flatten any LLM-created image-group grids into singles. */
function applySlotLayoutToHtml(html: string, slots?: DraftImageSlot[]) {
  const hasGroup = Boolean(slots?.some((slot) => slot.type === "group"));
  if (hasGroup) return html;
  return html.replace(
    /<div[^>]*data-type=["']image-group["'][^>]*>([\s\S]*?)<\/div>/gi,
    (_full, inner: string) => {
      const imgs = [...inner.matchAll(/<img\b[^>]*>/gi)].map((m) => {
        const src = m[0].match(/\bsrc=(["'])([\s\S]*?)\1/i)?.[2] || "";
        const alt = m[0].match(/\balt=(["'])([\s\S]*?)\1/i)?.[2] || "";
        return src ? `<p>${singleImageTag(src, alt)}</p>` : "";
      });
      return imgs.filter(Boolean).join("\n");
    },
  );
}

function formatImageSlotLines(
  slots: DraftImageSlot[] | undefined,
  images: PublishImageInput[],
) {
  if (slots?.length) {
    return slots
      .map((slot, i) => {
        if (slot.type === "single") {
          const img = slot.images[0];
          return `${i + 1}. [단독] URL=${img.imageUrl}\n   장면키워드: ${img.caption?.trim() || "(없음 — 보이는 장면만 일반 서술)"}`;
        }
        const cols = slot.images.length >= 3 ? 3 : 2;
        const urls = slot.images.map((img, j) => `  - ${j + 1}) URL=${img.imageUrl}`).join("\n");
        const caption = slot.images[0]?.caption?.trim() || "(없음)";
        return `${i + 1}. [단락 묶음 ${slot.images.length}장 / ${cols}열]\n   장면키워드: ${caption}\n${urls}`;
      })
      .join("\n");
  }
  if (!images.length) return "(없음)";
  return images
    .map(
      (img, i) =>
        `${i + 1}. [단락] URL=${img.imageUrl}\n   장면키워드: ${img.caption?.trim() || `사진 ${i + 1}`}`,
    )
    .join("\n");
}

function formatSceneKeywords(
  slots: DraftImageSlot[] | undefined,
  images: PublishImageInput[],
) {
  const lines = slots?.length
    ? slots
        .map((slot, i) => {
          const caption = slot.images[0]?.caption?.trim();
          if (!caption) return null;
          const kind = slot.type === "group" ? `묶음 ${slot.images.length}장` : "단독";
          return `${i + 1}. [${kind}] ${caption}`;
        })
        .filter(Boolean)
    : images
        .map((img, i) => {
          const caption = img.caption?.trim();
          if (!caption) return null;
          return `${i + 1}. ${caption}`;
        })
        .filter(Boolean);
  return lines?.length ? lines.join("\n") : "(장면 키워드 없음)";
}

function fallbackDraft(
  input: {
    brandName: string;
    keyword: string;
    styleSummary: string;
    images: PublishImageInput[];
    imageSlots?: DraftImageSlot[];
  },
  traits?: StyleTraits,
): Omit<DraftGenerateResult, "meta"> {
  const t = traits || normalizeTraitsJson({});
  const emoji = t.frequentEmojis[0] || "✨";
  const accent = t.colorPalette.find((c) => c.toUpperCase() !== "#222222") || "#E85D04";
  const title = `${emoji} ${input.keyword} — ${input.brandName}`;

  const slots = input.imageSlots?.length
    ? input.imageSlots
    : input.images.map((img) => ({ type: "single" as const, images: [img] }));
  const emoji2 = t.frequentEmojis[1] || "🔧";
  const imageBlocks = slots
    .map((slot, slotIndex) => {
      if (slot.type === "group" && slot.images.length >= 2) {
        const kw = (slot.images[0]?.caption || "사진").replace(/"/g, "");
        return `<p><span style="font-size:18px;color:${accent}">${emoji2} <strong>${kw}</strong></span></p>
${buildGroupedImagesHtml(slot.images, slot.images.length >= 3 ? 3 : 2)}
<p><span style="font-size:15px">${kw} 단계를 꼼꼼히 체크했어요 ${emoji}</span></p>
<p><span style="font-size:15px">상태를 확인한 뒤 시공 가능 여부와 작업 포인트를 정리했고, 이어서 진행할 내용도 맞춰 두었습니다.</span></p>`;
      }
      return slot.images
        .map((img) => {
          const keywords = (img.caption || "사진").replace(/"/g, "");
          return `<p><span style="font-size:18px;color:${accent}">${emoji2} <strong>${keywords}</strong></span></p>
<p>${singleImageTag(img.imageUrl, keywords)}</p>
<p><span style="font-size:15px">${keywords} 단계를 꼼꼼히 체크했어요 ${slotIndex % 2 === 0 ? emoji : emoji2}</span></p>
<p><span style="font-size:15px">상태를 확인한 뒤 시공 가능 여부와 작업 포인트를 정리했고, 이어서 진행할 내용도 맞춰 두었습니다.</span></p>`;
        })
        .join("\n");
    })
    .join("\n");

  const summaryLine =
    input.styleSummary
      .split(/(?<=[.!?。])\s+/)
      .slice(0, 2)
      .join(" ")
      .trim() || "오늘 방문 후기를 짧게 남겨요.";

  const body = `<p><span style="font-size:18px;color:${accent}">${emoji} ${input.keyword}, 이렇게 보면 쉬워요</span></p>
<p>${summaryLine}</p>
<h2 style="font-size:22px;color:${accent}">왜 ${input.keyword}인가요? ${t.frequentEmojis[1] || "💕"}</h2>
<p><strong>${input.keyword}</strong>를 찾는 분들께 꼭 보여드리고 싶은 포인트만 골랐어요.</p>
<p>${t.commonPhrases[0] ? `${t.commonPhrases[0]} 같은 말이 절로 나오더라고요.` : "분위기부터 남다르더라고요."}</p>
${imageBlocks}
<h3 style="font-size:18px">체크 포인트 ${t.frequentEmojis[2] || "👍"}</h3>
<ul>
<li><span style="color:${accent}"><strong>분위기</strong></span> — 사진보다 실물이 더 좋아요</li>
<li><strong>동선</strong> — 여유 있게 둘러보기 좋아요</li>
<li><strong>팁</strong> — ${input.keyword} 관련 추천을 꼭 물어보세요</li>
</ul>
<p>${t.closerStyle} ${emoji}</p>
<p><span style="font-size:15px">${input.brandName}에서 만나요!</span></p>`;

  return {
    title,
    titleCandidates: [
      title,
      `${input.keyword} 추천 정리 ${emoji}`,
      `${input.brandName}이 전하는 ${input.keyword}`,
    ],
    body,
  };
}

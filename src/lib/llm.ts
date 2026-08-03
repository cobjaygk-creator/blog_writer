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
  };
};

const DRAFT_SYSTEM = `당신은 네이버/티스토리 감성의 한국어 블로그 작가 겸 편집자입니다.
반드시 JSON만 반환하세요. 키: title(string), titleCandidates(string[] 3개), body(string, HTML).

body 작성 규칙:
1) HTML만 사용 (마크다운 금지). 허용 태그: p, br, h2, h3, strong, em, ul, li, span, img, div
2) 학습된 줄바꿈 리듬을 따르세요. 긴 문단 금지. 한 문단은 1~2문장, 호흡마다 새 <p>
3) 이모지 적극 사용(필수):
   - frequentEmojis를 우선 사용. 없으면 시공/자동차 맥락 이모지(🔧✨👍🚗📦✅🙏) 사용
   - 제목·모든 h2/h3·도입·마무리 CTA·사진 직후 문장에 이모지를 넣으세요
   - 밋밋한 순수 텍스트 단락만 이어지지 않게, 2~3문단마다 최소 1개 이모지
4) 강조·색 적극 사용(필수):
   - 제품명·스펙·핵심 동사마다 <strong> 또는 <span style="color:#HEX"> (colorPalette 순환)
   - 단락마다 최소 1회 색상/강조. 회색 밋밋한 본문만 쓰지 말 것
5) 글자 크기 적극 사용(필수) — 반드시 <span style="font-size:..."> 안에 넣으세요 (h2/h3 태그 style은 에디터가 버림):
   - 소제목: <h2><span style="font-size:22px;color:#HEX">제목 ✨</span></h2>
   - 소소제목: <h3><span style="font-size:18px;color:#HEX">소제목</span></h3>
   - 포인트 문장: <p><span style="font-size:18px">...</span></p>
   - 보조 설명: <p><span style="font-size:15px">...</span></p>
   - 크기·색이 없는 plain <p>만 연속되면 실패로 간주하고 서식을 넣으세요
6) 사진은 반드시 제공 URL 그대로 사용(변경·생략 금지). 배치 규칙은 아래 "사진 배치"를 절대적으로 따릅니다.
   - [단독] 슬롯: 반드시 세로로 하나씩 <p><img src="URL" alt="장면키워드" style="${SINGLE_IMAGE_STYLE}" /></p> (나란히/그리드 금지)
   - [묶음] 슬롯만 image-group 사용:
     <div data-type="image-group" data-cols="2" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0;">...</div>
   - 사용자가 묶지 않은 사진을 임의로 묶지 마세요.
7) 장면 키워드 → 문장체 확장(최우선):
   - 각 단락의 "장면 키워드"는 사용자가 확정한 사실 메모입니다. 키워드를 그대로 복붙하지 말고 지정된 말투로 풀어 쓰세요.
   - 키워드에 없는 색·재질·스펙·상태를 지어내지 마세요.
   - 부족한 스펙·특장점은 제품 팩트(검색/수동)로만 보강하고, 팩트에도 없으면 쓰지 마세요.
   - 단락마다: (짧은 도입 문장+이모지) → 이미지 → (키워드+관련 팩트를 말투로 풀어쓴 1문장, 강조/색 포함). 빈 <p></p> / <p><br></p> 금지.
8) 시공 작업기 흐름: 짧은 도입 → 제품/작업 포인트 → 사진별 설명 → CTA. 라이프스타일 감성 소개문 금지
9) 같은 문장 패턴 반복 금지. "세련된 변신/매력적으로 변신/유익한 정보로 돌아오겠습니다" 류 금지
10) 설명조 보고서 문체 금지. 원문·유사 사례의 용어·호흡·시공 표현을 적극 반영
11) HTML 전체를 코드블록으로 감싸지 말 것`;

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
}): Promise<DraftGenerateResult> {
  const traits = normalizeExtendedTraits(input.traitsJson);
  const voiceTone = input.voiceTone?.trim() || traits.tone;
  const draftTraits = { ...traits, tone: voiceTone };
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
  const imageLines = formatImageSlotLines(input.imageSlots, input.images);
  const sceneKeywords = formatSceneKeywords(input.imageSlots, input.images);
  const hasSceneKeywords = sceneKeywords !== "(장면 키워드 없음)";
  const productBlock = input.productFacts?.highlights?.length
    ? `제품: ${input.productFacts.productName}\n특장점:\n${input.productFacts.highlights
        .map((h) => `- ${h}`)
        .join("\n")}\n주의: ${input.productFacts.caution || "키워드·사진과 관련될 때만. 불확실 스펙 금지"}`
    : "(없음 — 키워드에 없는 스펙은 추측하지 말 것)";
  const accent =
    draftTraits.colorPalette.find((c) => c.toUpperCase() !== "#222222") || "#E85D04";
  const emojiPool =
    draftTraits.frequentEmojis.length > 0
      ? draftTraits.frequentEmojis.join(" ")
      : "🔧 ✨ 👍 🚗 📦 ✅ 🙏";

  const { result, usedFallback, provider } = await withProviderFallback(
    async () => {
      const { text } = await chatCompletion(
        [
          { role: "system", content: DRAFT_SYSTEM },
          {
            role: "user",
            content: `업체: ${input.brandName}
키워드: ${input.keyword}

이번 글 말투(최우선, 문장체 옵션): ${voiceTone}
오프닝 스타일: ${draftTraits.openerStyle}
클로징 스타일: ${draftTraits.closerStyle}

문체·편집 요약:
${input.styleSummary}

편집 특성(JSON, tone은 위 말투로 이미 반영됨):
${JSON.stringify(draftTraits, null, 2)}

사용할 이모지 풀: ${emojiPool}
강조색 예시: ${accent} (colorPalette: ${draftTraits.colorPalette.join(", ") || accent})
글자 크기 풀: ${(draftTraits.fontSizes || []).join(", ") || "15px, 18px, 22px"}

학습 용어(domainTerms): ${(draftTraits.domainTerms || []).join(", ") || "(없음)"}
학습 제품명(productMentions, 관련될 때만 자연스럽게): ${(draftTraits.productMentions || []).join(", ") || "(없음)"}
학습 CTA: ${(draftTraits.ctaPhrases || []).join(", ") || "(없음)"}
글 골격: ${(draftTraits.sectionPatterns || []).join(" → ") || "(없음)"}
금지 표현: ${(draftTraits.bannedFluff || []).join(" / ") || "(없음)"}

원문 샘플(리듬·이모지·말투 참고, 내용 복붙 금지):
${anchors || "(없음)"}

유사 사례(시공 용어·섹션 흐름·호응을 강하게 참고. 문장 복붙 금지. 사례의 차종·색·가격·사진 사실은 새 글에 옮기지 말 것):
${similar || "(없음)"}

제품 팩트(검색/수동 — 단락 키워드에 없는 스펙 보강용. 관련될 때만):
${productBlock}

단락별 장면 키워드(사용자 입력 우선. 사실 근거. 이와 모순되면 안 됨. 복붙 금지 → 말투로 확장):
${sceneKeywords}

사진 배치(사용자가 정한 단독/묶음만 사용. 임의 묶음 금지):
${imageLines}

요청:
- 사실 우선순위: 1) 단락 장면 키워드 2) 제품 팩트 3) 유사 사례 용어·흐름 4) 편집 프로필
- 모든 문장은 "${voiceTone}" 말투로 쓰세요. opener/closer 스타일을 반영하세요.
- 장면 키워드를 복붙하지 말고 말투로 풀어 쓰세요. 없는 스펙은 제품 팩트로만 보강.
- 이모지·색상·글자 크기·strong을 적극 사용하세요. 밋밋한 plain 텍스트만 나오면 안 됩니다.
- 학습 용어·productMentions·CTA를 자연스럽게 넣고, bannedFluff 표현은 쓰지 마세요.
- 단락마다: (짧은 시공/제품 문장+이모지+강조) → 이미지 → (키워드+팩트 풀어쓴 1문장, 색/크기 포함).
- [단독]은 세로 1장씩, [묶음]만 가로 그리드.
- 제목에도 이모지를 넣으세요.`,
          },
        ],
        {
          json: true,
          temperature: hasSceneKeywords ? 0.5 : 0.65,
          maxTokens: Math.max(llmMaxTokens(), 3500),
        },
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
    "draft-generate",
  );

  return {
    ...result,
    body: prepareEditorHtml(applySlotLayoutToHtml(result.body, input.imageSlots)),
    meta: { usedFallback, provider },
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
<p><span style="font-size:15px">${kw} 장면을 정리했어요 ${emoji}</span></p>`;
      }
      return slot.images
        .map((img) => {
          const keywords = (img.caption || "사진").replace(/"/g, "");
          return `<p><span style="font-size:18px;color:${accent}">${emoji2} <strong>${keywords}</strong></span></p>
<p>${singleImageTag(img.imageUrl, keywords)}</p>
<p><span style="font-size:15px">${keywords} 장면을 정리했어요 ${slotIndex % 2 === 0 ? emoji : emoji2}</span></p>`;
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

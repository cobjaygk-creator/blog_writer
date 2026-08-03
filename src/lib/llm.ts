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
3) 학습된 frequentEmojis / emojiUsage에 맞춰 이모지를 자연스럽게 배치 (소제목·감탄·마무리)
4) 강조: 핵심 키워드는 <strong>, 포인트 문장/단어는 <span style="color:#HEX"> 사용 (colorPalette에서 선택)
5) 소제목은 <h2 style="font-size:22px;color:#HEX"> 또는 <h3 style="font-size:18px">처럼 크기·색을 섞어 밋밋하지 않게
6) 본문 일부에 <span style="font-size:15px"> / 18px 등 fontSizes를 반영
7) 사진은 반드시 제공 URL 그대로 사용(변경·생략 금지). 배치 규칙은 아래 "사진 배치"를 절대적으로 따릅니다.
   - [단독] 슬롯: 반드시 세로로 하나씩 <p><img src="URL" alt="캡션" style="${SINGLE_IMAGE_STYLE}" /></p> (나란히/그리드 금지)
   - [묶음] 슬롯만 image-group 사용:
     <div data-type="image-group" data-cols="2" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0;">...</div>
   - 사용자가 묶지 않은 사진을 임의로 묶지 마세요.
8) 사진 캡션 일치(최우선):
   - 각 사진의 "캡션"은 그 사진의 사실입니다. 바로 위/아래 문장은 캡션 내용을 문체에 맞게 풀어 쓰세요.
   - 캡션에 없는 색·재질·패턴·상태를 지어내지 마세요. (예: 캡션이 검정 다이아몬드인데 나무바닥이라고 쓰면 안 됨)
   - 캡션을 무시하고 키워드만으로 장면을 바꾸지 마세요.
   - 사진 직후 캡션을 풀어쓴 문장만 두고, 빈 <p></p> / <p><br></p> 는 넣지 마세요.
9) 시공 작업기 흐름: 짧은 도입 → 제품/작업 포인트 → 사진별 설명 → CTA. 라이프스타일 감성 소개문 금지
10) 같은 문장 패턴 반복 금지. "세련된 변신/매력적으로 변신/유익한 정보로 돌아오겠습니다" 류 금지
11) 설명조 보고서 문체 금지. 원문·유사 사례의 용어·호흡·시공 표현을 적극 반영
12) HTML 전체를 코드블록으로 감싸지 말 것`;

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
}): Promise<DraftGenerateResult> {
  const traits = normalizeExtendedTraits(input.traitsJson);
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
  const captionFacts = formatCaptionFacts(input.imageSlots, input.images);
  const hasCaptions = captionFacts !== "(캡션 없음)";
  const productBlock = input.productFacts?.highlights?.length
    ? `제품: ${input.productFacts.productName}\n특장점:\n${input.productFacts.highlights
        .map((h) => `- ${h}`)
        .join("\n")}\n주의: ${input.productFacts.caution || "사진에 안 보이면 쓰지 말 것"}`
    : "(없음)";

  const { result, usedFallback, provider } = await withProviderFallback(
    async () => {
      const { text } = await chatCompletion(
        [
          { role: "system", content: DRAFT_SYSTEM },
          {
            role: "user",
            content: `업체: ${input.brandName}
키워드: ${input.keyword}

문체·편집 요약:
${input.styleSummary}

편집 특성(JSON):
${JSON.stringify(traits, null, 2)}

학습 용어(domainTerms): ${(traits.domainTerms || []).join(", ") || "(없음)"}
학습 CTA: ${(traits.ctaPhrases || []).join(", ") || "(없음)"}
글 골격: ${(traits.sectionPatterns || []).join(" → ") || "(없음)"}
금지 표현: ${(traits.bannedFluff || []).join(" / ") || "(없음)"}

원문 샘플(리듬·이모지·말투 참고, 내용 복붙 금지):
${anchors || "(없음)"}

유사 사례(시공 용어·섹션 흐름·호응을 강하게 참고. 문장 복붙 금지. 사례의 차종·색·가격·사진 사실은 새 글에 옮기지 말 것):
${similar || "(없음)"}

제품 팩트(사진과 관련될 때만 사용):
${productBlock}

사진별 사실 캡션(본문 서술의 근거. 이와 모순되면 안 됨):
${captionFacts}

사진 배치(사용자가 정한 단독/묶음만 사용. 임의 묶음 금지):
${imageLines}

요청:
- 사실 우선순위: 1) 사진 캡션 2) 매칭된 제품 팩트 3) 유사 사례 용어·흐름 4) 문체 프로필
- 시공점 작업기 톤으로 쓰세요. 형용사 나열·라이프스타일 맺음말 금지.
- 학습 용어·CTA를 자연스럽게 넣고, bannedFluff 표현은 쓰지 마세요.
- 사진마다: (짧은 시공/제품 문장) → 이미지 → (캡션+관련 팩트를 문체로 풀어쓴 1문장).
- [단독]은 세로 1장씩, [묶음]만 가로 그리드.
- 제목에도 필요하면 이모지를 넣되 과하지 않게.`,
          },
        ],
        {
          json: true,
          temperature: hasCaptions ? 0.45 : 0.6,
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
            : fallbackDraft(input, traits).body;
        return {
          title,
          titleCandidates: titleCandidates.length ? titleCandidates : [title],
          body: applySlotLayoutToHtml(unwrapHtmlBody(rawBody), input.imageSlots),
        };
      } catch {
        throw new Error("LLM 초안 JSON 파싱에 실패했습니다.");
      }
    },
    () => fallbackDraft(input, traits),
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
          return `${i + 1}. [단독] URL=${img.imageUrl}\n   필수캡션: ${img.caption?.trim() || "(없음 — 보이는 장면만 일반 서술)"}`;
        }
        const cols = slot.images.length >= 3 ? 3 : 2;
        const urls = slot.images.map((img, j) => `  - ${j + 1}) URL=${img.imageUrl}`).join("\n");
        const caption = slot.images[0]?.caption?.trim() || "(없음)";
        return `${i + 1}. [단락 묶음 ${slot.images.length}장 / ${cols}열]\n   단락캡션: ${caption}\n${urls}`;
      })
      .join("\n");
  }
  if (!images.length) return "(없음)";
  return images
    .map(
      (img, i) =>
        `${i + 1}. [단락] URL=${img.imageUrl}\n   단락캡션: ${img.caption?.trim() || `사진 ${i + 1}`}`,
    )
    .join("\n");
}

function formatCaptionFacts(
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
  return lines?.length ? lines.join("\n") : "(캡션 없음)";
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
  const imageBlocks = slots
    .map((slot) => {
      if (slot.type === "group" && slot.images.length >= 2) {
        return buildGroupedImagesHtml(slot.images, slot.images.length >= 3 ? 3 : 2);
      }
      return slot.images
        .map((img) => {
          const caption = (img.caption || "사진").replace(/"/g, "");
          return `<p>${caption}</p>
<p>${singleImageTag(img.imageUrl, caption)}</p>
<p><em>${caption}</em></p>`;
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

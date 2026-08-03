import { readFile } from "fs/promises";
import path from "path";

import {
  allowFallback,
  fetchWithTimeout,
  isVisionConfigured,
  visionMaxTokens,
  visionTimeoutMs,
} from "@/lib/integrations";

function getVisionConfig() {
  return {
    apiKey: process.env.VISION_API_KEY?.trim() || process.env.LLM_API_KEY?.trim() || "",
    baseUrl: (
      process.env.VISION_BASE_URL?.trim() ||
      process.env.LLM_BASE_URL?.trim() ||
      "https://api.openai.com/v1"
    ).replace(/\/$/, ""),
    model: process.env.VISION_MODEL?.trim() || process.env.LLM_MODEL?.trim() || "gpt-4o-mini",
  };
}

export type CaptionResult = {
  caption: string;
  usedFallback: boolean;
  provider: "vision" | "fallback";
};

function isLocalHostUrl(url: string) {
  try {
    const parsed = new URL(url);
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

async function toVisionAccessibleUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith("data:")) return imageUrl;

  // Local uploads under /uploads/... → read from disk as data URL (OpenAI can't fetch localhost)
  try {
    const parsed = new URL(imageUrl);
    if (parsed.pathname.startsWith("/uploads/")) {
      const filename = decodeURIComponent(parsed.pathname.replace(/^\/uploads\//, ""));
      const filePath = path.join(process.cwd(), "public", "uploads", filename);
      const buffer = await readFile(filePath);
      const ext = path.extname(filename).toLowerCase();
      const mime =
        ext === ".png"
          ? "image/png"
          : ext === ".webp"
            ? "image/webp"
            : ext === ".gif"
              ? "image/gif"
              : "image/jpeg";
      return `data:${mime};base64,${buffer.toString("base64")}`;
    }
  } catch {
    // fall through
  }

  if (isLocalHostUrl(imageUrl)) {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`로컬 이미지 로드 실패 (${response.status})`);
    }
    const mime = response.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }

  return imageUrl;
}

export type CaptionImageOptions = {
  keyword?: string | null;
  /** @deprecated Scene keywords ignore prose tone; kept for call-site compat. */
  tone?: string | null;
  /** Optional product highlight already matched to this photo (0~1). */
  factHighlight?: string | null;
};

/** Suggest short scene keywords for a photo (stored in PostImage.caption). */
export async function captionImage(
  imageUrl: string,
  keywordOrOptions?: string | null | CaptionImageOptions,
): Promise<CaptionResult> {
  const options: CaptionImageOptions =
    typeof keywordOrOptions === "object" && keywordOrOptions !== null
      ? keywordOrOptions
      : { keyword: keywordOrOptions };
  const keyword = options.keyword;
  const factHighlight = options.factHighlight?.trim() || "";

  const { apiKey, baseUrl, model } = getVisionConfig();

  if (!apiKey) {
    if (!allowFallback()) {
      throw new Error("VISION_API_KEY(또는 LLM_API_KEY)가 설정되지 않았습니다.");
    }
    return {
      caption: fallbackSceneKeywords(imageUrl, keyword),
      usedFallback: true,
      provider: "fallback",
    };
  }

  try {
    const visionUrl = await toVisionAccessibleUrl(imageUrl);
    const factLine = factHighlight
      ? `관련 제품 포인트(사진과 직접 관련될 때만 · 뒤에 짧게 붙임, 안 보이면 무시): "${factHighlight}"`
      : "";
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
          temperature: 0.2,
          max_tokens: Math.min(visionMaxTokens(), 120),
          messages: [
            {
              role: "system",
              content: [
                "당신은 시공/제품 블로그용 장면 키워드 추출기입니다.",
                "완성 문장·감탄·형용사 나열·이모지 금지. 따옴표 없이 키워드만.",
                "형식: 장면유형 · 보이는 사실 · (선택) 제품 포인트",
                "길이 20~80자. 예: 박스 포장 · 장착 전 · 꼼꼼한 포장",
                "예: 구성품 · 본품, 볼트와 너트",
                "예: 장착 완료 · 루프박스 체결부",
                "1순위: 사진에 실제로 보이는 것. 추측·과장·없는 스펙 금지.",
                factLine,
              ]
                .filter(Boolean)
                .join(" "),
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: keyword
                    ? `포스트 키워드 "${keyword}" 맥락입니다. 이 사진의 장면 키워드만 추출하세요.${
                        factHighlight ? " 관련되면 제품 포인트를 짧게 붙이세요." : ""
                      }`
                    : "이 사진의 장면 키워드만 추출하세요.",
                },
                { type: "image_url", image_url: { url: visionUrl } },
              ],
            },
          ],
        }),
      },
      visionTimeoutMs(),
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Vision 요청 실패 (${response.status}): ${detail.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = sanitizeSceneKeywords(data.choices?.[0]?.message?.content?.trim() || "");
    if (!text) {
      throw new Error("Vision 응답이 비어 있습니다.");
    }
    return { caption: text, usedFallback: false, provider: "vision" };
  } catch (error) {
    if (!allowFallback()) throw error;
    console.warn("[vision] provider failed, using fallback:", error);
    return {
      caption: fallbackSceneKeywords(imageUrl, keyword),
      usedFallback: true,
      provider: "fallback",
    };
  }
}

export function visionReady() {
  return isVisionConfigured();
}

function sanitizeSceneKeywords(raw: string) {
  const oneLine = raw
    .replace(/^["'「『]|["'」』]$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (oneLine.length <= 80) return oneLine;
  return `${oneLine.slice(0, 80).trim()}`;
}

function fallbackSceneKeywords(imageUrl: string, keyword?: string | null) {
  const file = imageUrl.split("/").pop()?.split("?")[0] || "image";
  const short = file.replace(/\.[^.]+$/, "").slice(0, 24);
  if (keyword?.trim()) {
    return `사진 · ${keyword.trim()} · ${short}`;
  }
  return `사진 · ${short}`;
}

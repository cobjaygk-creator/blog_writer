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

export async function captionImage(
  imageUrl: string,
  keyword?: string | null,
): Promise<CaptionResult> {
  const { apiKey, baseUrl, model } = getVisionConfig();

  if (!apiKey) {
    if (!allowFallback()) {
      throw new Error("VISION_API_KEY(또는 LLM_API_KEY)가 설정되지 않았습니다.");
    }
    return {
      caption: fallbackCaption(imageUrl, keyword),
      usedFallback: true,
      provider: "fallback",
    };
  }

  try {
    const visionUrl = await toVisionAccessibleUrl(imageUrl);
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
          temperature: 0.3,
          max_tokens: visionMaxTokens(),
          messages: [
            {
              role: "system",
              content:
                "당신은 블로그용 한국어 이미지 캡션 작가입니다. 1~2문장으로 장면·분위기·맥락을 설명하세요. 따옴표 없이 본문만 출력하세요.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: keyword
                    ? `키워드 "${keyword}"와 연결해 이 사진을 설명하세요.`
                    : "이 사진을 블로그용으로 설명하세요.",
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
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("Vision 응답이 비어 있습니다.");
    }
    return { caption: text, usedFallback: false, provider: "vision" };
  } catch (error) {
    if (!allowFallback()) throw error;
    console.warn("[vision] provider failed, using fallback:", error);
    return {
      caption: fallbackCaption(imageUrl, keyword),
      usedFallback: true,
      provider: "fallback",
    };
  }
}

export function visionReady() {
  return isVisionConfigured();
}

function fallbackCaption(imageUrl: string, keyword?: string | null) {
  const file = imageUrl.split("/").pop()?.split("?")[0] || "image";
  if (keyword) {
    return `${keyword} 장면 — ${file} (로컬 캡션 폴백)`;
  }
  return `업로드된 사진 ${file}의 장면입니다. (로컬 캡션 폴백)`;
}

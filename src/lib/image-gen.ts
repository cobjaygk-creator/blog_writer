import {
  allowFallback,
  fetchWithTimeout,
  isImageGenConfigured,
  storageTimeoutMs,
} from "@/lib/integrations";
import { uploadImageBuffer } from "@/lib/storage";

export type GeneratedImage = {
  imageUrl: string;
  prompt: string;
  usedFallback: boolean;
  provider: "images" | "fallback";
};

function imageGenConfig() {
  return {
    apiKey:
      process.env.IMAGE_GEN_API_KEY?.trim() || process.env.LLM_API_KEY?.trim() || "",
    baseUrl: (
      process.env.IMAGE_GEN_BASE_URL?.trim() ||
      process.env.LLM_BASE_URL?.trim() ||
      "https://api.openai.com/v1"
    ).replace(/\/$/, ""),
    model: process.env.IMAGE_GEN_MODEL?.trim() || "dall-e-3",
    size: process.env.IMAGE_GEN_SIZE?.trim() || "1024x1024",
  };
}

export { isImageGenConfigured };

function imageGenTimeoutMs() {
  const raw = Number(process.env.IMAGE_GEN_TIMEOUT_MS?.trim());
  if (Number.isFinite(raw) && raw >= 5000) return Math.min(180_000, Math.floor(raw));
  return Math.max(storageTimeoutMs(), 90_000);
}

/** Generate one image from a prompt and store it; returns public URL. */
export async function generateAndStoreImage(input: {
  prompt: string;
  folder?: string;
}): Promise<GeneratedImage> {
  const prompt = input.prompt.trim().slice(0, 3500);
  if (!prompt) {
    throw new Error("이미지 프롬프트가 비어 있습니다.");
  }

  const { apiKey, baseUrl, model, size } = imageGenConfig();

  if (!apiKey || !isImageGenConfigured()) {
    if (!allowFallback()) {
      throw new Error("IMAGE_GEN_API_KEY(또는 LLM_API_KEY)가 설정되지 않았습니다.");
    }
    const upload = await uploadPlaceholder(input.folder, prompt);
    return {
      imageUrl: upload.imageUrl,
      prompt,
      usedFallback: true,
      provider: "fallback",
    };
  }

  try {
    const buffer = await requestImageBuffer({ apiKey, baseUrl, model, size, prompt });
    const contentType = detectBufferMime(buffer);
    const upload = await uploadImageBuffer({
      buffer,
      contentType,
      folder: input.folder || "posts",
    });
    return {
      imageUrl: upload.imageUrl,
      prompt,
      usedFallback: false,
      provider: "images",
    };
  } catch (error) {
    if (!allowFallback()) throw error;
    console.warn("[image-gen] provider failed, using placeholder:", error);
    const upload = await uploadPlaceholder(input.folder, prompt);
    return {
      imageUrl: upload.imageUrl,
      prompt,
      usedFallback: true,
      provider: "fallback",
    };
  }
}

/** Generate multiple images with limited concurrency. Collects per-slot errors. */
export async function generateSceneImages(
  prompts: string[],
  folder?: string,
  concurrency = 2,
): Promise<{
  results: Array<GeneratedImage | null>;
  errors: Array<string | null>;
}> {
  const results: Array<GeneratedImage | null> = new Array(prompts.length).fill(null);
  const errors: Array<string | null> = new Array(prompts.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < prompts.length) {
      const i = cursor;
      cursor += 1;
      const prompt = prompts[i];
      if (!prompt?.trim()) {
        results[i] = null;
        errors[i] = "빈 프롬프트";
        continue;
      }
      try {
        results[i] = await generateAndStoreImage({ prompt, folder });
        errors[i] = null;
      } catch (error) {
        const message = error instanceof Error ? error.message : "이미지 생성 실패";
        console.warn(`[image-gen] scene ${i} failed:`, error);
        results[i] = null;
        errors[i] = message;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(prompts.length, 1)) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return { results, errors };
}

async function requestImageBuffer(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  size: string;
  prompt: string;
}): Promise<Buffer> {
  // Current OpenAI Images API rejects `response_format` on some models/accounts.
  // Prefer URL (dall-e-3) or default payload (gpt-image-*).
  const attempts: Array<Record<string, unknown>> = [];

  if (/gpt-image/i.test(input.model)) {
    attempts.push({
      model: input.model,
      prompt: input.prompt,
      size: input.size,
    });
  } else {
    // dall-e-3 / dall-e-2 style
    attempts.push({
      model: input.model,
      prompt: input.prompt,
      n: 1,
      size: input.size,
    });
    // Legacy accounts that still accept b64
    attempts.push({
      model: input.model,
      prompt: input.prompt,
      n: 1,
      size: input.size,
      response_format: "b64_json",
    });
  }

  // If configured model fails as unknown, try gpt-image-1 then dall-e-3 once.
  if (!/gpt-image/i.test(input.model)) {
    attempts.push({
      model: "gpt-image-1",
      prompt: input.prompt,
      size: input.size,
    });
  }

  let lastError = "이미지 생성에 실패했습니다.";

  for (const body of attempts) {
    try {
      return await callImagesApi(input.apiKey, input.baseUrl, body);
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      // Only continue on parameter/model errors; auth/billing should stop.
      if (/401|403|insufficient_quota|billing/i.test(lastError)) throw error;
      console.warn("[image-gen] attempt failed:", body.model, lastError.slice(0, 180));
    }
  }

  throw new Error(lastError);
}

async function callImagesApi(
  apiKey: string,
  baseUrl: string,
  body: Record<string, unknown>,
): Promise<Buffer> {
  const response = await fetchWithTimeout(
    `${baseUrl}/images/generations`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    imageGenTimeoutMs(),
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`이미지 생성 실패 (${response.status}): ${detail.slice(0, 280)}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const item = data.data?.[0];
  if (item?.b64_json) {
    return Buffer.from(item.b64_json, "base64");
  }
  if (item?.url) {
    const imgRes = await fetchWithTimeout(item.url, {}, imageGenTimeoutMs());
    if (!imgRes.ok) throw new Error("생성된 이미지 URL 다운로드에 실패했습니다.");
    return Buffer.from(await imgRes.arrayBuffer());
  }
  throw new Error("이미지 생성 응답에 데이터가 없습니다.");
}

function detectBufferMime(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return "image/png";
}

async function uploadPlaceholder(folder: string | undefined, prompt: string) {
  const buffer = makePlaceholderPng(prompt);
  return uploadImageBuffer({
    buffer,
    contentType: "image/png",
    folder: folder || "posts",
  });
}

/** Minimal solid PNG placeholder for local/dev fallback. */
function makePlaceholderPng(label: string): Buffer {
  const minimal = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  void label;
  return minimal;
}

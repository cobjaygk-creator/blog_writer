export type IntegrationMode = "live" | "fallback" | "unconfigured";

export function envFlag(name: string, defaultValue: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return defaultValue;
  return !["0", "false", "no", "off"].includes(raw);
}

export function envInt(name: string, defaultValue: number, min = 1, max = 600_000) {
  const raw = Number(process.env[name]?.trim());
  if (!Number.isFinite(raw)) return defaultValue;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

/** When false, missing keys / provider failures throw instead of local fallback. */
export function allowFallback() {
  return envFlag("INTEGRATIONS_ALLOW_FALLBACK", true);
}

export function llmTimeoutMs() {
  // Topic/worklog drafts often exceed 45s once research + images finish first.
  return envInt("LLM_TIMEOUT_MS", 120_000, 3_000, 300_000);
}

export function visionTimeoutMs() {
  return envInt("VISION_TIMEOUT_MS", 45_000, 3_000, 180_000);
}

export function llmMaxTokens() {
  return envInt("LLM_MAX_TOKENS", 3_500, 256, 8_000);
}

export function visionMaxTokens() {
  return envInt("VISION_MAX_TOKENS", 300, 64, 1_000);
}

export function uploadMaxBytes() {
  return envInt("UPLOAD_MAX_BYTES", 8 * 1024 * 1024, 100_000, 20 * 1024 * 1024);
}

export function uploadMaxImagesPerPost() {
  return envInt("UPLOAD_MAX_IMAGES_PER_POST", 20, 1, 50);
}

export function storageTimeoutMs() {
  return envInt("STORAGE_TIMEOUT_MS", 30_000, 3_000, 120_000);
}

export function isLlmConfigured() {
  return Boolean(
    process.env.LLM_GPT_API_KEY?.trim() ||
      process.env.LLM_API_KEY?.trim() ||
      process.env.LLM_GEMINI_API_KEY?.trim(),
  );
}

export function isImageGenConfigured() {
  return Boolean(
    process.env.IMAGE_GEN_API_KEY?.trim() ||
      process.env.LLM_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim(),
  );
}

export function isVisionConfigured() {
  return Boolean(process.env.VISION_API_KEY?.trim() || process.env.LLM_API_KEY?.trim());
}

export function isStorageConfigured() {
  return Boolean(
    process.env.STORAGE_ENDPOINT?.trim() &&
      process.env.STORAGE_BUCKET?.trim() &&
      process.env.STORAGE_ACCESS_KEY?.trim() &&
      process.env.STORAGE_SECRET_KEY?.trim(),
  );
}

export function getIntegrationsStatus() {
  return {
    allowFallback: allowFallback(),
    llm: {
      configured: isLlmConfigured(),
      model:
        process.env.LLM_GPT_MODEL?.trim() ||
        process.env.LLM_MODEL?.trim() ||
        "gpt-4o-mini",
      timeoutMs: llmTimeoutMs(),
      maxTokens: llmMaxTokens(),
      gptConfigured: Boolean(
        process.env.LLM_GPT_API_KEY?.trim() || process.env.LLM_API_KEY?.trim(),
      ),
      geminiConfigured: Boolean(process.env.LLM_GEMINI_API_KEY?.trim()),
      geminiModel: process.env.LLM_GEMINI_MODEL?.trim() || "gemini-2.0-flash",
    },
    vision: {
      configured: isVisionConfigured(),
      model: process.env.VISION_MODEL?.trim() || process.env.LLM_MODEL?.trim() || "gpt-4o-mini",
      timeoutMs: visionTimeoutMs(),
      maxTokens: visionMaxTokens(),
    },
    storage: {
      configured: isStorageConfigured(),
      mode: isStorageConfigured() ? "s3" : "local",
      region: process.env.STORAGE_REGION?.trim() || "ap-northeast-2",
      timeoutMs: storageTimeoutMs(),
      maxBytes: uploadMaxBytes(),
      maxImagesPerPost: uploadMaxImagesPerPost(),
    },
  };
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`요청 시간 초과 (${timeoutMs}ms)`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const MAGIC: Array<{ mime: string; test: (buf: Buffer) => boolean }> = [
  { mime: "image/jpeg", test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mime: "image/gif",
    test: (b) =>
      b.length >= 6 &&
      b[0] === 0x47 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x38 &&
      (b[4] === 0x39 || b[4] === 0x37) &&
      b[5] === 0x61,
  },
  {
    mime: "image/webp",
    test: (b) =>
      b.length >= 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
  },
];

export function detectImageMime(buffer: Buffer): string | null {
  for (const entry of MAGIC) {
    if (entry.test(buffer)) return entry.mime;
  }
  return null;
}

export function assertAllowedImage(buffer: Buffer, declaredType: string) {
  const detected = detectImageMime(buffer);
  const declared = (declaredType || "").split(";")[0].trim().toLowerCase();
  const normalizedDeclared =
    declared === "image/jpg"
      ? "image/jpeg"
      : declared === "image/jpeg" ||
          declared === "image/png" ||
          declared === "image/webp" ||
          declared === "image/gif"
        ? declared
        : "";

  if (detected) {
    if (normalizedDeclared && normalizedDeclared !== detected) {
      throw new Error(
        `선언된 MIME(${declaredType})과 실제 파일(${detected})이 일치하지 않습니다.`,
      );
    }
    return detected;
  }

  // News CDNs sometimes deliver image bodies without standard magic bytes.
  const head = buffer.slice(0, 64).toString("utf8").toLowerCase();
  const looksHtml =
    head.includes("<!doctype") || head.includes("<html") || head.includes("<?xml");
  if (normalizedDeclared && buffer.byteLength >= 2_000 && !looksHtml) {
    return normalizedDeclared;
  }

  throw new Error("이미지 시그니처가 올바르지 않습니다.");
}

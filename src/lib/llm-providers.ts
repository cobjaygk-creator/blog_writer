import {
  allowFallback,
  fetchWithTimeout,
  llmMaxTokens,
  llmTimeoutMs,
} from "@/lib/integrations";
import { getLlmGeminiRuntime, getLlmGptRuntime } from "@/lib/integration-config";
import { applyHeliconeBaseUrl, recordLlmTrace } from "@/lib/llm-trace";
import { recordApiUsage } from "@/lib/usage-meter";

export type DraftProvider = "gpt" | "gemini";

export type DraftProviderConfig = {
  provider: DraftProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type DraftTokenUsage = {
  input: number;
  output: number;
};

/** Sync env-only fallback (tests / status). Prefer resolveDraftProviderConfig. */
export function getDraftProviderConfig(provider: DraftProvider): DraftProviderConfig {
  if (provider === "gemini") {
    return {
      provider,
      apiKey: process.env.LLM_GEMINI_API_KEY?.trim() || "",
      baseUrl: (
        process.env.LLM_GEMINI_BASE_URL?.trim() ||
        "https://generativelanguage.googleapis.com/v1beta/openai"
      ).replace(/\/$/, ""),
      model: process.env.LLM_GEMINI_MODEL?.trim() || "gemini-2.0-flash",
    };
  }
  return {
    provider,
    apiKey: process.env.LLM_GPT_API_KEY?.trim() || process.env.LLM_API_KEY?.trim() || "",
    baseUrl: (
      process.env.LLM_GPT_BASE_URL?.trim() ||
      process.env.LLM_BASE_URL?.trim() ||
      "https://api.openai.com/v1"
    ).replace(/\/$/, ""),
    model:
      process.env.LLM_GPT_MODEL?.trim() || process.env.LLM_MODEL?.trim() || "gpt-4o-mini",
  };
}

export async function resolveDraftProviderConfig(
  provider: DraftProvider,
): Promise<DraftProviderConfig> {
  if (provider === "gemini") {
    const r = await getLlmGeminiRuntime();
    return { provider, apiKey: r.apiKey, baseUrl: r.baseUrl, model: r.model };
  }
  const r = await getLlmGptRuntime();
  return { provider, apiKey: r.apiKey, baseUrl: r.baseUrl, model: r.model };
}

export async function isDraftProviderConfigured(provider: DraftProvider) {
  const cfg = await resolveDraftProviderConfig(provider);
  return Boolean(cfg.apiKey);
}

export type ProviderChatResult = {
  text: string;
  usedFallback: boolean;
  modelId: string;
  tokenUsage?: DraftTokenUsage;
};

/**
 * OpenAI-compatible chat/completions for a specific draft provider.
 */
export async function chatCompletionWithProvider(
  provider: DraftProvider,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options?: { temperature?: number; json?: boolean; maxTokens?: number },
): Promise<ProviderChatResult> {
  const config = await resolveDraftProviderConfig(provider);
  const slot = provider === "gemini" ? "llm_gemini" : "llm_gpt";

  if (!config.apiKey) {
    if (!allowFallback()) {
      throw new Error(
        provider === "gemini"
          ? "LLM_GEMINI_API_KEY가 설정되지 않았습니다."
          : "LLM_GPT_API_KEY(또는 LLM_API_KEY)가 설정되지 않았습니다.",
      );
    }
    return { text: "", usedFallback: true, modelId: config.model };
  }

  const started = Date.now();
  const helicone = applyHeliconeBaseUrl(config.baseUrl);
  const messageChars = messages.reduce((n, m) => n + (m.content?.length || 0), 0);

  try {
    const response = await fetchWithTimeout(
      `${helicone.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          ...helicone.headers,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: options?.temperature ?? 0.4,
          max_tokens: options?.maxTokens ?? llmMaxTokens(),
          response_format: options?.json ? { type: "json_object" } : undefined,
          messages,
        }),
      },
      llmTimeoutMs(),
    );

    if (!response.ok) {
      await recordApiUsage(slot, { success: false }).catch(() => undefined);
      recordLlmTrace({
        provider,
        model: config.model,
        ok: false,
        latencyMs: Date.now() - started,
        messageChars,
        helicone: helicone.enabled,
        error: `http_${response.status}`,
      });
      throw new Error(`${provider} 요청에 실패했습니다. (${response.status})`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      await recordApiUsage(slot, { success: false }).catch(() => undefined);
      recordLlmTrace({
        provider,
        model: config.model,
        ok: false,
        latencyMs: Date.now() - started,
        messageChars,
        helicone: helicone.enabled,
        error: "empty_response",
      });
      throw new Error(`${provider} 응답이 비어 있습니다.`);
    }

    const tokenUsage =
      typeof data.usage?.prompt_tokens === "number" ||
      typeof data.usage?.completion_tokens === "number"
        ? {
            input: Number(data.usage?.prompt_tokens || 0),
            output: Number(data.usage?.completion_tokens || 0),
          }
        : undefined;

    await recordApiUsage(slot, {
      success: true,
      inputUnits: tokenUsage?.input,
      outputUnits: tokenUsage?.output,
    }).catch(() => undefined);

    recordLlmTrace({
      provider,
      model: config.model,
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
      modelId: config.model,
      tokenUsage,
    };
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.includes("요청에 실패") || e.message.includes("비어"))
    ) {
      throw e;
    }
    await recordApiUsage(slot, { success: false }).catch(() => undefined);
    recordLlmTrace({
      provider,
      model: config.model,
      ok: false,
      latencyMs: Date.now() - started,
      messageChars,
      helicone: helicone.enabled,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export function providerDisplayLabel(index: number) {
  return index === 0 ? "버전 A" : "버전 B";
}

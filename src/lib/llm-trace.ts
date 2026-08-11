import { appendFileSync, mkdirSync } from "fs";
import path from "path";

import { logInfo, logWarn } from "@/lib/observability";

export type LlmTraceEvent = {
  at: string;
  provider?: string;
  model?: string;
  ok: boolean;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
  /** Truncated — never full prompts in default mode */
  messageChars?: number;
  helicone?: boolean;
};

function localTraceEnabled() {
  const v = process.env.LLM_TRACE_LOCAL?.trim().toLowerCase();
  if (v === "0" || v === "false") return false;
  if (v === "1" || v === "true") return true;
  return process.env.NODE_ENV !== "production";
}

function heliconeKey() {
  return process.env.HELICONE_API_KEY?.trim() || "";
}

/** Rewrite OpenAI-compatible base URL through Helicone when configured. */
export function applyHeliconeBaseUrl(baseUrl: string): {
  baseUrl: string;
  headers: Record<string, string>;
  enabled: boolean;
} {
  const key = heliconeKey();
  if (!key) {
    return { baseUrl: baseUrl.replace(/\/$/, ""), headers: {}, enabled: false };
  }

  const cleaned = baseUrl.replace(/\/$/, "");
  // Only proxy OpenAI hosts by default — Gemini / custom bases keep direct calls
  // (Helicone custom-target support can be expanded later).
  const isOpenAi = /api\.openai\.com/i.test(cleaned);
  if (!isOpenAi) {
    return { baseUrl: cleaned, headers: {}, enabled: false };
  }

  return {
    baseUrl: "https://oai.helicone.ai/v1",
    headers: {
      "Helicone-Auth": `Bearer ${key}`,
    },
    enabled: true,
  };
}

function writeLocalTrace(event: LlmTraceEvent) {
  if (!localTraceEnabled()) return;
  try {
    const dir = path.join(process.cwd(), ".data", "llm-traces");
    mkdirSync(dir, { recursive: true });
    const day = event.at.slice(0, 10);
    const file = path.join(dir, `${day}.jsonl`);
    appendFileSync(file, `${JSON.stringify(event)}\n`, "utf8");
  } catch (e) {
    logWarn("llm-trace", "failed to write local trace", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export function recordLlmTrace(event: Omit<LlmTraceEvent, "at"> & { at?: string }) {
  const full: LlmTraceEvent = {
    at: event.at || new Date().toISOString(),
    ...event,
  };
  writeLocalTrace(full);
  logInfo("llm-trace", full.ok ? "completion ok" : "completion failed", {
    provider: full.provider,
    model: full.model,
    latencyMs: full.latencyMs,
    inputTokens: full.inputTokens,
    outputTokens: full.outputTokens,
    helicone: full.helicone,
    error: full.error,
  });
}

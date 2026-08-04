import { adminJson, requireAdmin } from "@/lib/admin";
import { jsonError } from "@/lib/api-helpers";
import { fetchWithTimeout } from "@/lib/integrations";
import {
  getLlmGeminiRuntime,
  getLlmGptRuntime,
  getTavilyApiKey,
  getTossKeys,
  getUnsplashAccessKey,
  INTEGRATION_SLOTS,
} from "@/lib/integration-config";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ slot: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { slot } = await params;
  if (!INTEGRATION_SLOTS.some((s) => s.slot === slot)) {
    return jsonError("알 수 없는 연동 슬롯입니다.", 404);
  }

  let ok = false;
  let message = "";

  try {
    if (slot === "llm_gpt") {
      const cfg = await getLlmGptRuntime();
      if (!cfg.apiKey) throw new Error("API 키 없음");
      const res = await fetchWithTimeout(
        `${cfg.baseUrl}/models`,
        { headers: { Authorization: `Bearer ${cfg.apiKey}` } },
        15_000,
      );
      ok = res.ok;
      message = ok ? "GPT 연결 확인" : `HTTP ${res.status}`;
    } else if (slot === "llm_gemini") {
      const cfg = await getLlmGeminiRuntime();
      if (!cfg.apiKey) throw new Error("API 키 없음");
      const res = await fetchWithTimeout(
        `${cfg.baseUrl}/models`,
        { headers: { Authorization: `Bearer ${cfg.apiKey}` } },
        15_000,
      );
      ok = res.ok || res.status === 404;
      message = ok ? "Gemini 키 응답 확인" : `HTTP ${res.status}`;
    } else if (slot === "unsplash") {
      const key = await getUnsplashAccessKey();
      if (!key) throw new Error("Access Key 없음");
      const res = await fetchWithTimeout(
        "https://api.unsplash.com/photos/random",
        { headers: { Authorization: `Client-ID ${key}` } },
        15_000,
      );
      ok = res.ok;
      message = ok ? "Unsplash 연결 확인" : `HTTP ${res.status}`;
    } else if (slot === "tavily") {
      const key = await getTavilyApiKey();
      if (!key) throw new Error("API 키 없음");
      const res = await fetchWithTimeout(
        "https://api.tavily.com/search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: key, query: "test", max_results: 1 }),
        },
        20_000,
      );
      ok = res.ok;
      message = ok ? "Tavily 연결 확인" : `HTTP ${res.status}`;
    } else if (slot === "toss") {
      const keys = await getTossKeys();
      ok = Boolean(keys.secretKey && keys.clientKey);
      message = ok ? "Toss 키 형식 확인(시크릿·클라이언트)" : "키 누락";
    } else {
      ok = true;
      message = "이 슬롯은 수동 확인만 지원합니다.";
    }
  } catch (e) {
    ok = false;
    message = e instanceof Error ? e.message : "검증 실패";
  }

  await prisma.integrationSecret.updateMany({
    where: { slot },
    data: {
      lastVerifiedAt: new Date(),
      lastVerifyOk: ok,
      lastVerifyError: ok ? null : message.slice(0, 300),
    },
  });

  return adminJson({ ok, message });
}

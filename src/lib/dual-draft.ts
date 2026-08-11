import {
  generateBlogDraft,
  type DraftImageSlot,
} from "@/lib/llm";
import {
  resolveDraftProviderConfig,
  type DraftProvider,
  type DraftTokenUsage,
} from "@/lib/llm-providers";
import type { PublishImageInput } from "@/lib/publish-body";
import type { TopicLength } from "@/lib/topic-length";

/** Blog draft input shared by both providers (assembled once by the API). */
export type SharedDraftInput = {
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
  voiceTone?: string | null;
  length?: TopicLength | string | null;
  /** worklog | product — shapes prompt emphasis */
  postMode?: "worklog" | "product" | null;
  /** Formatted web research brief (esp. when images are empty). */
  webResearch?: string | null;
  /** Same-product points distilled from learned source posts (RAG-lite). */
  learnedSupplements?: Array<{
    point: string;
    kind: "process" | "check" | "tip" | "caution" | "other";
  }> | null;
};

export type ParallelDraftResult = {
  provider: DraftProvider;
  modelId: string;
  title: string;
  titleCandidates: string[];
  body: string;
  tokenUsage?: DraftTokenUsage;
  usedFallback: boolean;
  error?: string;
};

export async function generateDraftWithProvider(
  input: SharedDraftInput,
  provider: DraftProvider,
): Promise<ParallelDraftResult> {
  const config = await resolveDraftProviderConfig(provider);
  try {
    const draft = await generateBlogDraft({
      ...input,
      draftProvider: provider,
    });
    return {
      provider,
      modelId: draft.meta.modelId || config.model,
      title: draft.title,
      titleCandidates: draft.titleCandidates,
      body: draft.body,
      usedFallback: draft.meta.usedFallback,
      tokenUsage: draft.meta.tokenUsage,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : `${provider} 초안 생성 실패`;
    console.warn(`[dual-draft] ${provider} failed:`, message);
    return {
      provider,
      modelId: config.model,
      title: "",
      titleCandidates: [],
      body: "",
      usedFallback: false,
      error: message,
    };
  }
}

/**
 * Call GPT + Gemini in parallel. One failure does not discard the other.
 * Context in `input` must already be fully assembled (call once).
 */
export async function generateDraftsInParallel(
  input: SharedDraftInput,
): Promise<ParallelDraftResult[]> {
  console.info("[dual-draft] starting parallel generation (context already assembled)");
  const settled = await Promise.allSettled([
    generateDraftWithProvider(input, "gpt"),
    generateDraftWithProvider(input, "gemini"),
  ]);

  return Promise.all(
    settled.map(async (item, i) => {
      const provider: DraftProvider = i === 0 ? "gpt" : "gemini";
      if (item.status === "fulfilled") return item.value;
      const config = await resolveDraftProviderConfig(provider);
      const message =
        item.reason instanceof Error ? item.reason.message : String(item.reason);
      console.warn(`[dual-draft] ${provider} rejected:`, message);
      return {
        provider,
        modelId: config.model,
        title: "",
        titleCandidates: [],
        body: "",
        usedFallback: false,
        error: message,
      };
    }),
  );
}

/** Generate one or more providers (order preserved). */
export async function generateDraftsForProviders(
  input: SharedDraftInput,
  providers: DraftProvider[],
): Promise<ParallelDraftResult[]> {
  const unique = [...new Set(providers)];
  if (unique.length === 0) return [];
  if (unique.length === 1) {
    return [await generateDraftWithProvider(input, unique[0])];
  }
  console.info(
    `[dual-draft] parallel generation for ${unique.join("+")} (context already assembled)`,
  );
  const settled = await Promise.allSettled(
    unique.map((p) => generateDraftWithProvider(input, p)),
  );
  return Promise.all(
    settled.map(async (item, i) => {
      const provider = unique[i];
      if (item.status === "fulfilled") return item.value;
      const config = await resolveDraftProviderConfig(provider);
      const message =
        item.reason instanceof Error ? item.reason.message : String(item.reason);
      console.warn(`[dual-draft] ${provider} rejected:`, message);
      return {
        provider,
        modelId: config.model,
        title: "",
        titleCandidates: [],
        body: "",
        usedFallback: false,
        error: message,
      };
    }),
  );
}

/** Dual when plan allows; otherwise GPT-only. */
export async function generateDraftsForPlan(
  input: SharedDraftInput,
  dualEnabled: boolean,
): Promise<ParallelDraftResult[]> {
  if (!dualEnabled) {
    console.info("[dual-draft] single-provider generation (GPT)");
    return [await generateDraftWithProvider(input, "gpt")];
  }
  return generateDraftsInParallel(input);
}

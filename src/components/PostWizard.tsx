"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { GenerationProgressModal } from "@/components/GenerationProgressModal";
import { ImageUploadDropzone } from "@/components/ImageUploadDropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BRAND_CAPTION_TONE, captionToneOptions } from "@/lib/caption-tones";
import { USE_DEFAULT_THEME_ID } from "@/lib/default-theme";
import {
  phaseProgressRange,
  wizardUploadTarget,
} from "@/lib/generation-progress";
import { isPostMode, POST_MODE_META, type PostModeId } from "@/lib/post-modes";
import { startGenerationJobClient } from "@/lib/run-generation-job-client";
import {
  getTopicLengthPreset,
  TOPIC_LENGTHS,
  TOPIC_LENGTH_PRESETS,
  type TopicLength,
} from "@/lib/topic-length";

export type WizardBrandOption = {
  id: string;
  name: string;
  learned: boolean;
  brandTone: string | null;
};

type Step = "mode" | "input" | "generate";
type GeneratePhase = "create" | "upload" | "generate";

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "mode", label: "모드" },
  { id: "input", label: "입력" },
  { id: "generate", label: "편집기로 이동" },
];

const MODE_ORDER: PostModeId[] = ["worklog", "topic", "product"];
const LS_MODE = "lastPostMode";
const LS_BRAND = "lastBrandId";
const UPLOAD_CONCURRENCY = 3;

type UsageSnapshot = {
  planCode: string;
  unlimited: boolean;
  suspended?: boolean;
  limits: {
    postsPerMonth: number;
    postsPerDay: number;
    generatesPerDay: number;
    dualGenerationEnabled: boolean;
  };
  usage: {
    postsMonth: { used: number; limit: number };
    generatesToday: { used: number; limit: number };
  };
  canCreatePost: boolean;
  canGenerate: boolean;
};

async function uploadFilesParallel(
  postId: string,
  files: File[],
  autoCaption: boolean,
  onProgress: (done: number, total: number) => void,
): Promise<{ failed: File[] }> {
  const total = files.length;
  let done = 0;
  const failed: File[] = [];

  for (let i = 0; i < files.length; i += UPLOAD_CONCURRENCY) {
    const batch = files.slice(i, i + UPLOAD_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (file) => {
        const form = new FormData();
        form.set("file", file);
        form.set("autoCaption", autoCaption ? "true" : "false");
        const up = await fetch(`/api/posts/${postId}/images`, {
          method: "POST",
          body: form,
        });
        if (!up.ok) {
          const err = (await up.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error || "사진 업로드에 실패했습니다.");
        }
      }),
    );
    results.forEach((r, idx) => {
      done += 1;
      onProgress(done, total);
      if (r.status === "rejected") failed.push(batch[idx]);
    });
  }
  return { failed };
}

export function PostWizard({
  brands,
  initialBrandId,
}: {
  brands: WizardBrandOption[];
  initialBrandId?: string | null;
}) {
  const router = useRouter();

  const defaultBrandId =
    (initialBrandId && brands.some((b) => b.id === initialBrandId) && initialBrandId) ||
    brands[0]?.id ||
    USE_DEFAULT_THEME_ID;

  const [step, setStep] = useState<Step>("mode");
  const [brandId, setBrandId] = useState(defaultBrandId);
  const [mode, setMode] = useState<PostModeId | null>(null);
  const [keyword, setKeyword] = useState("");
  const [topic, setTopic] = useState("");
  const [productHighlights, setProductHighlights] = useState("");
  const [captionTone, setCaptionTone] = useState(BRAND_CAPTION_TONE);
  const [topicLength, setTopicLength] = useState<TopicLength>("medium");
  const [imageCount, setImageCount] = useState(
    getTopicLengthPreset("medium").sectionCount,
  );
  const [useAiImages, setUseAiImages] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [failedUploads, setFailedUploads] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState("글을 준비하고 있어요");
  const [phase, setPhase] = useState<GeneratePhase>("create");
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [retryPostId, setRetryPostId] = useState<string | null>(null);
  const [retrySnapshot, setRetrySnapshot] = useState<{
    mode: PostModeId;
    brandId: string;
    imagesUploaded: boolean;
  } | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [productFactsNudge, setProductFactsNudge] = useState(false);
  const [defaultsReady, setDefaultsReady] = useState(false);

  const usingDefaultTheme = brands.length === 0 || brandId === USE_DEFAULT_THEME_ID;
  const selectedBrand = brands.find((b) => b.id === brandId);
  const toneOptions = useMemo(
    () => captionToneOptions(selectedBrand?.brandTone),
    [selectedBrand?.brandTone],
  );
  const dualEnabled = usage?.unlimited || usage?.limits.dualGenerationEnabled;
  const limitBlocked = Boolean(usage && !usage.unlimited && (!usage.canCreatePost || !usage.canGenerate));

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/me/usage")
      .then((r) => r.json())
      .then((data: UsageSnapshot & { error?: string }) => {
        if (cancelled || data.error) return;
        setUsage(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (defaultsReady) return;
    try {
      const storedMode = localStorage.getItem(LS_MODE);
      const storedBrand = localStorage.getItem(LS_BRAND);
      const nextMode = isPostMode(storedMode) ? storedMode : null;
      if (storedBrand && brands.some((b) => b.id === storedBrand) && !initialBrandId) {
        setBrandId(storedBrand);
      }
      if (nextMode && initialBrandId) {
        setMode(nextMode);
        setStep("input");
      } else if (nextMode) {
        setMode(nextMode);
      }
    } catch {
      /* ignore */
    }
    setDefaultsReady(true);
  }, [brands, defaultsReady, initialBrandId]);

  function persistDefaults(nextMode: PostModeId, nextBrandId: string) {
    try {
      localStorage.setItem(LS_MODE, nextMode);
      if (nextBrandId && nextBrandId !== USE_DEFAULT_THEME_ID) {
        localStorage.setItem(LS_BRAND, nextBrandId);
      }
    } catch {
      /* ignore */
    }
  }

  function goNextFromMode() {
    if (!mode) {
      setError("글 종류를 선택해 주세요.");
      return;
    }
    setError(null);
    persistDefaults(mode, brandId);
    setStep("input");
  }

  function onTopicLengthChange(length: TopicLength) {
    setTopicLength(length);
    setImageCount(getTopicLengthPreset(length).sectionCount);
  }

  function setPhaseStatus(next: GeneratePhase, upload?: { done: number; total: number }) {
    setPhase(next);
    setUploadProgress(upload || null);
    if (next === "create") setStatusLine("글을 준비하고 있어요 · 보통 몇 초");
    else if (next === "upload") {
      setStatusLine(
        upload
          ? `사진을 올리고 있어요 (${upload.done}/${upload.total})`
          : "사진을 올리고 있어요",
      );
    } else {
      setStatusLine(
        mode === "topic"
          ? "주제 조사·이미지·초안을 만들고 있어요 · 보통 30~90초"
          : dualEnabled
            ? "두 버전 초안을 만들고 있어요 · 보통 30~90초"
            : "초안을 만들고 있어요 · 보통 30~90초",
      );
    }
  }

  async function runGenerate(opts?: { skipProductNudge?: boolean; retryFailedOnly?: boolean }) {
    if (!mode) return;

    if (mode === "topic" && topic.trim().length < 2) {
      setError("주제를 2자 이상 입력해 주세요.");
      return;
    }
    if ((mode === "worklog" || mode === "product") && !keyword.trim()) {
      setError(mode === "product" ? "제품명을 입력해 주세요." : "키워드를 입력해 주세요.");
      return;
    }
    if (
      mode === "product" &&
      !productHighlights.trim() &&
      !opts?.skipProductNudge &&
      !productFactsNudge
    ) {
      setProductFactsNudge(true);
      setError(null);
      return;
    }
    if (mode === "worklog" && pendingFiles.length === 0 && !retrySnapshot?.imagesUploaded) {
      const ok = window.confirm(
        "사진 없이도 만들 수 있지만 품질이 떨어질 수 있어요. 계속할까요?",
      );
      if (!ok) return;
    }
    if (limitBlocked) {
      setError("이번 달 포스트 또는 오늘 생성 한도에 도달했어요. 요금제를 확인해 주세요.");
      return;
    }

    setError(null);
    const filesToUpload = opts?.retryFailedOnly
      ? failedUploads.length
        ? failedUploads
        : pendingFiles
      : pendingFiles;
    if (!opts?.retryFailedOnly) setFailedUploads([]);
    setStep("generate");
    setPhaseStatus("create");
    persistDefaults(mode, brandId);

    const createBrandId = usingDefaultTheme ? USE_DEFAULT_THEME_ID : brandId;

    try {
      let postId = retryPostId;
      const canReuse =
        Boolean(postId && retrySnapshot) &&
        retrySnapshot!.mode === mode &&
        retrySnapshot!.brandId === createBrandId;

      if (!canReuse) {
        postId = null;
        setRetryPostId(null);
        setRetrySnapshot(null);
      }

      if (!postId) {
        setPhaseStatus("create");
        const createRes = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandId: createBrandId,
            mode,
            keyword:
              mode === "topic"
                ? topic.trim().slice(0, 120)
                : keyword.trim() || undefined,
            productHighlights:
              mode === "worklog" || mode === "product"
                ? productHighlights.trim() || null
                : null,
            captionTone: captionTone || BRAND_CAPTION_TONE,
          }),
        });
        const createData = (await createRes.json().catch(() => ({}))) as {
          error?: string;
          post?: { id: string };
        };
        if (!createRes.ok || !createData.post) {
          throw new Error(createData.error || "글 생성에 실패했습니다.");
        }
        postId = createData.post.id;
        setRetryPostId(postId);
        setRetrySnapshot({
          mode,
          brandId: createBrandId,
          imagesUploaded: false,
        });
      }

      const alreadyUploaded = Boolean(retrySnapshot?.imagesUploaded && canReuse);
      if (
        (mode === "worklog" || mode === "product") &&
        filesToUpload.length &&
        (!alreadyUploaded || opts?.retryFailedOnly)
      ) {
        const total = filesToUpload.length;
        setPhaseStatus("upload", { done: 0, total });
        const { failed } = await uploadFilesParallel(
          postId,
          filesToUpload,
          mode === "worklog",
          (done, t) => setPhaseStatus("upload", { done, total: t }),
        );
        if (failed.length) {
          setFailedUploads(failed);
          setPendingFiles(failed);
          setRetrySnapshot({
            mode,
            brandId: createBrandId,
            imagesUploaded: failed.length < filesToUpload.length,
          });
          throw new Error(
            `${failed.length}장 업로드에 실패했어요. 실패한 사진만 다시 올릴 수 있어요.`,
          );
        }
        setPendingFiles([]);
        setFailedUploads([]);
        setRetrySnapshot({
          mode,
          brandId: createBrandId,
          imagesUploaded: true,
        });
      }

      setPhaseStatus("generate");
      setStatusLine("편집기로 넘어가 초안을 이어서 만들어요…");
      await startGenerationJobClient(
        postId,
        mode === "topic"
          ? {
              kind: "generate_topic",
              topic: topic.trim(),
              length: topicLength,
              imageCount,
              imageSource: useAiImages ? "ai" : "unsplash",
              replaceImages: true,
            }
          : {
              kind: "generate",
              keyword: keyword.trim(),
              productHighlights: productHighlights.trim() || null,
              captionTone: captionTone || BRAND_CAPTION_TONE,
              length: topicLength,
            },
      );

      setRetryPostId(null);
      setRetrySnapshot(null);
      router.push(`/posts/${postId}?generating=1`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성에 실패했습니다.");
      setStep("input");
    }
  }

  return (
    <div className="space-y-6">
      <Stepper current={step} />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {step === "mode" ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--foreground)]">어떤 글을 만들까요?</h2>
            <p className="mt-1 text-sm text-[color:var(--muted)]">하나만 고르면 돼요.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {MODE_ORDER.map((id) => {
              const meta = POST_MODE_META[id];
              const selected = mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMode(id);
                    setError(null);
                  }}
                  className={`rounded-xl border p-5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-soft)] ${
                    selected
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm"
                      : "border-[var(--border)] bg-white hover:border-[var(--accent)]"
                  }`}
                >
                  <div className="text-base font-semibold text-[color:var(--foreground)]">{meta.title}</div>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">{meta.description}</p>
                  <span className="mt-3 inline-block rounded-full bg-[var(--background)] px-2.5 py-1 text-xs text-[color:var(--muted)]">
                    예: {meta.example}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={goNextFromMode} disabled={!mode}>
              다음
            </Button>
          </div>
        </section>
      ) : null}

      {step === "input" && mode ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--foreground)]">
                {mode === "topic"
                  ? "주제를 적어 주세요"
                  : mode === "product"
                    ? "제품 정보를 알려 주세요"
                    : "키워드와 사진을 준비해 주세요"}
              </h2>
              <p className="mt-1 text-sm text-[color:var(--muted)]">{POST_MODE_META[mode].description}</p>
            </div>
            <button
              type="button"
              className="text-sm text-[color:var(--muted)] underline"
              onClick={() => setStep("mode")}
            >
              모드 변경 · {POST_MODE_META[mode].title}
            </button>
          </div>

          {usage ? (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                limitBlocked
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-[var(--border)] bg-[var(--background)] text-[color:var(--foreground)]"
              }`}
            >
              {usage.unlimited ? (
                <span>한도 없음 (관리자/무제한)</span>
              ) : (
                <>
                  <span>
                    이번 달 포스트 {usage.usage.postsMonth.used}/{usage.usage.postsMonth.limit}
                  </span>
                  <span className="mx-2 text-[var(--border)]">·</span>
                  <span>
                    오늘 생성 {usage.usage.generatesToday.used}/{usage.usage.generatesToday.limit}
                  </span>
                  {!dualEnabled ? (
                    <>
                      <span className="mx-2 text-[var(--border)]">·</span>
                      <span>단일 초안</span>
                    </>
                  ) : null}
                </>
              )}
              {limitBlocked ? (
                <p className="mt-1">
                  한도에 도달했어요.{" "}
                  <Link href="/billing" className="font-medium underline">
                    요금제 보기
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}

          <Label>
            <span>테마</span>
            {brands.length === 0 ? (
              <div className="mt-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[color:var(--foreground)]">
                기본 테마 ·{" "}
                <Link href="/brands/new" className="text-[color:var(--foreground)] underline">
                  테마 만들기
                </Link>
              </div>
            ) : (
              <select
                className="mt-1.5 flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-soft)]"
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {!b.learned ? " (미학습)" : ""}
                  </option>
                ))}
              </select>
            )}
          </Label>

          <Label>
            <span>톤</span>
            <select
              className="mt-1.5 flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-soft)]"
              value={captionTone || BRAND_CAPTION_TONE}
              onChange={(e) => setCaptionTone(e.target.value)}
            >
              {toneOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Label>

          <div>
            <p className="text-sm font-medium text-[color:var(--foreground)]">글 길이</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {TOPIC_LENGTHS.map((id) => {
                const preset = TOPIC_LENGTH_PRESETS[id];
                const selected = topicLength === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onTopicLengthChange(id)}
                    className={`rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-soft)] ${
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-white hover:border-[var(--accent)]"
                    }`}
                  >
                    <div className="text-sm font-semibold text-[color:var(--foreground)]">{preset.label}</div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">{preset.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {mode === "topic" ? (
            <>
              <Label>
                <span>주제</span>
                <Input
                  className="mt-1.5 h-12 text-base"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="예: 현재 주가가 내리는 이유"
                  maxLength={200}
                />
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-sm text-[color:var(--foreground)]">
                  이미지
                  <select
                    className="bg-transparent outline-none"
                    value={imageCount}
                    onChange={(e) => setImageCount(Number(e.target.value) || 3)}
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}장
                      </option>
                    ))}
                  </select>
                </label>
                <span className="rounded-full bg-[var(--background)] px-3 py-1.5 text-sm text-[color:var(--muted)]">
                  {useAiImages
                    ? "AI 그림"
                    : "Unsplash · 한도 초과 시 뉴스 이미지(출처 표시)"}
                </span>
              </div>
              <button
                type="button"
                className="text-xs text-[color:var(--muted)] underline"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? "고급 닫기" : "고급 옵션"}
              </button>
              {showAdvanced ? (
                <label className="flex items-center gap-2 text-sm text-[color:var(--foreground)]">
                  <input
                    type="checkbox"
                    checked={useAiImages}
                    onChange={(e) => setUseAiImages(e.target.checked)}
                  />
                  AI로 그림 그리기 (비용 발생)
                </label>
              ) : null}
            </>
          ) : null}

          {mode === "worklog" || mode === "product" ? (
            <>
              <Label>
                <span>{mode === "product" ? "제품명" : "키워드"}</span>
                <Input
                  className="mt-1.5 h-12 text-base"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder={
                    mode === "product" ? "예: OO 사이드스텝" : "예: AG바디킷 장착 후기"
                  }
                  maxLength={120}
                />
              </Label>
              <div>
                <ImageUploadDropzone
                  label={`사진 ${mode === "worklog" ? "(권장)" : "(선택)"}`}
                  disabled={false}
                  onFiles={(files) => {
                    setPendingFiles(files);
                    setFailedUploads([]);
                    if (retrySnapshot) {
                      setRetrySnapshot({ ...retrySnapshot, imagesUploaded: false });
                    }
                  }}
                />
                {pendingFiles.length ? (
                  <span className="mt-1 block text-xs text-[color:var(--muted)]">
                    {pendingFiles.length}장 선택됨
                    {failedUploads.length
                      ? ` · 실패 ${failedUploads.length}장 (아래 재시도)`
                      : ""}
                  </span>
                ) : retrySnapshot?.imagesUploaded ? (
                  <span className="mt-1 block text-xs text-[color:var(--muted)]">
                    이전에 올린 사진을 그대로 쓰고, 초안만 다시 만듭니다.
                  </span>
                ) : mode === "worklog" ? (
                  <span className="mt-1 block text-xs text-amber-700">
                    사진 없이도 가능하지만 품질이 떨어질 수 있어요.
                  </span>
                ) : null}
              </div>
              {mode === "product" || showAdvanced ? (
                <Label>
                  <span>
                    {mode === "product" ? "제품 특장점 · 스펙" : "제품 특장점 (선택)"}
                  </span>
                  <Textarea
                    rows={3}
                    value={productHighlights}
                    onChange={(e) => {
                      setProductHighlights(e.target.value);
                      if (e.target.value.trim()) setProductFactsNudge(false);
                    }}
                    placeholder={
                      mode === "product"
                        ? "재질, 치수, 호환 차종, 장점 등 — 리뷰 품질에 중요해요"
                        : "알고 있는 장점만 짧게"
                    }
                    maxLength={2000}
                  />
                </Label>
              ) : (
                <button
                  type="button"
                  className="text-xs text-[color:var(--muted)] underline"
                  onClick={() => setShowAdvanced(true)}
                >
                  고급 옵션
                </button>
              )}
              {mode === "product" && productFactsNudge && !productHighlights.trim() ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                  <p className="font-medium">스펙을 보강할까요?</p>
                  <p className="mt-1 text-amber-900/90">
                    특장점·스펙을 적으면 제품 리뷰 품질이 올라가요. 비워도 만들 수는 있어요.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setProductFactsNudge(false);
                        const el = document.querySelector<HTMLTextAreaElement>(
                          "textarea",
                        );
                        el?.focus();
                      }}
                    >
                      스펙 입력하기
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void runGenerate({ skipProductNudge: true })}
                    >
                      이대로 만들기
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="flex justify-between gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setStep("mode")}>
              이전
            </Button>
            <div className="flex flex-wrap gap-2">
              {failedUploads.length && retryPostId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void runGenerate({ retryFailedOnly: true, skipProductNudge: true })}
                >
                  실패 사진만 다시 올리기
                </Button>
              ) : null}
              {retryPostId && retrySnapshot?.imagesUploaded ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={limitBlocked}
                  onClick={() => void runGenerate({ skipProductNudge: true })}
                >
                  사진 유지 · 초안만 다시
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={limitBlocked}
                onClick={() => void runGenerate()}
              >
                {mode === "topic"
                  ? "글 만들기"
                  : mode === "product"
                    ? "리뷰 초안 만들기"
                    : "초안 만들기"}
              </Button>
            </div>
          </div>
          {retryPostId ? (
            <p className="text-xs text-[color:var(--muted)]">
              이전 시도가 있어요. 같은 설정이면 사진은 다시 올리지 않고 초안만 이어서 만듭니다.
            </p>
          ) : null}
        </section>
      ) : null}

      {step === "generate" ? (
        <>
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-16">
              <p className="text-base font-medium text-[color:var(--foreground)]">{statusLine}</p>
              <p className="text-sm text-[color:var(--muted)]">
                {phase === "create"
                  ? "1/3 글 준비 · 몇 초"
                  : phase === "upload"
                    ? `2/3 사진 업로드${uploadProgress ? ` · ${uploadProgress.done}/${uploadProgress.total}` : ""}`
                    : "3/3 초안 생성 · 편집기로 이동 중"}
              </p>
            </CardContent>
          </Card>
          <GenerationProgressModal
            open
            title="글 준비 중"
            statusLine={statusLine}
            target={
              phase === "upload" && uploadProgress
                ? wizardUploadTarget(uploadProgress.done, uploadProgress.total)
                : phaseProgressRange(phase, "wizard").floor
            }
            ceiling={
              phase === "upload" && uploadProgress
                ? Math.min(
                    phaseProgressRange("upload", "wizard").ceiling,
                    wizardUploadTarget(uploadProgress.done, uploadProgress.total) + 4,
                  )
                : phaseProgressRange(phase, "wizard").ceiling
            }
            detail={
              phase === "upload" && uploadProgress
                ? `사진 ${uploadProgress.done}/${uploadProgress.total}`
                : "완료되면 편집 화면에서 초안 생성을 이어갑니다."
            }
          />
        </>
      ) : null}
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((s, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <li key={s.id} className="flex items-center gap-2">
            {i > 0 ? <span className="text-[var(--border)]">—</span> : null}
            <span
              className={
                active
                  ? "rounded-full bg-[var(--accent)] px-3 py-1 font-semibold text-white"
                  : done
                    ? "rounded-full bg-[var(--accent-soft)] px-3 py-1 font-medium text-[var(--accent)]"
                    : "rounded-full bg-[var(--background)] px-3 py-1 text-[color:var(--muted)]"
              }
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

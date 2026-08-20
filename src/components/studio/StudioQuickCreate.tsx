"use client";

import Link from "next/link";
import { FileText, GripVertical, Images } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { GenerationProgressModal } from "@/components/GenerationProgressModal";
import { ImageUploadDropzone } from "@/components/ImageUploadDropzone";
import { LearnedSupplementPanel } from "@/components/studio/LearnedSupplementPanel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BRAND_CAPTION_TONE } from "@/lib/caption-tones";
import { USE_DEFAULT_THEME_ID } from "@/lib/default-theme";
import { phaseProgressRange } from "@/lib/generation-progress";
import { draftImagePromptsBatch } from "@/lib/image-prompt-draft";
import { phaseStatusLabel } from "@/lib/post-generate-job-ui";
import {
  runGenerationJobClient,
  type ClientJob,
} from "@/lib/run-generation-job-client";
import { TOPIC_LENGTH_PRESETS, type TopicLength } from "@/lib/topic-length";
import { cn } from "@/lib/utils";

type BrandOption = {
  id: string;
  name: string;
  learned: boolean;
};

type MediaPath = "with_media" | "without_media";

type UploadedImage = {
  id: string;
  imageUrl: string;
  /** Raw vision scene (kept for re-draft after reorder/upload). */
  visionCaption: string | null;
  prompt: string;
};

type LocalVideo = {
  id: string;
  name: string;
  sizeLabel: string;
};

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

function formatEstimate(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `약 ${s}초`;
  return `약 ${m}분${s > 0 ? ` ${s}초` : ""}`;
}

const LENGTH_OPTIONS: TopicLength[] = ["short", "medium", "long"];

/** Studio create: make a post shell then open the editor (no full wizard). */
export function StudioQuickCreate({
  brands,
  initialBrandId,
  remainingPosts,
  estimatedSeconds,
}: {
  brands: BrandOption[];
  initialBrandId?: string | null;
  remainingPosts?: number | null;
  estimatedSeconds?: number | null;
}) {
  const router = useRouter();
  const [mediaPath, setMediaPath] = useState<MediaPath | null>(null);
  const [brandId, setBrandId] = useState(
    initialBrandId || brands[0]?.id || USE_DEFAULT_THEME_ID,
  );
  const [keyword, setKeyword] = useState("");
  const [notes, setNotes] = useState("");
  const [length, setLength] = useState<TopicLength>("medium");
  const [postId, setPostId] = useState<string | null>(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [videos, setVideos] = useState<LocalVideo[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatePhase, setGeneratePhase] = useState("pending");
  const [generatePhaseLabel, setGeneratePhaseLabel] = useState<string | null>(null);
  const [generateComplete, setGenerateComplete] = useState(false);
  const [useLearnedSupplement, setUseLearnedSupplement] = useState(true);
  const [excludedSupplementPoints, setExcludedSupplementPoints] = useState<string[]>([]);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const withMedia = mediaPath === "with_media";
  const hasMedia = images.length > 0 || videos.length > 0;
  const keywordReady = keyword.trim().length > 0;
  const generateOpen = busy === "generate";
  const generateKind = withMedia ? "generate" : "generate_topic";
  const generateRange = phaseProgressRange(generatePhase, generateKind);

  async function ensurePost(): Promise<string> {
    if (postId) return postId;
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brandId || USE_DEFAULT_THEME_ID,
        mode: "worklog",
        keyword: keyword.trim() || undefined,
        productHighlights: notes.trim() || null,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      post?: { id: string };
    };
    if (!res.ok || !data.post?.id) {
      throw new Error(data.error || "글을 만들지 못했습니다.");
    }
    setPostId(data.post.id);
    return data.post.id;
  }

  async function syncPostFields(id: string) {
    await fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keyword: keyword.trim() || null,
        productHighlights: notes.trim() || null,
        status: "collecting",
      }),
    }).catch(() => undefined);
  }

  async function saveImagePrompt(imageId: string, prompt: string) {
    if (!postId) return;
    const res = await fetch(`/api/posts/${postId}/images/${imageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: prompt.trim() || null }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "이미지 프롬프트 저장 실패");
    }
  }

  function schedulePromptSave(imageId: string, prompt: string) {
    const prev = saveTimers.current.get(imageId);
    if (prev) clearTimeout(prev);
    saveTimers.current.set(
      imageId,
      setTimeout(() => {
        void saveImagePrompt(imageId, prompt).catch((e) => {
          setError(e instanceof Error ? e.message : "프롬프트 저장 실패");
        });
      }, 400),
    );
  }

  function updateImagePrompt(imageId: string, prompt: string) {
    setImages((prev) =>
      prev.map((img) => (img.id === imageId ? { ...img, prompt } : img)),
    );
    schedulePromptSave(imageId, prompt);
  }

  async function persistImageOrder(next: UploadedImage[]) {
    if (!postId || next.length === 0) return;
    const res = await fetch(`/api/posts/${postId}/images/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: next.map((img) => img.id) }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "이미지 순서 저장에 실패했습니다.");
    }
  }

  async function moveImage(fromId: string, toId: string) {
    if (fromId === toId) return;
    const from = images.findIndex((img) => img.id === fromId);
    const to = images.findIndex((img) => img.id === toId);
    if (from < 0 || to < 0) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    const prev = images;
    setImages(next);
    try {
      await persistImageOrder(next);
    } catch (e) {
      setImages(prev);
      setError(e instanceof Error ? e.message : "순서 변경에 실패했습니다.");
    }
  }

  async function applyDraftPrompts(
    postIdValue: string,
    list: UploadedImage[],
  ): Promise<UploadedImage[]> {
    const visionByImageId: Record<string, string> = {};
    for (const img of list) {
      if (img.visionCaption?.trim()) visionByImageId[img.id] = img.visionCaption.trim();
    }
    try {
      const res = await fetch(`/api/posts/${postIdValue}/images/draft-prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keyword.trim(),
          productHighlights: notes.trim() || null,
          overwriteAll: true,
          visionByImageId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        prompts?: Array<{ imageId: string; prompt: string }>;
      };
      if (!res.ok || !data.prompts?.length) {
        const local = draftImagePromptsBatch({
          keyword,
          notes,
          images: list.map((img) => ({
            id: img.id,
            visionCaption: img.visionCaption,
          })),
        });
        const map = new Map(local.map((p) => [p.imageId, p.prompt]));
        return list.map((img) => ({
          ...img,
          prompt: map.get(img.id) || img.prompt,
        }));
      }
      const map = new Map(data.prompts.map((p) => [p.imageId, p.prompt]));
      return list.map((img) => ({
        ...img,
        prompt: map.get(img.id) || img.prompt,
      }));
    } catch {
      const local = draftImagePromptsBatch({
        keyword,
        notes,
        images: list.map((img) => ({
          id: img.id,
          visionCaption: img.visionCaption,
        })),
      });
      const map = new Map(local.map((p) => [p.imageId, p.prompt]));
      return list.map((img) => ({
        ...img,
        prompt: map.get(img.id) || img.prompt,
      }));
    }
  }

  async function uploadImages(files: File[]) {
    if (!keywordReady) {
      setError("이미지 등록 전에 주요 키워드(제목)를 입력해 주세요.");
      return;
    }
    setBusy("upload");
    setError(null);
    try {
      const id = await ensurePost();
      await syncPostFields(id);
      const added: UploadedImage[] = [];
      for (const file of files) {
        const form = new FormData();
        form.set("file", file);
        form.set("autoCaption", "true");
        const up = await fetch(`/api/posts/${id}/images`, { method: "POST", body: form });
        const data = (await up.json().catch(() => ({}))) as {
          error?: string;
          image?: { id: string; imageUrl: string; caption: string | null };
        };
        if (!up.ok || !data.image) {
          throw new Error(data.error || `${file.name} 업로드 실패`);
        }
        added.push({
          id: data.image.id,
          imageUrl: data.image.imageUrl,
          visionCaption: data.image.caption ?? null,
          prompt: "",
        });
      }

      const merged = [...images, ...added];
      const drafted = await applyDraftPrompts(id, merged);
      setImages(drafted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  function addVideos(files: File[]) {
    if (!keywordReady) {
      setError("영상 등록 전에 주요 키워드(제목)를 입력해 주세요.");
      return;
    }
    const next = files
      .filter((f) => f.type.startsWith("video/"))
      .map((f) => ({
        id: `vid-${f.name}-${f.size}-${f.lastModified}`,
        name: f.name,
        sizeLabel: formatBytes(f.size),
      }));
    if (!next.length) {
      setError("이미지(jpeg/png/webp/gif) 또는 영상 파일을 올려 주세요.");
      return;
    }
    setVideos((prev) => {
      const seen = new Set(prev.map((v) => v.id));
      return [...prev, ...next.filter((v) => !seen.has(v.id))];
    });
    setError(null);
  }

  async function handleMixedFiles(files: File[]) {
    if (!keywordReady) {
      setError("이미지 등록 전에 주요 키워드(제목)를 입력해 주세요.");
      return;
    }
    const imgs = files.filter((f) =>
      ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(f.type),
    );
    const vids = files.filter((f) => f.type.startsWith("video/"));
    if (vids.length) addVideos(vids);
    if (imgs.length) await uploadImages(imgs);
    if (!imgs.length && !vids.length) {
      setError("이미지(jpeg/png/webp/gif) 또는 영상 파일을 올려 주세요.");
    }
  }

  async function createTopicAndGenerate() {
    if (!keyword.trim()) {
      setError("주요 키워드(제목)를 입력해 주세요.");
      return;
    }
    setBusy("generate");
    setError(null);
    setGenerateComplete(false);
    setGeneratePhase("research");
    setGeneratePhaseLabel(phaseStatusLabel("research", "generate_topic"));
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: brandId || USE_DEFAULT_THEME_ID,
          mode: "topic",
          keyword: keyword.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        post?: { id: string };
      };
      if (!res.ok || !data.post?.id) {
        throw new Error(data.error || "글을 만들지 못했습니다.");
      }
      const id = data.post.id;
      setPostId(id);

      await runGenerationJobClient({
        postId: id,
        body: {
          kind: "generate_topic",
          topic: keyword.trim(),
          length,
          imageCount: TOPIC_LENGTH_PRESETS[length].sectionCount,
          imageSource: "unsplash",
          replaceImages: true,
        },
        onPhase: (job: ClientJob) => {
          setGeneratePhase(job.phase);
          setGeneratePhaseLabel(phaseStatusLabel(job.phase, job.kind));
        },
      });
      setGenerateComplete(true);
      router.push(`/posts/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "초안 생성에 실패했습니다.");
      setBusy(null);
      setGenerateComplete(false);
      setGeneratePhaseLabel(null);
    }
  }

  async function flushPromptSaves() {
    for (const [imageId, timer] of saveTimers.current) {
      clearTimeout(timer);
      const img = images.find((i) => i.id === imageId);
      if (img) await saveImagePrompt(imageId, img.prompt);
    }
    saveTimers.current.clear();
    // Also ensure every image prompt is persisted
    await Promise.all(images.map((img) => saveImagePrompt(img.id, img.prompt)));
  }

  async function finishWithMedia(generate: boolean) {
    if (!keyword.trim()) {
      setError("주요 키워드를 입력해 주세요.");
      return;
    }
    if (!hasMedia) {
      setError("이미지 또는 영상을 하나 이상 등록해 주세요.");
      return;
    }
    setBusy(generate ? "generate" : "create");
    setError(null);
    setGenerateComplete(false);
    setGeneratePhase("assemble");
    setGeneratePhaseLabel(phaseStatusLabel("assemble", "generate"));
    try {
      const id = await ensurePost();
      await syncPostFields(id);
      await flushPromptSaves();

      if (!generate) {
        router.push(`/posts/${id}`);
        return;
      }

      if (images.length === 0) {
        router.push(`/posts/${id}`);
        return;
      }

      // Same payload path as PostWorkspace "초안 생성"
      await runGenerationJobClient({
        postId: id,
        body: {
          kind: "generate",
          keyword: keyword.trim(),
          productHighlights: notes.trim() || null,
          captionTone: BRAND_CAPTION_TONE,
          length,
          useLearnedSupplement,
          excludedSupplementPoints:
            useLearnedSupplement && excludedSupplementPoints.length
              ? excludedSupplementPoints
              : undefined,
        },
        onPhase: (job: ClientJob) => {
          setGeneratePhase(job.phase);
          setGeneratePhaseLabel(phaseStatusLabel(job.phase, job.kind));
        },
      });
      setGenerateComplete(true);
      router.push(`/posts/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "초안 생성에 실패했습니다.");
      setBusy(null);
      setGenerateComplete(false);
      setGeneratePhaseLabel(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <GenerationProgressModal
        open={generateOpen}
        title="초안 생성 중"
        statusLine={generatePhaseLabel || "생성 준비 중…"}
        target={generateRange.floor}
        ceiling={generateRange.ceiling}
        complete={generateComplete}
        detail={
          withMedia
            ? "테마·키워드·참고 내용·사진 프롬프트를 반영해 초안을 만들고 있습니다."
            : "키워드·테마를 바탕으로 포스트 초안을 만들고 있습니다."
        }
      />

      {mediaPath === null ? (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 p-6">
          <div>
            <h1 className="text-[19px] font-bold text-[var(--foreground)]">어떻게 시작할까요?</h1>
            <p className="mt-1 text-[12.5px] text-[var(--muted)]">
              사진·영상 유무에 따라 다음 단계가 달라져요.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMediaPath("with_media")}
              className="flex flex-col items-start gap-3 rounded-[12px] border border-[var(--border)] bg-white p-5 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[var(--accent-soft)] text-[var(--accent)]">
                <Images className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </span>
              <span className="text-[14px] font-bold text-[var(--foreground)]">사진이나 영상이 있어요</span>
              <span className="text-[11.5px] leading-[1.6] text-[var(--muted)]">
                키워드·참고 내용을 적고 사진 프롬프트를 준비한 뒤 초안을 만듭니다.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMediaPath("without_media")}
              className="flex flex-col items-start gap-3 rounded-[12px] border border-[var(--border)] bg-white p-5 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[var(--surface-2)] text-[var(--muted)]">
                <FileText className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </span>
              <span className="text-[14px] font-bold text-[var(--foreground)]">사진이나 영상이 없어요</span>
              <span className="text-[11.5px] leading-[1.6] text-[var(--muted)]">
                키워드만으로 블로그 포스트를 쓰고, 필요하면 이미지를 찾아 붙입니다.
              </span>
            </button>
          </div>
        </div>
      ) : (
        <>
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--border)] bg-white px-5">
        <button
          type="button"
          onClick={() => setMediaPath(null)}
          className="text-[13.5px] font-bold text-[var(--foreground)] hover:text-[var(--accent)]"
          title="처음부터 다시 선택"
        >
          글 만들기
        </button>
        <div className="ml-auto flex gap-[3px] rounded-[9px] bg-[var(--surface-2)] p-[3px]">
          <button
            type="button"
            onClick={() => setMediaPath("with_media")}
            className={cn(
              "flex h-[29px] items-center justify-center rounded-[7px] px-3.5 text-[12px] font-semibold",
              withMedia ? "bg-white text-[var(--foreground)] shadow-[0_1px_2px_rgba(0,0,0,.06)]" : "text-[#8A8A94]",
            )}
          >
            사진 있음
          </button>
          <button
            type="button"
            onClick={() => setMediaPath("without_media")}
            className={cn(
              "flex h-[29px] items-center justify-center rounded-[7px] px-3.5 text-[12px] font-semibold",
              !withMedia ? "bg-white text-[var(--foreground)] shadow-[0_1px_2px_rgba(0,0,0,.06)]" : "text-[#8A8A94]",
            )}
          >
            글만
          </button>
        </div>
      </div>

      {!withMedia ? (
        <div className="mx-auto w-full max-w-xl flex-1 space-y-4 p-6">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold tracking-[.04em] text-[var(--faint)]">테마</span>
            <div className="flex flex-wrap gap-[7px]">
              <BrandChip
                label="기본 테마"
                selected={brandId === USE_DEFAULT_THEME_ID}
                disabled={Boolean(postId)}
                onClick={() => setBrandId(USE_DEFAULT_THEME_ID)}
              />
              {brands.map((b) => (
                <BrandChip
                  key={b.id}
                  label={b.name}
                  learned={b.learned}
                  selected={brandId === b.id}
                  disabled={Boolean(postId)}
                  onClick={() => setBrandId(b.id)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold tracking-[.04em] text-[var(--faint)]">주요 키워드</span>
            <div className="flex h-11 items-center gap-2.5 rounded-[10px] border border-[var(--border)] bg-white px-3.5 focus-within:border-[#16161A] focus-within:shadow-[0_0_0_3px_rgba(22,22,26,.06)]">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="예: 현재 주가가 내리는 이유"
                maxLength={120}
                className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-semibold text-[var(--foreground)] outline-none placeholder:font-normal placeholder:text-[var(--hint)]"
              />
              <span className="[font-variant-numeric:tabular-nums] shrink-0 text-[11px] text-[var(--hint)]">
                {keyword.length} / 120
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold tracking-[.04em] text-[var(--faint)]">글 길이</span>
            <div className="flex flex-wrap gap-[7px]">
              {LENGTH_OPTIONS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLength(id)}
                  className={cn(
                    "flex h-8 items-center rounded-[8px] border px-3 text-[12.5px] font-semibold transition-colors",
                    length === id
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--border-strong)]",
                  )}
                >
                  {TOPIC_LENGTH_PRESETS[id].label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p className="rounded-[8px] border border-[#F7E7E5] bg-[#F7E7E5] px-3 py-2 text-[12.5px] text-[#C2453C]">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={busy !== null || !keyword.trim()}
            onClick={() => void createTopicAndGenerate()}
          >
            {busy === "generate" ? "초안 생성 중…" : "초안 생성"}
          </Button>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-[18px] overflow-y-auto p-[24px_26px]">
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold tracking-[.04em] text-[var(--faint)]">01 · 테마</span>
              <div className="flex flex-wrap gap-[7px]">
                <BrandChip
                  label="기본 테마"
                  selected={brandId === USE_DEFAULT_THEME_ID}
                  disabled={Boolean(postId)}
                  onClick={() => setBrandId(USE_DEFAULT_THEME_ID)}
                />
                {brands.map((b) => (
                  <BrandChip
                    key={b.id}
                    label={b.name}
                    learned={b.learned}
                    selected={brandId === b.id}
                    disabled={Boolean(postId)}
                    onClick={() => setBrandId(b.id)}
                  />
                ))}
                <Link
                  href="/brands/new"
                  className="flex h-8 items-center rounded-[8px] border border-dashed border-[var(--border-strong)] px-3 text-[12.5px] font-semibold text-[#8A8A94] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  + 테마 추가
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold tracking-[.04em] text-[var(--faint)]">02 · 키워드 (제목)</span>
              <div className="flex h-11 items-center gap-2.5 rounded-[10px] border border-[var(--border)] bg-white px-3.5 focus-within:border-[#16161A] focus-within:shadow-[0_0_0_3px_rgba(22,22,26,.06)]">
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="예: 쏘렌토 MQ4 고토 루프박스"
                  maxLength={120}
                  className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-semibold text-[var(--foreground)] outline-none placeholder:font-normal placeholder:text-[var(--hint)]"
                />
                <span className="[font-variant-numeric:tabular-nums] shrink-0 text-[11px] text-[var(--hint)]">
                  {keyword.length} / 120
                </span>
              </div>
              <span className="text-[11px] text-[var(--faint)]">이미지 등록 전에 반드시 입력해야 합니다.</span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold tracking-[.04em] text-[var(--faint)]">03 · 사진</span>
                <span className="text-[11px] text-[var(--hint)]">
                  순서대로 본문에 배치됩니다{images.length > 1 ? " · 드래그로 정렬" : ""}
                </span>
                <span className="[font-variant-numeric:tabular-nums] ml-auto text-[11px] font-semibold text-[var(--muted)]">
                  {images.length + videos.length}
                </span>
              </div>

              {!hasMedia ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[11px] border border-dashed border-[var(--border-strong)] bg-white px-4 py-10 text-center">
                  <p className="text-[13px] font-semibold text-[var(--foreground)]">
                    등록된 미디어가 여기에 표시됩니다
                  </p>
                  <p className="text-[11.5px] text-[var(--muted)]">
                    키워드 입력 후 이미지를 올리면 오른쪽에서 프롬프트를 수정할 수 있어요
                  </p>
                  <div className="w-full max-w-xs">
                    <ImageUploadDropzone
                      disabled={busy === "upload" || !keywordReady}
                      label=""
                      onFiles={(files) => void handleMixedFiles(files)}
                    />
                  </div>
                  {!keywordReady ? (
                    <p className="text-[11px] text-[#8A6410]">
                      주요 키워드(제목)를 입력하면 이미지를 등록할 수 있어요.
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2.5">
                    {images.map((img, i) => (
                      <div
                        key={img.id}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragId) void moveImage(dragId, img.id);
                          setDragId(null);
                        }}
                        className={cn(
                          "flex flex-col overflow-hidden rounded-[10px] border bg-white",
                          dragId === img.id && "opacity-50",
                          dragId && dragId !== img.id ? "border-[var(--accent)]" : "border-[var(--border)]",
                        )}
                      >
                        <div
                          className="group relative h-[92px] shrink-0 cursor-grab bg-[var(--surface-2)] active:cursor-grabbing"
                          draggable={busy === null}
                          onDragStart={() => setDragId(img.id)}
                          onDragEnd={() => setDragId(null)}
                          title="드래그하여 순서 변경"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                          <span className="[font-variant-numeric:tabular-nums] absolute left-1.5 top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-[rgba(22,22,26,.78)] text-[10px] font-bold text-white">
                            {i + 1}
                          </span>
                          <GripVertical className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-white/70 opacity-0 group-hover:opacity-100" />
                        </div>
                        <div className="flex flex-col gap-0.5 border-t border-[#F0F0F3] p-2">
                          <span className="text-[10px] font-bold tracking-[.02em] text-[var(--accent)]">
                            AI 캡션
                          </span>
                          <textarea
                            value={img.prompt}
                            onChange={(e) => updateImagePrompt(img.id, e.target.value)}
                            placeholder="장면 키워드 (자동 초안 후 수정 가능)"
                            rows={2}
                            maxLength={2000}
                            className="resize-none border-0 bg-transparent text-[11px] leading-[1.4] text-[var(--muted)] outline-none placeholder:text-[var(--hint)]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {videos.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {videos.map((vid) => (
                        <div
                          key={vid.id}
                          className="flex items-center gap-2.5 rounded-[8px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-[#E4E4E9] text-[9px] font-bold text-[#6B6B75]">
                            VIDEO
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11.5px] font-medium text-[var(--foreground)]">
                              {vid.name}
                            </p>
                            <p className="text-[10.5px] text-[var(--faint)]">
                              {vid.sizeLabel} · 쇼츠는 New Cut에서
                            </p>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 text-[11px] text-[var(--faint)] hover:text-[#C2453C]"
                            onClick={() => setVideos((prev) => prev.filter((v) => v.id !== vid.id))}
                          >
                            제거
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="w-[220px]">
                      <ImageUploadDropzone
                        disabled={busy === "upload" || !keywordReady}
                        label=""
                        onFiles={(files) => void handleMixedFiles(files)}
                      />
                    </div>
                    <label
                      className={cn(
                        "flex h-[36px] items-center rounded-[8px] border border-[var(--border)] bg-white px-3 text-[11.5px] font-medium",
                        keywordReady
                          ? "cursor-pointer text-[var(--muted)] hover:border-[var(--border-strong)]"
                          : "cursor-not-allowed text-[var(--hint)]",
                      )}
                    >
                      영상 추가
                      <input
                        type="file"
                        accept="video/*"
                        multiple
                        className="hidden"
                        disabled={busy === "upload" || !keywordReady}
                        onChange={(e) => {
                          const files = e.target.files ? [...e.target.files] : [];
                          if (files.length) addVideos(files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {postId ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        className="text-[11.5px] font-medium text-[var(--accent)] hover:underline disabled:opacity-40"
                        onClick={() => {
                          void (async () => {
                            setBusy("upload");
                            setError(null);
                            try {
                              const drafted = await applyDraftPrompts(postId, images);
                              setImages(drafted);
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "프롬프트 초안을 다시 만들지 못했습니다.",
                              );
                            } finally {
                              setBusy(null);
                            }
                          })();
                        }}
                      >
                        프롬프트 다시 만들기
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            {error ? (
              <p className="rounded-[8px] border border-[#F7E7E5] bg-[#F7E7E5] px-3 py-2 text-[12.5px] text-[#C2453C]">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-col border-l border-[var(--border)] bg-white">
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-[18px] pb-0">
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-bold tracking-[.04em] text-[var(--faint)]">분량</span>
                <div className="flex gap-1.5">
                  {LENGTH_OPTIONS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setLength(id)}
                      className={cn(
                        "flex h-[30px] flex-1 items-center justify-center rounded-[8px] border text-[12px] font-semibold",
                        length === id
                          ? "border-[#16161A] bg-[#16161A] text-white"
                          : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--border-strong)]",
                      )}
                    >
                      {TOPIC_LENGTH_PRESETS[id].label}
                    </button>
                  ))}
                </div>
                <span className="[font-variant-numeric:tabular-nums] text-[10.5px] text-[var(--hint)]">
                  {TOPIC_LENGTH_PRESETS[length].hint}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-bold tracking-[.04em] text-[var(--faint)]">참고 메모</span>
                <Textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="제품 특장점, 생성 시 필요한 키워드나 문장을 입력해 주세요."
                  maxLength={2000}
                  className="text-[12px]"
                />
              </div>

              {images.length > 0 ? (
                <LearnedSupplementPanel
                  postId={postId}
                  keyword={keyword}
                  productHighlights={notes}
                  imagePrompts={images.map((img) => img.prompt || "")}
                  enabled={useLearnedSupplement}
                  onEnabledChange={setUseLearnedSupplement}
                  excludedPoints={excludedSupplementPoints}
                  onExcludedChange={setExcludedSupplementPoints}
                />
              ) : null}
            </div>

            <div className="flex flex-col gap-2 border-t border-[var(--border)] p-[14px_18px]">
              <div className="flex items-center text-[11.5px]">
                <span className="text-[var(--muted)]">예상 소요</span>
                <span className="[font-variant-numeric:tabular-nums] ml-auto font-semibold text-[var(--foreground)]">
                  {estimatedSeconds ? formatEstimate(estimatedSeconds) : "정보 없음"}
                </span>
              </div>
              <div className="flex items-center text-[11.5px]">
                <span className="text-[var(--muted)]">남은 생성</span>
                <span className="[font-variant-numeric:tabular-nums] ml-auto font-semibold text-[var(--foreground)]">
                  {remainingPosts == null ? "무제한" : `${remainingPosts}회`}
                </span>
              </div>
              <Button
                type="button"
                size="lg"
                className="mt-1 w-full"
                disabled={busy !== null || !hasMedia}
                onClick={() => void finishWithMedia(true)}
              >
                {busy === "generate" ? "초안 생성 중…" : "초안 생성하기"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={busy !== null}
                onClick={() => void finishWithMedia(false)}
              >
                편집기만 열기
              </Button>
              <p className="text-center text-[10.5px] text-[var(--hint)]">
                생성 중에도 다른 화면을 쓸 수 있어요
              </p>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

function BrandChip({
  label,
  selected,
  disabled,
  learned,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  learned?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-[8px] border px-3 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-60",
        selected
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
          : "border-[var(--border)] bg-white text-[#3A3A44] hover:border-[var(--border-strong)]",
      )}
    >
      {label}
      {learned === false ? (
        <span className="text-[10px] font-bold text-[#8A6410]">미학습</span>
      ) : null}
    </button>
  );
}

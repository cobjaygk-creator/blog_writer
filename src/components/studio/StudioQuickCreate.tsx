"use client";

import { GripVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { GenerationProgressModal } from "@/components/GenerationProgressModal";
import { ImageUploadDropzone } from "@/components/ImageUploadDropzone";
import { LearnedSupplementPanel } from "@/components/studio/LearnedSupplementPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/** Studio create: make a post shell then open the editor (no full wizard). */
export function StudioQuickCreate({
  brands,
  initialBrandId,
}: {
  brands: BrandOption[];
  initialBrandId?: string | null;
}) {
  const router = useRouter();
  const [mediaPath, setMediaPath] = useState<MediaPath>("with_media");
  const [brandId, setBrandId] = useState(
    initialBrandId || brands[0]?.id || USE_DEFAULT_THEME_ID,
  );
  const [keyword, setKeyword] = useState("");
  const [notes, setNotes] = useState("");
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
  const generateRange = phaseProgressRange(generatePhase, "generate");

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

  async function createTopicAndOpen() {
    setBusy("create");
    setError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: brandId || USE_DEFAULT_THEME_ID,
          mode: "topic",
          keyword: keyword.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        post?: { id: string };
      };
      if (!res.ok || !data.post?.id) {
        throw new Error(data.error || "글을 만들지 못했습니다.");
      }
      router.push(`/posts/${data.post.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "글을 만들지 못했습니다.");
      setBusy(null);
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
          length: "medium",
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
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
      <GenerationProgressModal
        open={generateOpen}
        title="초안 생성 중"
        statusLine={generatePhaseLabel || "생성 준비 중…"}
        target={generateRange.floor}
        ceiling={generateRange.ceiling}
        complete={generateComplete}
        detail="테마·키워드·참고 내용·사진 프롬프트를 반영해 초안을 만들고 있습니다."
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">만들기</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          재료가 있는지부터 고른 뒤, 편집기에서 이어갑니다.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMediaPath("with_media")}
          className={cn(
            "rounded-xl border px-4 py-4 text-left transition-colors",
            withMedia
              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
              : "border-[var(--border)] bg-white hover:bg-[var(--background)]",
          )}
        >
          <p className="text-sm font-semibold">사진이나 영상이 있어요</p>
          <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--muted)]">
            키워드·참고 내용을 적고 미디어·사진 프롬프트를 준비한 뒤 초안을 만듭니다.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setMediaPath("without_media")}
          className={cn(
            "rounded-xl border px-4 py-4 text-left transition-colors",
            !withMedia
              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
              : "border-[var(--border)] bg-white hover:bg-[var(--background)]",
          )}
        >
          <p className="text-sm font-semibold">사진이나 영상이 없어요</p>
          <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--muted)]">
            주제만으로 정보글을 쓰고, 필요하면 이미지를 찾아 붙입니다.
          </p>
        </button>
      </div>

      <Label>
        <span>테마</span>
        <select
          className="mt-1.5 flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          disabled={Boolean(postId)}
        >
          <option value={USE_DEFAULT_THEME_ID}>기본 테마</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {b.learned ? "" : " (미학습)"}
            </option>
          ))}
        </select>
      </Label>

      {!withMedia ? (
        <div className="max-w-xl space-y-4">
          <Label>
            <span>주요 키워드</span>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="예: 현재 주가가 내리는 이유"
              maxLength={120}
            />
          </Label>
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            className="w-full"
            disabled={busy !== null}
            onClick={() => void createTopicAndOpen()}
          >
            {busy ? "문서 여는 중…" : "편집기에서 이어가기"}
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Label>
              <span>주요 키워드 (제목)</span>
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="예: 쏘렌토 MQ4 고토 루프박스"
                maxLength={120}
              />
              <span className="mt-1 block text-xs font-normal text-[color:var(--muted)]">
                이미지 등록 전에 반드시 입력해야 합니다.
              </span>
            </Label>

            <Label>
              <span>생성에 참고할 내용</span>
              <Textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="제품 특장점, 생성 시 필요한 키워드나 문장을 입력해 주세요."
                maxLength={2000}
              />
            </Label>

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

            <div>
              <ImageUploadDropzone
                disabled={busy === "upload" || !keywordReady}
                label="이미지 등록"
                onFiles={(files) => void handleMixedFiles(files)}
              />
              {!keywordReady ? (
                <p className="mt-1.5 text-xs text-amber-700">
                  주요 키워드(제목)를 입력하면 이미지를 등록할 수 있어요.
                </p>
              ) : null}
              <label
                className={cn(
                  "mt-2 flex items-center justify-center rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs",
                  keywordReady
                    ? "cursor-pointer text-[color:var(--muted)] hover:bg-[var(--background)]"
                    : "cursor-not-allowed text-[color:var(--muted)] opacity-50",
                )}
              >
                영상 파일 추가 (목록에만 표시 · 쇼츠는 New Cut)
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
            </div>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
          </div>

          <div className="min-h-[20rem] rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
            {!hasMedia ? (
              <div className="flex h-full min-h-[18rem] flex-col items-center justify-center px-4 text-center">
                <p className="text-sm font-medium text-[color:var(--foreground)]">
                  등록된 미디어가 여기에 표시됩니다
                </p>
                <p className="mt-2 text-xs text-[color:var(--muted)]">
                  키워드 입력 후 이미지를 올리면, 오른쪽에 사진 프롬프트를 수정할 수 있어요.
                </p>
              </div>
            ) : (
              <div className="flex h-full min-h-[18rem] flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">등록된 미디어</p>
                    <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                      이미지 {images.length} · 영상 {videos.length}
                      {images.length > 1 ? " · 드래그로 순서 변경" : ""}
                    </p>
                  </div>
                  {images.length > 0 && postId ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      className="shrink-0 text-xs font-medium text-[var(--accent)] hover:underline disabled:opacity-40"
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

                <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                  {images.map((img, i) => (
                    <li
                      key={img.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragId) void moveImage(dragId, img.id);
                        setDragId(null);
                      }}
                      className={cn(
                        "rounded-lg border border-[var(--border)] bg-white p-2",
                        dragId === img.id && "opacity-50",
                        dragId && dragId !== img.id && "border-[var(--accent)]",
                      )}
                    >
                      <div className="flex gap-2">
                        <button
                          type="button"
                          draggable={busy === null}
                          onDragStart={() => setDragId(img.id)}
                          onDragEnd={() => setDragId(null)}
                          className="mt-6 shrink-0 cursor-grab text-[color:var(--muted)] active:cursor-grabbing"
                          title="드래그하여 순서 변경"
                          aria-label="순서 변경"
                        >
                          <GripVertical className="h-4 w-4" />
                        </button>
                        <div className="flex w-16 shrink-0 flex-col items-stretch gap-1">
                          <p className="text-center text-[11px] font-medium leading-tight">
                            이미지 {i + 1}
                          </p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.imageUrl}
                            alt=""
                            className="h-16 w-16 rounded-md object-cover"
                            draggable={false}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <label className="text-[11px] font-medium text-[color:var(--muted)]">
                            사진 프롬프트
                            <Textarea
                              rows={3}
                              value={img.prompt}
                              onChange={(e) => updateImagePrompt(img.id, e.target.value)}
                              placeholder="시공 순서·장면 키워드 (자동 초안 후 수정 가능)"
                              className="mt-1 text-xs"
                              maxLength={2000}
                            />
                          </label>
                        </div>
                      </div>
                    </li>
                  ))}
                  {videos.map((vid) => (
                    <li
                      key={vid.id}
                      className="flex gap-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] p-2"
                    >
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-zinc-200 text-[10px] font-medium text-zinc-600">
                        VIDEO
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{vid.name}</p>
                        <p className="mt-0.5 text-[11px] text-[color:var(--muted)]">
                          {vid.sizeLabel} · 쇼츠는 New Cut에서
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-[11px] text-[color:var(--muted)] hover:text-red-600"
                        onClick={() =>
                          setVideos((prev) => prev.filter((v) => v.id !== vid.id))
                        }
                      >
                        제거
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={busy !== null}
                    onClick={() => void finishWithMedia(true)}
                  >
                    {busy === "generate" ? "초안 생성 중…" : "초안 생성"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={busy !== null}
                    onClick={() => void finishWithMedia(false)}
                  >
                    편집기만 열기
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { ImageGalleryBoard } from "@/components/ImageGalleryBoard";
import { ImageUploadDropzone } from "@/components/ImageUploadDropzone";
import { RichEditor } from "@/components/RichEditor";
import { PostWorkspaceStudioView } from "@/components/studio/PostWorkspaceStudioView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { copyHtmlForBlogEditor } from "@/lib/clipboard";
import { ensureImagesInHtml, htmlToPlainText, toEditorHtml } from "@/lib/content";
import {
  BRAND_CAPTION_TONE,
  captionToneOptions,
} from "@/lib/caption-tones";
import { attachToSlotLayout, imagesToSlots } from "@/lib/image-slots";
import { GenerationProgressModal } from "@/components/GenerationProgressModal";
import { NewCutLink } from "@/components/NewCutLink";
import { phaseProgressRange } from "@/lib/generation-progress";
import { phaseStatusLabel } from "@/lib/post-generate-job-ui";
import { postStatusHint, postStatusLabel } from "@/lib/post-status";
import {
  resumeActiveGenerationJob,
  runGenerationJobClient,
  type ClientJob,
} from "@/lib/run-generation-job-client";
import { isStudioUiEnabled } from "@/lib/studio-ui";
import { applyTemplateToBody, type TemplateKind } from "@/lib/templates";
import {
  TOPIC_LENGTHS,
  TOPIC_LENGTH_PRESETS,
  type TopicLength,
} from "@/lib/topic-length";

type PostImage = {
  id: string;
  imageUrl: string;
  caption: string | null;
  orderIndex: number;
  groupId?: string | null;
};

type BrandTemplateOption = {
  id: string;
  name: string;
  kind: TemplateKind;
  html: string;
};

type CandidateDraft = {
  id: string;
  provider: string;
  modelId?: string;
  title: string | null;
  titleCandidates?: unknown;
  body: string;
  isSelected?: boolean;
  label?: string;
};

type StyleMetaEntry = {
  score?: number;
  repaired?: boolean;
  issues?: string[];
};

type SeoMetaEntry = {
  score?: number;
  repaired?: boolean;
  issues?: string[];
  heuristic?: boolean;
};

type PostData = {
  id: string;
  brandId: string;
  mode?: string | null;
  title: string | null;
  titleCandidates: unknown;
  body: string | null;
  keyword: string | null;
  productHighlights?: string | null;
  captionTone?: string | null;
  status: string;
  publishedUrl?: string | null;
  publishedAt?: string | null;
  publishPlatform?: string | null;
  headerTemplateId?: string | null;
  footerTemplateId?: string | null;
  images: PostImage[];
  brand: { id: string; name: string };
  drafts?: CandidateDraft[];
};

function imageInputs(images: PostImage[]) {
  return images.map((img) => ({ imageUrl: img.imageUrl, caption: img.caption }));
}

export function PostWorkspace({
  initialPost,
  templates = [],
  brandTone = null,
}: {
  initialPost: PostData;
  templates?: BrandTemplateOption[];
  brandTone?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [post, setPost] = useState(initialPost);
  const [keyword, setKeyword] = useState(initialPost.keyword || "");
  const [captionTone, setCaptionTone] = useState(
    initialPost.captionTone || BRAND_CAPTION_TONE,
  );
  const [productHighlights, setProductHighlights] = useState(
    initialPost.productHighlights || "",
  );
  const [useLearnedSupplement, setUseLearnedSupplement] = useState(true);
  const [excludedSupplementPoints, setExcludedSupplementPoints] = useState<string[]>([]);
  const [draftLength, setDraftLength] = useState<TopicLength>("medium");
  const [topicImageCount, setTopicImageCount] = useState(3);
  const [topicUseAiImages, setTopicUseAiImages] = useState(false);
  const [topicReplaceImages, setTopicReplaceImages] = useState(false);
  const [styleMeta, setStyleMeta] = useState<Record<string, StyleMetaEntry> | null>(null);
  const [seoMeta, setSeoMeta] = useState<Record<string, SeoMetaEntry> | null>(null);
  const [failedProviders, setFailedProviders] = useState<string[]>([]);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishUrlInput, setPublishUrlInput] = useState("");
  const [publishPlatform, setPublishPlatform] = useState<"naver" | "tistory" | "other">("naver");
  const [title, setTitle] = useState(initialPost.title || "");
  const [body, setBody] = useState(() =>
    toEditorHtml(
      initialPost.body || "",
      imageInputs(initialPost.images),
      initialPost.images,
    ),
  );
  const [headerTemplateId, setHeaderTemplateId] = useState(initialPost.headerTemplateId || "");
  const [footerTemplateId, setFooterTemplateId] = useState(initialPost.footerTemplateId || "");
  const [error, setError] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [showCopyGuide, setShowCopyGuide] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<"edit" | "preview">("edit");
  const [editorRevision, setEditorRevision] = useState(0);
  const [candidateDrafts, setCandidateDrafts] = useState<CandidateDraft[]>(() => {
    const drafts = initialPost.drafts || [];
    const unselected = drafts.filter((d) => d.body?.trim() && !d.isSelected);
    if (unselected.length >= 2 && !initialPost.body?.trim()) {
      return unselected.map((d, i) => ({
        ...d,
        label: d.label || (i === 0 ? "버전 A" : "버전 B"),
      }));
    }
    return [];
  });
  const [needsSelection, setNeedsSelection] = useState(
    () => (initialPost.drafts || []).filter((d) => d.body?.trim() && !d.isSelected).length >= 2 &&
      !initialPost.body?.trim(),
  );
  const [selectingDraftId, setSelectingDraftId] = useState<string | null>(null);
  const [dualFailNotice, setDualFailNotice] = useState<string | null>(null);
  const [generatePhaseLabel, setGeneratePhaseLabel] = useState<string | null>(null);
  const [generatePhase, setGeneratePhase] = useState<string>("pending");
  const [generateKind, setGenerateKind] =
    useState<ClientJob["kind"]>("generate");
  const [generateComplete, setGenerateComplete] = useState(false);

  function noteGeneratePhase(job: Pick<ClientJob, "phase" | "kind">) {
    setGenerateKind(job.kind);
    setGeneratePhase(job.phase);
    setGeneratePhaseLabel(phaseStatusLabel(job.phase, job.kind));
  }

  function clearGenerateUi() {
    setGeneratePhaseLabel(null);
    setGeneratePhase("pending");
    setGenerateComplete(false);
  }
  const [snapshotBeforeCompare, setSnapshotBeforeCompare] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const prevBusyRef = useRef(busy);
  const resumeTriedRef = useRef(false);

  useEffect(() => {
    const wasGenerating = prevBusyRef.current === "generate";
    prevBusyRef.current = busy;
    if (wasGenerating && busy === null) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (needsSelection) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [busy, needsSelection]);

  useEffect(() => {
    if (resumeTriedRef.current) return;
    resumeTriedRef.current = true;
    const wantGenerate = searchParams.get("generating") === "1";
    let cancelled = false;
    void (async () => {
      try {
        const peek = await fetch(`/api/posts/${initialPost.id}/generate-jobs/active`);
        const peekData = (await peek.json().catch(() => ({}))) as {
          job?: { id: string } | null;
        };
        if (cancelled) return;
        if (!peekData.job) {
          if (wantGenerate) {
            router.replace(`/posts/${initialPost.id}`);
          }
          return;
        }

        setBusy("generate");
        setGenerateComplete(false);
        setGeneratePhase("pending");
        setGenerateKind(
          initialPost.mode === "topic" ? "generate_topic" : "generate",
        );
        setGeneratePhaseLabel(
          wantGenerate ? "초안 생성 시작…" : "이전 생성 이어서 진행 중…",
        );
        const job = await resumeActiveGenerationJob(initialPost.id, {
          onPhase: (j) => {
            if (cancelled) return;
            noteGeneratePhase(j);
          },
        });
        if (cancelled || !job) {
          if (!cancelled) {
            setBusy(null);
            clearGenerateUi();
          }
          return;
        }
        await applyCompletedGenerateJob(job);
        router.replace(`/posts/${initialPost.id}`);
      } catch (e) {
        if (!cancelled) {
          setBusy(null);
          clearGenerateUi();
          setError(e instanceof Error ? e.message : "초안 생성 실패");
          router.replace(`/posts/${initialPost.id}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Resume only on mount for this post
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPost.id]);

  const headerTemplates = useMemo(
    () => templates.filter((t) => t.kind === "header"),
    [templates],
  );
  const footerTemplates = useMemo(
    () => templates.filter((t) => t.kind === "footer"),
    [templates],
  );

  const titleCandidates = useMemo(() => {
    return Array.isArray(post.titleCandidates)
      ? post.titleCandidates.filter((t): t is string => typeof t === "string")
      : [];
  }, [post.titleCandidates]);

  const emptySceneKeywordCount = useMemo(() => {
    return imagesToSlots(post.images).filter((slot) => {
      const primary = slot.kind === "single" ? slot.image : slot.images[0];
      return !primary?.caption?.trim();
    }).length;
  }, [post.images]);

  const toneOptions = useMemo(() => captionToneOptions(brandTone), [brandTone]);

  const statusLabel = postStatusLabel(post.status);
  const statusHint = postStatusHint(post.status);
  const hasBodyText = Boolean(body.replace(/<[^>]+>/g, "").trim());
  const isCollecting = post.status === "collecting";
  /** Allow edit/save when a draft body exists even if status flipped to collecting. */
  const bodyLocked = isCollecting && !hasBodyText && !needsSelection;
  const emptyCaptionCount = post.images.filter((img) => !img.caption?.trim()).length;
  const showNewCutCta =
    (post.status === "draft" || (isCollecting && hasBodyText)) &&
    hasBodyText &&
    !needsSelection;

  function applyBodyHtml(html: string) {
    const next = ensureImagesInHtml(html, imageInputs(post.images), {
      slotImages: post.images,
    });
    setBody(next);
    setEditorRevision((n) => n + 1);
  }

  async function saveImageLayout(payload: {
    slots: Array<{ type: "single" | "group"; imageIds: string[] }>;
  }) {
    setBusy("layout");
    setError(null);
    const res = await fetch(`/api/posts/${post.id}/images/layout`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; images?: PostImage[] };
    setBusy(null);
    if (!res.ok || !data.images) {
      throw new Error(data.error || "배치 저장 실패");
    }
    setPost((prev) => ({ ...prev, images: data.images! }));
  }

  async function uploadImages(files: FileList | File[] | null) {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    setBusy("upload");
    setError(null);
    try {
      for (const file of list) {
        const form = new FormData();
        form.append("file", file);
        form.append("autoCaption", "true");
        const res = await fetch(`/api/posts/${post.id}/images`, { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { error?: string; image?: PostImage };
        if (!res.ok || !data.image) {
          throw new Error(data.error || "업로드 실패");
        }
        setPost((prev) => {
          const keepDraft = Boolean(prev.body?.replace(/<[^>]+>/g, "").trim()) || hasBodyText;
          return {
            ...prev,
            status: keepDraft
              ? prev.status === "collecting"
                ? "draft"
                : prev.status
              : "collecting",
            images: [...prev.images, data.image!].sort((a, b) => a.orderIndex - b.orderIndex),
          };
        });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setBusy(null);
    }
  }

  async function addFilesToSlot(
    targetSlotId: string,
    files: File[],
    options?: { mergeImageIds?: string[] },
  ) {
    setBusy("upload");
    setError(null);
    const uploaded: PostImage[] = [];
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        form.append("autoCaption", "true");
        const res = await fetch(`/api/posts/${post.id}/images`, { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { error?: string; image?: PostImage };
        if (!res.ok || !data.image) {
          throw new Error(data.error || "업로드 실패");
        }
        uploaded.push(data.image);
      }

      const withUploaded = [...post.images, ...uploaded].sort((a, b) => a.orderIndex - b.orderIndex);
      const addIds = [...uploaded.map((img) => img.id), ...(options?.mergeImageIds || [])];
      if (!addIds.length) {
        throw new Error("추가할 이미지가 없습니다.");
      }

      const payload = attachToSlotLayout(withUploaded, targetSlotId, addIds);
      if (!payload) {
        throw new Error("묶음에 더 이상 사진을 넣을 수 없습니다. (최대 4장)");
      }

      const layoutRes = await fetch(`/api/posts/${post.id}/images/layout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const layoutData = (await layoutRes.json().catch(() => ({}))) as {
        error?: string;
        images?: PostImage[];
      };
      if (!layoutRes.ok || !layoutData.images) {
        throw new Error(layoutData.error || "묶음 저장 실패");
      }
      setPost((prev) => ({
        ...prev,
        status: hasBodyText
          ? prev.status === "collecting"
            ? "draft"
            : prev.status
          : prev.status,
        images: layoutData.images!,
      }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 추가 실패");
      if (uploaded.length) {
        setPost((prev) => ({
          ...prev,
          images: [...prev.images, ...uploaded]
            .filter((img, i, arr) => arr.findIndex((x) => x.id === img.id) === i)
            .sort((a, b) => a.orderIndex - b.orderIndex),
        }));
      }
      throw e;
    } finally {
      setBusy(null);
    }
  }

  async function recaption(imageId: string) {
    setBusy(`cap-${imageId}`);
    setError(null);
    const res = await fetch(`/api/posts/${post.id}/images/${imageId}/caption`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { error?: string; image?: PostImage };
    setBusy(null);
    if (!res.ok || !data.image) {
      setError(data.error || "장면 키워드 추천 실패");
      return;
    }
    setPost((prev) => ({
      ...prev,
      images: prev.images.map((img) => (img.id === imageId ? data.image! : img)),
    }));
  }

  async function saveCaption(imageId: string, caption: string) {
    setBusy(`save-cap-${imageId}`);
    const res = await fetch(`/api/posts/${post.id}/images/${imageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; image?: PostImage };
    setBusy(null);
    if (!res.ok || !data.image) {
      setError(data.error || "장면 키워드 저장 실패");
      return;
    }
    setPost((prev) => ({
      ...prev,
      images: prev.images.map((img) => (img.id === imageId ? data.image! : img)),
    }));
  }

  async function removeImage(imageId: string) {
    setBusy(`del-${imageId}`);
    const res = await fetch(`/api/posts/${post.id}/images/${imageId}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "삭제 실패");
      return;
    }
    setPost((prev) => {
      const remaining = prev.images.filter((img) => img.id !== imageId);
      const removed = prev.images.find((img) => img.id === imageId);
      const cleaned = remaining.map((img) => {
        if (
          removed?.groupId &&
          img.groupId === removed.groupId &&
          remaining.filter((r) => r.groupId === removed.groupId).length < 2
        ) {
          return { ...img, groupId: null };
        }
        return img;
      });
      return {
        ...prev,
        images: cleaned.map((img, orderIndex) => ({ ...img, orderIndex })),
      };
    });
  }

  async function applyCompletedGenerateJob(job: {
    result: {
      needsSelection?: boolean;
      drafts?: CandidateDraft[];
      meta?: {
        failed?: Array<{ provider: string; error: string } | string>;
        style?: Record<string, StyleMetaEntry> | null;
        seo?: Record<string, SeoMetaEntry> | null;
      };
    } | null;
  }) {
    const res = await fetch(`/api/posts/${post.id}`);
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      post?: PostData;
    };
    setGeneratePhase("completed");
    setGenerateComplete(true);
    await new Promise((r) => setTimeout(r, 450));
    setBusy(null);
    clearGenerateUi();
    if (!res.ok || !data.post) {
      // Fallback to job result drafts only
      const failed = job.result?.meta?.failed || [];
      if (failed.length) {
        const detail = failed
          .map((f) => (typeof f === "string" ? f : `${f.provider}: ${f.error}`))
          .join(" · ");
        setDualFailNotice(`일부 버전 생성에 실패해 하나만 준비됐어요. (${detail})`);
      }
      if (job.result?.needsSelection && job.result.drafts && job.result.drafts.length >= 2) {
        setNeedsSelection(true);
        setCandidateDrafts(job.result.drafts);
        setTitle("");
        setBody("");
      }
      router.refresh();
      return;
    }

    setPost(data.post);
    setKeyword(data.post.keyword || "");
    if (data.post.captionTone !== undefined) {
      setCaptionTone(data.post.captionTone || BRAND_CAPTION_TONE);
    }
    if (data.post.productHighlights !== undefined) {
      setProductHighlights(data.post.productHighlights || "");
    }

    const failed = job.result?.meta?.failed || [];
    const failedList = failed
      .map((f) => (typeof f === "string" ? null : f.provider))
      .filter((p): p is string => Boolean(p));
    setFailedProviders(failedList);
    const style = job.result?.meta?.style;
    if (style && typeof style === "object") {
      setStyleMeta(style as Record<string, StyleMetaEntry>);
    } else {
      setStyleMeta(null);
    }
    const seo = job.result?.meta?.seo;
    if (seo && typeof seo === "object") {
      setSeoMeta(seo as Record<string, SeoMetaEntry>);
    } else {
      setSeoMeta(null);
    }
    if (failed.length) {
      const detail = failed
        .map((f) => (typeof f === "string" ? f : `${f.provider}: ${f.error}`))
        .join(" · ");
      setDualFailNotice(`일부 버전 생성에 실패해 하나만 준비됐어요. (${detail})`);
    } else {
      setDualFailNotice(null);
    }

    if (job.result?.needsSelection && job.result.drafts && job.result.drafts.length >= 2) {
      setNeedsSelection(true);
      setCandidateDrafts(job.result.drafts);
      setTitle("");
      setBody("");
      return;
    }

    setNeedsSelection(false);
    setCandidateDrafts([]);
    setSnapshotBeforeCompare(null);
    setTitle(data.post.title || "");
    applyBodyHtml(
      toEditorHtml(data.post.body || "", imageInputs(data.post.images), data.post.images),
    );
    setEditorTab("edit");
    router.refresh();
  }

  async function generateDraft() {
    if (needsSelection || body.trim()) {
      const ok = window.confirm(
        "새 초안을 만들면 지금 비교·편집 중인 내용이 바뀔 수 있어요. 계속할까요?",
      );
      if (!ok) return;
    }

    const isTopic = post.mode === "topic";
    if (isTopic && keyword.trim().length < 2) {
      setError("주제를 2자 이상 입력해 주세요.");
      return;
    }

    setSnapshotBeforeCompare({ title, body });
    setBusy("generate");
    setGenerateComplete(false);
    setGenerateKind(isTopic ? "generate_topic" : "generate");
    setGeneratePhase(isTopic ? "research" : "assemble");
    setGeneratePhaseLabel(
      phaseStatusLabel(isTopic ? "research" : "assemble", isTopic ? "generate_topic" : "generate"),
    );
    setError(null);
    setCopyMsg(null);
    setDualFailNotice(null);
    setNeedsSelection(false);
    setCandidateDrafts([]);
    try {
      const job = await runGenerationJobClient({
        postId: post.id,
        body: isTopic
          ? {
              kind: "generate_topic",
              topic: keyword.trim(),
              length: draftLength,
              imageCount: topicImageCount,
              imageSource: topicUseAiImages ? "ai" : "unsplash",
              replaceImages: topicReplaceImages,
            }
          : {
              kind: "generate",
              keyword: keyword || undefined,
              productHighlights: productHighlights.trim() || null,
              captionTone: captionTone || BRAND_CAPTION_TONE,
              length: draftLength,
              useLearnedSupplement,
              excludedSupplementPoints:
                useLearnedSupplement && excludedSupplementPoints.length
                  ? excludedSupplementPoints
                  : undefined,
            },
        onPhase: (j) => {
          noteGeneratePhase(j);
        },
      });
      await applyCompletedGenerateJob(job);
    } catch (e) {
      setBusy(null);
      clearGenerateUi();
      setError(e instanceof Error ? e.message : "초안 생성 실패");
    }
  }

  async function retryFailedProvider(provider: string) {
    if (provider !== "gpt" && provider !== "gemini") return;
    const isTopic = post.mode === "topic";
    setBusy("retry-draft");
    setGenerateComplete(false);
    setGenerateKind(isTopic ? "generate_topic" : "generate");
    setGeneratePhase("draft");
    setGeneratePhaseLabel(phaseStatusLabel("draft", isTopic ? "generate_topic" : "generate"));
    setError(null);
    try {
      const job = await runGenerationJobClient({
        postId: post.id,
        body: isTopic
          ? {
              kind: "generate_topic",
              topic: keyword.trim() || post.keyword || "주제",
              length: draftLength,
              imageCount: topicImageCount,
              imageSource: topicUseAiImages ? "ai" : "unsplash",
              replaceImages: false,
              providers: [provider],
              mergeExistingDrafts: true,
            }
          : {
              kind: "generate",
              keyword: keyword || undefined,
              productHighlights: productHighlights.trim() || null,
              captionTone: captionTone || BRAND_CAPTION_TONE,
              length: draftLength,
              providers: [provider],
              mergeExistingDrafts: true,
              useLearnedSupplement,
              excludedSupplementPoints:
                useLearnedSupplement && excludedSupplementPoints.length
                  ? excludedSupplementPoints
                  : undefined,
            },
        onPhase: (j) => {
          noteGeneratePhase(j);
        },
      });
      await applyCompletedGenerateJob(job);
    } catch (e) {
      setBusy(null);
      clearGenerateUi();
      setError(e instanceof Error ? e.message : "재시도 실패");
    }
  }

  async function learnFromPublished() {
    setBusy("learn-publish");
    setError(null);
    setCopyMsg(null);
    const res = await fetch(`/api/posts/${post.id}/learn-from-publish`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      sampleCount?: number;
    };
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "스타일 학습에 실패했습니다.");
      return;
    }
    setCopyMsg(
      typeof data.sampleCount === "number"
        ? `올린 글을 원문에 반영하고 문체를 다시 학습했습니다. (샘플 ${data.sampleCount})`
        : "올린 글을 원문에 반영하고 문체를 다시 학습했습니다.",
    );
  }

  async function fillEmptyCaptions() {
    setBusy("fill-captions");
    setError(null);
    const res = await fetch(`/api/posts/${post.id}/images/fill-captions`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      images?: PostImage[];
      filled?: number;
    };
    setBusy(null);
    if (!res.ok || !data.images) {
      setError(data.error || "장면 키워드 자동 채우기에 실패했습니다.");
      return;
    }
    setPost((prev) => ({ ...prev, images: data.images! }));
    setCopyMsg(
      data.filled
        ? `빈 장면 키워드 ${data.filled}개를 채웠습니다.`
        : "채울 빈 장면 키워드가 없습니다.",
    );
  }

  async function selectDraft(draftId: string) {
    setBusy("select-draft");
    setSelectingDraftId(draftId);
    setError(null);
    const res = await fetch(`/api/posts/${post.id}/select-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      post?: PostData;
    };
    setBusy(null);
    setSelectingDraftId(null);
    if (!res.ok || !data.post) {
      setError(data.error || "초안 선택에 실패했습니다.");
      return;
    }
    setPost(data.post);
    setNeedsSelection(false);
    setCandidateDrafts([]);
    setSnapshotBeforeCompare(null);
    setDualFailNotice(null);
    setTitle(data.post.title || "");
    applyBodyHtml(
      toEditorHtml(data.post.body || "", imageInputs(data.post.images), data.post.images),
    );
    setEditorTab("edit");
    router.refresh();
  }

  function dismissCompare() {
    setNeedsSelection(false);
    setCandidateDrafts([]);
    if (snapshotBeforeCompare) {
      setTitle(snapshotBeforeCompare.title);
      setBody(snapshotBeforeCompare.body);
      setEditorRevision((n) => n + 1);
    }
    setSnapshotBeforeCompare(null);
    setEditorTab("edit");
  }

  async function syncImagesIntoBody() {
    const next = ensureImagesInHtml(body, imageInputs(post.images), {
      slotImages: post.images,
    });
    applyBodyHtml(next);
    setBusy("save");
    setError(null);
    const res = await fetch(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: next, title: title || undefined, status: "draft" }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; post?: PostData };
    setBusy(null);
    if (!res.ok || !data.post) {
      setError(data.error || "본문에 사진 반영 실패");
      return;
    }
    setPost(data.post);
  }

  async function copyForPublish() {
    if (!title.trim() && !body.trim()) return;
    setBusy("copy");
    setCopyMsg(null);
    setShowCopyGuide(false);
    setError(null);
    try {
      const html = `<h1>${escapeTitle(title)}</h1>${body}`;
      const plain = [title.trim(), "", htmlToPlainText(body)].filter(Boolean).join("\n");
      await copyHtmlForBlogEditor(html, plain);
      setCopyMsg("복사됨 — 네이버/티스토리 글쓰기에 붙여넣으세요.");
      setShowCopyGuide(true);
    } catch {
      setError("복사에 실패했습니다. 브라우저 클립보드 권한을 확인해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  async function saveTemplateSelection(
    nextHeaderId: string,
    nextFooterId: string,
  ) {
    setBusy("template-select");
    setError(null);
    const res = await fetch(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        headerTemplateId: nextHeaderId || null,
        footerTemplateId: nextFooterId || null,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; post?: PostData };
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "템플릿 선택 저장 실패");
      return;
    }
    if (data.post) {
      setPost((prev) => ({
        ...prev,
        headerTemplateId: data.post!.headerTemplateId ?? null,
        footerTemplateId: data.post!.footerTemplateId ?? null,
      }));
    }
  }

  async function applySelectedTemplates() {
    const header = headerTemplates.find((t) => t.id === headerTemplateId);
    const footer = footerTemplates.find((t) => t.id === footerTemplateId);
    if (!header && !footer) {
      setError("적용할 머리말/꼬리말 템플릿을 선택해 주세요.");
      return;
    }

    let next = body;
    if (header) next = applyTemplateToBody(next, "header", header.html, header.id);
    if (footer) next = applyTemplateToBody(next, "footer", footer.html, footer.id);
    next = toEditorHtml(next, imageInputs(post.images), post.images);

    setBody(next);
    setEditorRevision((n) => n + 1);
    setError(null);
    setBusy("template-apply");
    const res = await fetch(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: next,
        headerTemplateId: headerTemplateId || null,
        footerTemplateId: footerTemplateId || null,
        status: "draft",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; post?: PostData };
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "템플릿 적용 저장 실패");
      return;
    }
    if (data.post) {
      setPost((prev) => ({
        ...prev,
        body: data.post!.body,
        status: data.post!.status,
        headerTemplateId: data.post!.headerTemplateId ?? null,
        footerTemplateId: data.post!.footerTemplateId ?? null,
      }));
    }
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    setBusy("save");
    setError(null);
    const res = await fetch(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title || undefined,
        body,
        keyword: keyword || null,
        productHighlights: productHighlights.trim() || null,
        status: "draft",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; post?: PostData };
    setBusy(null);
    if (!res.ok || !data.post) {
      setError(data.error || "저장 실패");
      return;
    }
    setPost(data.post);
    if (data.post.productHighlights !== undefined) {
      setProductHighlights(data.post.productHighlights || "");
    }
    router.refresh();
  }

  async function setStatus(
    status: "published" | "archived" | "draft",
    options?: {
      publishedUrl?: string | null;
      publishPlatform?: "naver" | "tistory" | "other" | null;
      skipUrl?: boolean;
    },
  ) {
    if (status === "published" && !title.trim()) {
      setError("올림 표시 전에 제목을 입력하세요.");
      return;
    }
    if (status === "published" && !body.trim()) {
      setError("올림 표시 전에 본문을 입력하세요.");
      return;
    }
    if (status === "published" && !options) {
      setPublishUrlInput(post.publishedUrl || "");
      setPublishPlatform(
        post.publishPlatform === "tistory" || post.publishPlatform === "other"
          ? post.publishPlatform
          : "naver",
      );
      setPublishModalOpen(true);
      return;
    }
    if (status === "archived" && !confirm("이 포스트를 보관할까요?")) return;

    setBusy("status");
    setError(null);
    const res = await fetch(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        title: title || undefined,
        body: body || undefined,
        keyword: keyword || null,
        ...(status === "published"
          ? {
              publishedUrl: options?.skipUrl ? null : options?.publishedUrl || null,
              publishPlatform: options?.skipUrl
                ? null
                : options?.publishPlatform || "other",
            }
          : status === "draft"
            ? { clearPublishArchive: true }
            : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; post?: PostData };
    setBusy(null);
    setPublishModalOpen(false);
    if (!res.ok || !data.post) {
      setError(data.error || "상태 변경 실패");
      return;
    }
    setPost(data.post);
    setTitle(data.post.title || "");
    applyBodyHtml(
      toEditorHtml(data.post.body || "", imageInputs(data.post.images), data.post.images),
    );
  }

  const canCopy = Boolean(title.trim() || body.replace(/<[^>]+>/g, "").trim());

  const generateOpen = busy === "generate" || busy === "retry-draft";
  const generateRange = phaseProgressRange(generatePhase, generateKind);

  if (isStudioUiEnabled()) {
    return (
      <PostWorkspaceStudioView
        post={post}
        keyword={keyword}
        setKeyword={setKeyword}
        captionTone={captionTone}
        setCaptionTone={setCaptionTone}
        draftLength={draftLength}
        setDraftLength={setDraftLength}
        topicImageCount={topicImageCount}
        setTopicImageCount={setTopicImageCount}
        topicUseAiImages={topicUseAiImages}
        setTopicUseAiImages={setTopicUseAiImages}
        topicReplaceImages={topicReplaceImages}
        setTopicReplaceImages={setTopicReplaceImages}
        productHighlights={productHighlights}
        setProductHighlights={setProductHighlights}
        useLearnedSupplement={useLearnedSupplement}
        setUseLearnedSupplement={setUseLearnedSupplement}
        excludedSupplementPoints={excludedSupplementPoints}
        setExcludedSupplementPoints={setExcludedSupplementPoints}
        toneOptions={toneOptions}
        title={title}
        setTitle={setTitle}
        body={body}
        setBody={setBody}
        titleCandidates={titleCandidates}
        editorTab={editorTab}
        setEditorTab={setEditorTab}
        editorRevision={editorRevision}
        busy={busy}
        error={error}
        setError={setError}
        statusLabel={statusLabel}
        statusHint={statusHint}
        bodyLocked={bodyLocked}
        canCopy={canCopy}
        needsSelection={needsSelection}
        candidateDrafts={candidateDrafts}
        selectingDraftId={selectingDraftId}
        dualFailNotice={dualFailNotice}
        failedProviders={failedProviders}
        emptyCaptionCount={emptyCaptionCount}
        emptySceneKeywordCount={emptySceneKeywordCount}
        showNewCutCta={showNewCutCta}
        headerTemplateId={headerTemplateId}
        footerTemplateId={footerTemplateId}
        setHeaderTemplateId={setHeaderTemplateId}
        setFooterTemplateId={setFooterTemplateId}
        headerTemplates={headerTemplates}
        footerTemplates={footerTemplates}
        copyMsg={copyMsg}
        showCopyGuide={showCopyGuide}
        publishModalOpen={publishModalOpen}
        setPublishModalOpen={setPublishModalOpen}
        publishUrlInput={publishUrlInput}
        setPublishUrlInput={setPublishUrlInput}
        publishPlatform={publishPlatform}
        setPublishPlatform={setPublishPlatform}
        styleMeta={styleMeta}
        seoMeta={seoMeta}
        generateOpen={generateOpen}
        generatePhaseLabel={generatePhaseLabel}
        generateRange={generateRange}
        generateComplete={generateComplete}
        resultRef={resultRef}
        onGenerate={() => void generateDraft()}
        onSave={(e) => {
          e?.preventDefault?.();
          void saveDraft(e || ({ preventDefault() {} } as FormEvent));
        }}
        onCopy={() => void copyForPublish()}
        onSelectDraft={(id) => void selectDraft(id)}
        onDismissCompare={dismissCompare}
        onRetryDraft={(provider) => void retryFailedProvider(provider)}
        onUpload={(files) => void uploadImages(files)}
        onFillCaptions={() => void fillEmptyCaptions()}
        onLayoutChange={saveImageLayout}
        onRecaption={(id) => void recaption(id)}
        onSaveCaption={(id, caption) => void saveCaption(id, caption)}
        onRemoveImage={(id) => void removeImage(id)}
        onAddFilesToSlot={(slotId, files, options) =>
          void addFilesToSlot(slotId, files, options)
        }
        onSyncImages={() => void syncImagesIntoBody()}
        onSaveTemplateSelection={(h, f) => void saveTemplateSelection(h, f)}
        onApplyTemplates={() => void applySelectedTemplates()}
        onSetStatus={(status, opts) => void setStatus(status, opts)}
        onLearnPublish={() => void learnFromPublished()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <GenerationProgressModal
        open={generateOpen}
        title={busy === "retry-draft" ? "초안 재시도 중" : "초안 생성 중"}
        statusLine={generatePhaseLabel || "생성 준비 중…"}
        target={generateRange.floor}
        ceiling={generateRange.ceiling}
        complete={generateComplete}
        detail="단계가 바뀔 때마다 진행률이 올라가고, 대기 중에도 조금씩 움직입니다."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[color:var(--muted)]">
            <Link href={`/brands/${post.brand.id}`} className="hover:underline">
              {post.brand.name}
            </Link>
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[color:var(--foreground)]">
            {post.title || "글 편집"}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span title={statusHint || undefined}>
            <Badge
              className={
                post.status === "published"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : post.status === "archived"
                    ? "border-[var(--border)] bg-[var(--background)] text-[color:var(--muted)]"
                    : post.status === "collecting"
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : undefined
              }
            >
              {statusLabel}
            </Badge>
          </span>
          {!showNewCutCta ? (
            <NewCutLink brandId={post.brandId} postId={post.id}>
              <Button type="button" variant="outline" size="sm">
                New Cut 쇼츠 만들기
              </Button>
            </NewCutLink>
          ) : null}
        </div>
      </div>

      {statusHint ? (
        <p className="text-xs text-[color:var(--muted)]" title={statusHint}>
          {statusHint}
        </p>
      ) : null}

      {error ? (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{error}</p>
          {/실패|다시 시도/.test(error) ? (
            <Button type="button" size="sm" variant="outline" onClick={() => void generateDraft()}>
              다시 생성
            </Button>
          ) : null}
        </div>
      ) : null}
      {dualFailNotice ? (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p>{dualFailNotice}</p>
          {failedProviders.length ? (
            <div className="flex flex-wrap gap-2">
              {failedProviders.map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy === "retry-draft"}
                  onClick={() => void retryFailedProvider(p)}
                >
                  {p === "gpt" ? "버전 A" : "버전 B"} 다시 만들기
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {styleMeta ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[color:var(--foreground)]">
          <p className="font-medium text-[color:var(--foreground)]">학습 문체 점수</p>
          <ul className="mt-1 space-y-1">
            {Object.entries(styleMeta).map(([provider, meta]) => (
              <li key={provider}>
                {provider === "gpt" ? "버전 A" : provider === "gemini" ? "버전 B" : provider}
                {typeof meta.score === "number" ? ` · ${Math.round(meta.score * 100)}점` : ""}
                {meta.repaired ? " · 보정 적용" : ""}
                {meta.issues?.length ? ` · ${meta.issues.slice(0, 2).join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {seoMeta ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[color:var(--foreground)]">
          <p className="font-medium text-[color:var(--foreground)]">SEO 점검 점수</p>
          <p className="mt-0.5 text-xs text-[color:var(--muted)]">
            내부 체크리스트(휴리스틱)입니다. 네이버·구글 실제 순위나 1페이지 노출을 보장하지 않습니다.
          </p>
          <ul className="mt-1 space-y-1">
            {Object.entries(seoMeta).map(([provider, meta]) => (
              <li key={provider}>
                {provider === "gpt" ? "버전 A" : provider === "gemini" ? "버전 B" : provider}
                {typeof meta.score === "number" ? ` · ${meta.score}점` : ""}
                {meta.repaired ? " · 1회 보정" : ""}
                {meta.issues?.length ? ` · ${meta.issues.slice(0, 2).join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {post.status === "published" && !post.publishedUrl ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          URL 미기록 — 나중에 올린 글 주소를 저장해 두면 관리가 쉽습니다.
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-2"
            onClick={() => setPublishModalOpen(true)}
          >
            URL 기록
          </Button>
        </p>
      ) : null}
      {post.publishedUrl ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--muted)]">
          <p>
            올린 글:{" "}
            <a
              href={post.publishedUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {post.publishedUrl}
            </a>
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy === "learn-publish"}
            onClick={() => void learnFromPublished()}
          >
            스타일 학습에 추가
          </Button>
        </div>
      ) : null}
      {bodyLocked ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[color:var(--foreground)]">
          아직 준비 중이에요. 초안이 만들어진 뒤 본문을 자유롭게 편집할 수 있어요.
        </p>
      ) : null}
      {hasBodyText ? (
        <p className="text-xs text-[color:var(--muted)]">
          사진을 추가한 뒤 초안을 다시 만들면 본문이 새로 생성됩니다. 기존 초안은 재생성 전까지 유지됩니다.
        </p>
      ) : null}
      {publishModalOpen ? (
        <div className="space-y-3 rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-[color:var(--foreground)]">올린 글 URL (선택)</p>
          <p className="text-xs text-[color:var(--muted)]">
            네이버/티스토리에 직접 올린 뒤 주소를 남겨 두세요. 건너뛰어도 올림 표시는 됩니다.
          </p>
          <Label>
            <span>플랫폼</span>
            <select
              className="mt-1.5 flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
              value={publishPlatform}
              onChange={(e) =>
                setPublishPlatform(e.target.value as "naver" | "tistory" | "other")
              }
            >
              <option value="naver">네이버 블로그</option>
              <option value="tistory">티스토리</option>
              <option value="other">기타</option>
            </select>
          </Label>
          <Label>
            <span>게시 URL</span>
            <Input
              value={publishUrlInput}
              onChange={(e) => setPublishUrlInput(e.target.value)}
              placeholder="https://blog.naver.com/..."
            />
          </Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy === "status"}
              onClick={() => {
                if (post.status === "published") {
                  void (async () => {
                    setBusy("status");
                    const res = await fetch(`/api/posts/${post.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        publishedUrl: publishUrlInput.trim() || null,
                        publishPlatform: publishUrlInput.trim()
                          ? publishPlatform
                          : null,
                      }),
                    });
                    const data = (await res.json().catch(() => ({}))) as {
                      error?: string;
                      post?: PostData;
                    };
                    setBusy(null);
                    setPublishModalOpen(false);
                    if (!res.ok || !data.post) {
                      setError(data.error || "URL 저장 실패");
                      return;
                    }
                    setPost(data.post);
                    router.refresh();
                  })();
                  return;
                }
                void setStatus("published", {
                  publishedUrl: publishUrlInput.trim() || null,
                  publishPlatform,
                  skipUrl: !publishUrlInput.trim(),
                });
              }}
            >
              {post.status === "published"
                ? "URL 저장"
                : publishUrlInput.trim()
                  ? "URL 저장 후 올림 표시"
                  : "URL 없이 올림 표시"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy === "status"}
              onClick={() => setPublishModalOpen(false)}
            >
              취소
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <Card className="order-2 h-fit lg:sticky lg:top-20 lg:order-1">
        <CardHeader>
          <CardTitle>사진 & 장면 키워드</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[color:var(--muted)]">
            키워드는 사실만 적고, 문장·이모지·서식은 초안 생성에서 문체에 맞게 만듭니다.
          </p>
          <Label>
            <span>키워드</span>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="초안 생성에 사용할 키워드"
              maxLength={120}
            />
          </Label>
          <Label>
            <span>문장체 (말투)</span>
            <select
              className="mt-1.5 flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm text-[color:var(--foreground)] outline-none focus:border-[var(--accent)]"
              value={captionTone || BRAND_CAPTION_TONE}
              onChange={(e) => setCaptionTone(e.target.value)}
            >
              {toneOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-[color:var(--muted)]">
              초안 생성 시 이 말투로 문장을 씁니다. 이모지·강조·색·글자 크기는 학습 스타일을 더 적극 반영합니다.
            </span>
          </Label>
          <Label>
            <span>글 길이</span>
            <select
              className="mt-1.5 flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm text-[color:var(--foreground)] outline-none focus:border-[var(--accent)]"
              value={draftLength}
              onChange={(e) => {
                const next = e.target.value as TopicLength;
                setDraftLength(next);
                if (post.mode === "topic") {
                  setTopicImageCount(TOPIC_LENGTH_PRESETS[next].sectionCount);
                }
              }}
            >
              {TOPIC_LENGTHS.map((id) => (
                <option key={id} value={id}>
                  {TOPIC_LENGTH_PRESETS[id].label} — {TOPIC_LENGTH_PRESETS[id].hint}
                </option>
              ))}
            </select>
          </Label>
          {post.mode === "topic" ? (
            <div className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--background)]/80 p-3">
              <Label>
                <span>이미지 수</span>
                <Input
                  type="number"
                  min={1}
                  max={6}
                  value={topicImageCount}
                  onChange={(e) =>
                    setTopicImageCount(Math.min(6, Math.max(1, Number(e.target.value) || 1)))
                  }
                />
              </Label>
              <label className="flex items-center gap-2 text-sm text-[color:var(--foreground)]">
                <input
                  type="checkbox"
                  checked={topicUseAiImages}
                  onChange={(e) => setTopicUseAiImages(e.target.checked)}
                />
                AI 이미지 사용 (기본: Unsplash)
              </label>
              <label className="flex items-center gap-2 text-sm text-[color:var(--foreground)]">
                <input
                  type="checkbox"
                  checked={topicReplaceImages}
                  onChange={(e) => setTopicReplaceImages(e.target.checked)}
                />
                기존 이미지 교체
              </label>
            </div>
          ) : null}
          <Label>
            <span>제품 특장점 (선택)</span>
            <Textarea
              rows={3}
              value={productHighlights}
              onChange={(e) => setProductHighlights(e.target.value)}
              placeholder="비우면 키워드 제품명을 자동 조사합니다"
              maxLength={2000}
            />
          </Label>
          <ImageUploadDropzone
            disabled={busy === "upload"}
            onFiles={(files) => void uploadImages(files)}
          />

          {emptyCaptionCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span>빈 장면 키워드 {emptyCaptionCount}개</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy === "fill-captions"}
                onClick={() => void fillEmptyCaptions()}
              >
                자동 채우기
              </Button>
            </div>
          ) : null}
          <ImageGalleryBoard
            images={post.images}
            busy={busy}
            onLayoutChange={saveImageLayout}
            onRecaption={(imageId) => void recaption(imageId)}
            onSaveCaption={(imageId, caption) => void saveCaption(imageId, caption)}
            onRemove={(imageId) => void removeImage(imageId)}
            onAddFilesToSlot={(slotId, files, options) => addFilesToSlot(slotId, files, options)}
          />

          <div className="flex flex-wrap items-center gap-2">
            {emptySceneKeywordCount > 0 ? (
              <Badge className="border-amber-200 bg-amber-50 text-amber-800">
                장면 키워드 비어 있음 {emptySceneKeywordCount}단락
              </Badge>
            ) : null}
            <Button type="button" onClick={() => void generateDraft()} disabled={busy === "generate" || !keyword.trim()}>
              {busy === "generate"
                ? "생성 중…"
                : post.mode === "topic"
                  ? "포스트 다시 만들기"
                  : "초안 생성"}
            </Button>
            {post.images.length > 0 && body.trim() && !needsSelection ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy === "save"}
                onClick={() => void syncImagesIntoBody()}
              >
                본문에 사진 넣기
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-[color:var(--muted)]">
            플랜에 따라 한 버전 또는 두 버전을 만들고, 마음에 드는 쪽을 고를 수 있어요.
          </p>
          {showNewCutCta ? (
            <div className="rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 py-4 text-white">
              <p className="text-sm font-semibold">검증 초안 → 쇼츠 원소스</p>
              <p className="mt-1 text-xs text-[var(--border)]">
                같은 Ditodio 계정으로 New Cut에 넘겨 쇼츠를 이어서 만들 수 있어요.
              </p>
              <div className="mt-3">
                <NewCutLink brandId={post.brandId} postId={post.id}>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-white text-[color:var(--foreground)] hover:bg-[var(--accent-soft)]"
                  >
                    New Cut 열기
                  </Button>
                </NewCutLink>
              </div>
              <p className="mt-2 text-[11px] text-[color:var(--muted)]">
                연결에 실패하면 New Cut 주소·로그인을 확인한 뒤 다시 시도해 주세요.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {needsSelection && candidateDrafts.length >= 2 ? (
        <Card ref={resultRef} className="order-1 lg:order-2">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>초안 비교</CardTitle>
              <p className="mt-1 text-sm text-[color:var(--muted)]">
                마음에 드는 버전을 선택하면 편집기로 이어집니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy === "generate"}
                onClick={() => void generateDraft()}
              >
                다시 생성
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy === "select-draft"}
                onClick={dismissCompare}
              >
                {snapshotBeforeCompare?.body.trim() ? "이전 본문 유지" : "비교 닫기"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {candidateDrafts.map((draft) => (
                <div
                  key={draft.id}
                  className="flex flex-col rounded-xl border border-[var(--border)] bg-white"
                >
                  <div className="border-b border-[var(--border)] px-4 py-3">
                    <p className="text-sm font-semibold text-[color:var(--foreground)]">
                      {draft.label || "버전"}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-[color:var(--foreground)]">
                      {draft.title || "(제목 없음)"}
                    </p>
                  </div>
                  <div
                    className="rich-doc max-h-[28rem] flex-1 overflow-y-auto px-4 py-3 text-sm"
                    dangerouslySetInnerHTML={{
                      __html:
                        draft.body ||
                        '<p class="text-[color:var(--muted)]">미리볼 본문이 없습니다.</p>',
                    }}
                  />
                  <div className="border-t border-[var(--border)] p-3">
                    <Button
                      type="button"
                      className="w-full"
                      disabled={busy === "select-draft"}
                      onClick={() => void selectDraft(draft.id)}
                    >
                      {selectingDraftId === draft.id ? "선택 중…" : "이 버전 선택"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
      <Card ref={resultRef} className="order-1 lg:order-2">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>초안 편집기</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 ${editorTab === "edit" ? "bg-[var(--accent)] text-white" : "text-[color:var(--muted)]"}`}
                onClick={() => setEditorTab("edit")}
              >
                편집
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 ${editorTab === "preview" ? "bg-[var(--accent)] text-white" : "text-[color:var(--muted)]"}`}
                onClick={() => setEditorTab("preview")}
              >
                미리보기
              </button>
            </div>
            <Button type="button" disabled={!canCopy || busy === "copy"} onClick={() => void copyForPublish()}>
              {busy === "copy" ? "복사 중…" : "복사"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveDraft} className="space-y-4">
            <Label>
              <span>제목</span>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </Label>
            {titleCandidates.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {titleCandidates.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[color:var(--foreground)] hover:bg-[var(--accent-soft)]"
                    onClick={() => setTitle(candidate)}
                  >
                    {candidate}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-[color:var(--foreground)]">머리말·꼬리말 템플릿</p>
                <Link
                  href={`/brands/${post.brandId}/templates`}
                  className="text-xs text-[color:var(--muted)] hover:text-[var(--accent)]"
                >
                  템플릿 관리
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Label>
                  <span>머리말</span>
                  <select
                    className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    value={headerTemplateId}
                    disabled={busy === "template-select" || busy === "template-apply"}
                    onChange={(e) => {
                      const next = e.target.value;
                      setHeaderTemplateId(next);
                      void saveTemplateSelection(next, footerTemplateId);
                    }}
                  >
                    <option value="">선택 안 함</option>
                    {headerTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Label>
                <Label>
                  <span>꼬리말</span>
                  <select
                    className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    value={footerTemplateId}
                    disabled={busy === "template-select" || busy === "template-apply"}
                    onChange={(e) => {
                      const next = e.target.value;
                      setFooterTemplateId(next);
                      void saveTemplateSelection(headerTemplateId, next);
                    }}
                  >
                    <option value="">선택 안 함</option>
                    {footerTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    busy === "template-apply" ||
                    (!headerTemplateId && !footerTemplateId)
                  }
                  onClick={() => void applySelectedTemplates()}
                >
                  {busy === "template-apply" ? "적용 중…" : "본문에 적용"}
                </Button>
                <p className="text-xs text-[color:var(--muted)]">
                  선택만 저장되고, 적용 시 머리말은 맨 위·꼬리말은 맨 아래에 넣습니다. 다시 적용하면 교체됩니다.
                </p>
              </div>
              {headerTemplates.length === 0 && footerTemplates.length === 0 ? (
                <p className="text-xs text-amber-700">
                  아직 템플릿이 없습니다. 템플릿 관리에서 머리말/꼬리말을 만들어 주세요.
                </p>
              ) : null}
            </div>

            {editorTab === "edit" ? (
              <RichEditor
                value={body}
                revision={editorRevision}
                onChange={setBody}
                placeholder="초안을 생성하면 이미지와 함께 여기에 표시됩니다."
              />
            ) : (
              <div
                className="rich-doc min-h-[28rem] rounded-lg border border-[var(--border)] bg-white px-4 py-3"
                dangerouslySetInnerHTML={{
                  __html: body || '<p class="text-[color:var(--muted)]">미리볼 본문이 없습니다.</p>',
                }}
              />
            )}

            {copyMsg || showCopyGuide ? (
              <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
                {copyMsg ? <p className="font-medium">{copyMsg}</p> : null}
                <ol className="list-decimal space-y-1 pl-4 text-emerald-900/90">
                  <li>네이버·티스토리 글쓰기에 붙여넣기</li>
                  <li>사진·서식이 깨지면 용량·이미지 개수를 줄여 다시 복사</li>
                  <li>올렸다면 아래 <strong>올림 표시</strong>로 기록</li>
                </ol>
                <p className="text-xs text-emerald-800/80">
                  팁: 네이버는 큰 이미지·복잡한 표가 잘릴 수 있어요. 티스토리는 HTML 붙여넣기가 비교적 안정적입니다.
                </p>
                {post.status !== "published" ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy === "status" || !canCopy}
                    onClick={() => setStatus("published")}
                  >
                    올림 표시
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-[color:var(--muted)]">
                복사 후 네이버/티스토리 글쓰기에 붙여넣으면 서식과 사진 유지를 시도합니다.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy === "save" || bodyLocked}>
                {busy === "save" ? "저장 중…" : "초안 저장"}
              </Button>
              {post.status === "published" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy === "status"}
                  onClick={() => setStatus("draft")}
                  title={statusHint}
                >
                  올림 표시 취소
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy === "status" || !canCopy || bodyLocked}
                  onClick={() => void setStatus("published")}
                  title="외부에 직접 올린 뒤, 여기서 완료로 표시합니다."
                >
                  올림 표시
                </Button>
              )}
              {post.status === "archived" ? (
                <Button type="button" variant="ghost" disabled={busy === "status"} onClick={() => setStatus("draft")}>
                  보관 해제
                </Button>
              ) : (
                <Button type="button" variant="ghost" disabled={busy === "status"} onClick={() => setStatus("archived")}>
                  보관
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
      )}
      </div>
    </div>
  );
}

function escapeTitle(title: string) {
  return title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

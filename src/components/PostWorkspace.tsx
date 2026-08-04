"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { ImageGalleryBoard } from "@/components/ImageGalleryBoard";
import { ImageUploadDropzone } from "@/components/ImageUploadDropzone";
import { RichEditor } from "@/components/RichEditor";
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
import { buildNewCutDeepLink } from "@/lib/newcut";
import { postStatusLabel } from "@/lib/post-status";
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
  const [post, setPost] = useState(initialPost);
  const [keyword, setKeyword] = useState(initialPost.keyword || "");
  const [captionTone, setCaptionTone] = useState(
    initialPost.captionTone || BRAND_CAPTION_TONE,
  );
  const [productHighlights, setProductHighlights] = useState(
    initialPost.productHighlights || "",
  );
  const [draftLength, setDraftLength] = useState<TopicLength>("medium");
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
  const [snapshotBeforeCompare, setSnapshotBeforeCompare] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const prevBusyRef = useRef(busy);

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
        setPost((prev) => ({
          ...prev,
          status: "collecting",
          images: [...prev.images, data.image!].sort((a, b) => a.orderIndex - b.orderIndex),
        }));
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
      setPost((prev) => ({ ...prev, status: "collecting", images: layoutData.images! }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 추가 실패");
      if (uploaded.length) {
        setPost((prev) => ({
          ...prev,
          status: "collecting",
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

  async function generateDraft() {
    if (needsSelection || body.trim()) {
      const ok = window.confirm(
        "새 초안을 만들면 지금 비교·편집 중인 내용이 바뀔 수 있어요. 계속할까요?",
      );
      if (!ok) return;
    }

    setSnapshotBeforeCompare({ title, body });
    setBusy("generate");
    setError(null);
    setCopyMsg(null);
    setDualFailNotice(null);
    setNeedsSelection(false);
    setCandidateDrafts([]);
    const res = await fetch(`/api/posts/${post.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keyword: keyword || undefined,
        productHighlights: productHighlights.trim() || null,
        captionTone: captionTone || BRAND_CAPTION_TONE,
        length: draftLength,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      post?: PostData;
      needsSelection?: boolean;
      drafts?: CandidateDraft[];
      meta?: {
        failed?: Array<{ provider: string; error: string } | string>;
      };
    };
    setBusy(null);
    if (!res.ok || !data.post) {
      setError(data.error || "초안 생성 실패");
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

    const failed = data.meta?.failed || [];
    if (failed.length) {
      const detail = failed
        .map((f) => (typeof f === "string" ? f : `${f.provider}: ${f.error}`))
        .join(" · ");
      setDualFailNotice(`일부 버전 생성에 실패해 하나만 준비됐어요. (${detail})`);
    } else {
      setDualFailNotice(null);
    }

    if (data.needsSelection && data.drafts && data.drafts.length >= 2) {
      setNeedsSelection(true);
      setCandidateDrafts(data.drafts);
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
    setError(null);
    try {
      const html = `<h1>${escapeTitle(title)}</h1>${body}`;
      const plain = [title.trim(), "", htmlToPlainText(body)].filter(Boolean).join("\n");
      await copyHtmlForBlogEditor(html, plain);
      setCopyMsg("복사됨 — 네이버/티스토리 글쓰기에 붙여넣으세요.");
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

  async function setStatus(status: "published" | "archived" | "draft") {
    if (status === "published" && !title.trim()) {
      setError("올림 표시 전에 제목을 입력하세요.");
      return;
    }
    if (status === "published" && !body.trim()) {
      setError("올림 표시 전에 본문을 입력하세요.");
      return;
    }
    if (status === "published" && !confirm("네이버/티스토리에 올렸다면 올림 표시로 바꿀까요?")) return;
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
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; post?: PostData };
    setBusy(null);
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

  const newCutUrl = buildNewCutDeepLink({
    from: "blog_writer",
    source: "blog",
    brandId: post.brandId,
    postId: post.id,
  });

  const canCopy = Boolean(title.trim() || body.replace(/<[^>]+>/g, "").trim());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">
            <Link href={`/brands/${post.brand.id}`} className="hover:underline">
              {post.brand.name}
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
            {post.title || "글 편집"}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={
              post.status === "published"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : post.status === "archived"
                  ? "border-zinc-300 bg-zinc-100 text-zinc-600"
                  : undefined
            }
          >
            {statusLabel}
          </Badge>
          <a href={newCutUrl} target="_blank" rel="noopener noreferrer">
            <Button type="button" variant="outline" size="sm">
              New Cut 쇼츠 만들기
            </Button>
          </a>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {dualFailNotice ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {dualFailNotice}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <Card className="h-fit order-2 lg:order-1 lg:sticky lg:top-4">
        <CardHeader>
          <CardTitle>사진 & 장면 키워드</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-600">
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
              className="mt-1.5 flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
              value={captionTone || BRAND_CAPTION_TONE}
              onChange={(e) => setCaptionTone(e.target.value)}
            >
              {toneOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-zinc-500">
              초안 생성 시 이 말투로 문장을 씁니다. 이모지·강조·색·글자 크기는 학습 스타일을 더 적극 반영합니다.
            </span>
          </Label>
          {post.mode !== "topic" ? (
            <Label>
              <span>글 길이</span>
              <select
                className="mt-1.5 flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                value={draftLength}
                onChange={(e) => setDraftLength(e.target.value as TopicLength)}
              >
                {TOPIC_LENGTHS.map((id) => (
                  <option key={id} value={id}>
                    {TOPIC_LENGTH_PRESETS[id].label} — {TOPIC_LENGTH_PRESETS[id].hint}
                  </option>
                ))}
              </select>
            </Label>
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
              {busy === "generate" ? "두 버전 생성 중…" : "초안 생성"}
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
          <p className="text-xs text-zinc-500">
            생성 시 두 버전을 동시에 만들고, 마음에 드는 쪽을 고를 수 있어요.
          </p>
        </CardContent>
      </Card>

      {needsSelection && candidateDrafts.length >= 2 ? (
        <Card ref={resultRef} className="order-1 lg:order-2">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>초안 비교</CardTitle>
              <p className="mt-1 text-sm text-zinc-600">
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
                  className="flex flex-col rounded-xl border border-zinc-200 bg-white"
                >
                  <div className="border-b border-zinc-100 px-4 py-3">
                    <p className="text-sm font-semibold text-zinc-900">
                      {draft.label || "버전"}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-700">
                      {draft.title || "(제목 없음)"}
                    </p>
                  </div>
                  <div
                    className="rich-doc max-h-[28rem] flex-1 overflow-y-auto px-4 py-3 text-sm"
                    dangerouslySetInnerHTML={{
                      __html:
                        draft.body ||
                        '<p class="text-zinc-500">미리볼 본문이 없습니다.</p>',
                    }}
                  />
                  <div className="border-t border-zinc-100 p-3">
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
            <div className="flex rounded-lg border border-zinc-200 p-0.5 text-xs">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 ${editorTab === "edit" ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
                onClick={() => setEditorTab("edit")}
              >
                편집
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 ${editorTab === "preview" ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
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
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setTitle(candidate)}
                  >
                    {candidate}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-800">머리말·꼬리말 템플릿</p>
                <Link
                  href={`/brands/${post.brandId}/templates`}
                  className="text-xs text-zinc-500 hover:text-zinc-800"
                >
                  템플릿 관리
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Label>
                  <span>머리말</span>
                  <select
                    className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
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
                    className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
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
                <p className="text-xs text-zinc-500">
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
                className="rich-doc min-h-[28rem] rounded-lg border border-zinc-200 bg-white px-4 py-3"
                dangerouslySetInnerHTML={{
                  __html: body || '<p class="text-zinc-500">미리볼 본문이 없습니다.</p>',
                }}
              />
            )}

            {copyMsg ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {copyMsg}
              </p>
            ) : (
              <p className="text-xs text-zinc-500">
                복사 후 네이버/티스토리 글쓰기에 붙여넣으면 서식과 사진 유지를 시도합니다.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy === "save"}>
                {busy === "save" ? "저장 중…" : "초안 저장"}
              </Button>
              {post.status === "published" ? (
                <Button type="button" variant="outline" disabled={busy === "status"} onClick={() => setStatus("draft")}>
                  올림 표시 취소
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy === "status" || !canCopy}
                  onClick={() => setStatus("published")}
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

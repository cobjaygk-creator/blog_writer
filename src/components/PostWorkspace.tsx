"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PublishExport } from "@/components/PublishExport";
import { markdownToHtml } from "@/lib/markdown";
import { buildNewCutDeepLink } from "@/lib/newcut";

type PostImage = {
  id: string;
  imageUrl: string;
  caption: string | null;
  orderIndex: number;
};

type PostData = {
  id: string;
  brandId: string;
  title: string | null;
  titleCandidates: unknown;
  body: string | null;
  keyword: string | null;
  status: string;
  images: PostImage[];
  brand: { id: string; name: string };
};

export function PostWorkspace({ initialPost }: { initialPost: PostData }) {
  const router = useRouter();
  const [post, setPost] = useState(initialPost);
  const [keyword, setKeyword] = useState(initialPost.keyword || "");
  const [title, setTitle] = useState(initialPost.title || "");
  const [body, setBody] = useState(initialPost.body || "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<"edit" | "preview">("edit");

  const titleCandidates = useMemo(() => {
    return Array.isArray(post.titleCandidates)
      ? post.titleCandidates.filter((t): t is string => typeof t === "string")
      : [];
  }, [post.titleCandidates]);

  const previewHtml = useMemo(() => markdownToHtml(body || ""), [body]);

  const statusLabel =
    post.status === "published"
      ? "올림 완료"
      : post.status === "archived"
        ? "보관됨"
        : post.status === "draft"
          ? "초안"
          : "수집 중";

  async function uploadImages(files: FileList | null) {
    if (!files?.length) return;
    setBusy("upload");
    setError(null);
    try {
      for (const file of Array.from(files)) {
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

  async function moveImage(imageId: string, direction: -1 | 1) {
    const ids = post.images.map((img) => img.id);
    const index = ids.indexOf(imageId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    const orderedIds = [...ids];
    const [removed] = orderedIds.splice(index, 1);
    orderedIds.splice(next, 0, removed);

    setBusy(`order-${imageId}`);
    setError(null);
    const res = await fetch(`/api/posts/${post.id}/images/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; images?: PostImage[] };
    setBusy(null);
    if (!res.ok || !data.images) {
      setError(data.error || "순서 변경 실패");
      return;
    }
    setPost((prev) => ({ ...prev, images: data.images! }));
  }

  async function recaption(imageId: string) {
    setBusy(`cap-${imageId}`);
    setError(null);
    const res = await fetch(`/api/posts/${post.id}/images/${imageId}/caption`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { error?: string; image?: PostImage };
    setBusy(null);
    if (!res.ok || !data.image) {
      setError(data.error || "캡션 생성 실패");
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
      setError(data.error || "캡션 저장 실패");
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
    setPost((prev) => ({
      ...prev,
      images: prev.images
        .filter((img) => img.id !== imageId)
        .map((img, orderIndex) => ({ ...img, orderIndex })),
    }));
  }

  async function generateDraft() {
    setBusy("generate");
    setError(null);
    const res = await fetch(`/api/posts/${post.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: keyword || undefined }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; post?: PostData };
    setBusy(null);
    if (!res.ok || !data.post) {
      setError(data.error || "초안 생성 실패");
      return;
    }
    setPost(data.post);
    setTitle(data.post.title || "");
    setBody(data.post.body || "");
    setKeyword(data.post.keyword || "");
    router.refresh();
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
    router.refresh();
  }

  async function setStatus(status: "published" | "archived" | "draft") {
    if (status === "published" && !title.trim()) {
      setError("발행 전에 제목을 입력하세요.");
      return;
    }
    if (status === "published" && !body.trim()) {
      setError("발행 전에 본문을 입력하세요.");
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
    setBody(data.post.body || "");
  }

  const newCutUrl = buildNewCutDeepLink({
    from: "blog_writer",
    source: "blog",
    brandId: post.brandId,
    postId: post.id,
  });

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
            {post.title || "포스트 작업실"}
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

      <Card>
        <CardHeader>
          <CardTitle>사진 & 캡션</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <span>이미지 업로드</span>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              disabled={busy === "upload"}
              onChange={(e) => {
                void uploadImages(e.target.files);
                e.target.value = "";
              }}
            />
          </Label>

          {post.images.length === 0 ? (
            <p className="text-sm text-zinc-500">아직 업로드된 사진이 없습니다.</p>
          ) : (
            <ul className="space-y-4">
              {post.images.map((image, index) => (
                <li key={image.id} className="grid gap-3 rounded-xl border border-zinc-200 p-3 md:grid-cols-[160px_1fr]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.imageUrl}
                    alt={image.caption || `image ${index + 1}`}
                    className="h-36 w-full rounded-lg object-cover"
                  />
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={index === 0 || Boolean(busy)}
                        onClick={() => moveImage(image.id, -1)}
                      >
                        위로
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={index === post.images.length - 1 || Boolean(busy)}
                        onClick={() => moveImage(image.id, 1)}
                      >
                        아래로
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy === `cap-${image.id}`}
                        onClick={() => recaption(image.id)}
                      >
                        캡션 재생성
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy === `del-${image.id}`}
                        onClick={() => removeImage(image.id)}
                      >
                        삭제
                      </Button>
                    </div>
                    <Textarea
                      rows={3}
                      defaultValue={image.caption || ""}
                      key={`${image.id}-${image.caption || ""}`}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next !== (image.caption || "")) {
                          void saveCaption(image.id, next);
                        }
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Button type="button" onClick={generateDraft} disabled={busy === "generate" || !keyword.trim()}>
            {busy === "generate" ? "초안 생성 중…" : "초안 생성"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>초안 편집기</CardTitle>
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
            {editorTab === "edit" ? (
              <Label>
                <span>본문 (마크다운)</span>
                <Textarea
                  rows={18}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="font-mono text-[13px] leading-6"
                  placeholder="초안을 생성하면 여기에 본문이 채워집니다."
                />
              </Label>
            ) : (
              <div className="min-h-[28rem] rounded-lg border border-zinc-200 bg-white px-4 py-3">
                {body.trim() ? (
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                ) : (
                  <p className="text-sm text-zinc-500">미리볼 본문이 없습니다.</p>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy === "save"}>
                {busy === "save" ? "저장 중…" : "초안 저장"}
              </Button>
              {post.status === "published" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy === "status"}
                  onClick={() => setStatus("draft")}
                >
                  올림 표시 취소
                </Button>
              ) : null}
              {post.status === "archived" ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy === "status"}
                  onClick={() => setStatus("draft")}
                >
                  보관 해제
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy === "status"}
                  onClick={() => setStatus("archived")}
                >
                  보관
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {(body.trim() || title.trim()) && (
        <PublishExport
          title={title}
          body={body}
          images={post.images}
          busy={busy === "status"}
          onMarkedPublished={() => setStatus("published")}
        />
      )}
    </div>
  );
}

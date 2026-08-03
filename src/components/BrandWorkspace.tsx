"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildNewCutDeepLink } from "@/lib/newcut";

type SourcePost = { id: string; rawText: string; createdAt: string };
type StyleProfile = {
  id: string;
  summaryText: string;
  sampleAnchors: unknown;
  traitsJson: unknown;
  version: number;
  updatedAt: string;
} | null;
type PostSummary = {
  id: string;
  title: string | null;
  status: string;
  keyword: string | null;
  createdAt: string;
};

export function BrandWorkspace({
  brandId,
  brandName,
  initialSources,
  initialStyle,
  initialPosts,
}: {
  brandId: string;
  brandName: string;
  initialSources: SourcePost[];
  initialStyle: StyleProfile;
  initialPosts: PostSummary[];
}) {
  const router = useRouter();
  const [name, setName] = useState(brandName);
  const [sources, setSources] = useState(initialSources);
  const [style, setStyle] = useState(initialStyle);
  const [posts] = useState(initialPosts);
  const [rawText, setRawText] = useState("");
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function renameBrand(event: FormEvent) {
    event.preventDefault();
    setBusy("rename");
    setError(null);
    const res = await fetch(`/api/brands/${brandId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "이름 변경 실패");
      return;
    }
    router.refresh();
  }

  async function addSource(event: FormEvent) {
    event.preventDefault();
    setBusy("source");
    setError(null);
    const res = await fetch(`/api/brands/${brandId}/source-posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      sourcePost?: SourcePost;
    };
    setBusy(null);
    if (!res.ok || !data.sourcePost) {
      setError(data.error || "원문 등록 실패");
      return;
    }
    setSources((prev) => [data.sourcePost!, ...prev]);
    setRawText("");
    router.refresh();
  }

  async function removeSource(postId: string) {
    setBusy(`del-${postId}`);
    setError(null);
    const res = await fetch(`/api/brands/${brandId}/source-posts/${postId}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "삭제 실패");
      return;
    }
    setSources((prev) => prev.filter((s) => s.id !== postId));
    router.refresh();
  }

  async function learnStyle() {
    setBusy("learn");
    setError(null);
    const res = await fetch(`/api/brands/${brandId}/style/learn`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      styleProfile?: StyleProfile;
    };
    setBusy(null);
    if (!res.ok || !data.styleProfile) {
      setError(data.error || "스타일 학습 실패");
      return;
    }
    setStyle(data.styleProfile);
    router.refresh();
  }

  async function createPost() {
    setBusy("post");
    setError(null);
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, keyword: keyword || undefined }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      post?: PostSummary & { id: string };
    };
    setBusy(null);
    if (!res.ok || !data.post) {
      setError(data.error || "포스트 생성 실패");
      return;
    }
    router.push(`/posts/${data.post.id}`);
  }

  async function deleteBrand() {
    if (!confirm("업체를 삭제하면 원문·스타일·포스트가 모두 삭제됩니다. 계속할까요?")) return;
    setBusy("delete");
    const res = await fetch(`/api/brands/${brandId}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "삭제 실패");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  const newCutUrl = buildNewCutDeepLink({ from: "blog_writer", source: "blog", brandId });

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>업체 정보</CardTitle>
          <div className="flex gap-2">
            <a href={newCutUrl} target="_blank" rel="noopener noreferrer">
              <Button type="button" variant="outline" size="sm">
                New Cut 쇼츠 만들기
              </Button>
            </a>
            <Button type="button" variant="danger" size="sm" onClick={deleteBrand} disabled={busy === "delete"}>
              삭제
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={renameBrand} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Label className="flex-1">
              <span>이름</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
            </Label>
            <Button type="submit" disabled={busy === "rename"}>
              저장
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>원문 등록</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={addSource} className="space-y-3">
            <Label>
              <span>기존 블로그 글 (문체 학습용)</span>
              <Textarea
                rows={8}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="업체 톤이 잘 드러나는 글을 붙여넣으세요 (20자 이상)"
              />
            </Label>
            <Button type="submit" disabled={busy === "source" || rawText.trim().length < 20}>
              {busy === "source" ? "등록 중…" : "원문 추가"}
            </Button>
          </form>

          {sources.length === 0 ? (
            <p className="text-sm text-zinc-500">등록된 원문이 없습니다.</p>
          ) : (
            <ul className="space-y-3">
              {sources.map((source) => (
                <li key={source.id} className="rounded-lg border border-zinc-200 p-3">
                  <p className="whitespace-pre-wrap text-sm text-zinc-700 line-clamp-4">{source.rawText}</p>
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy === `del-${source.id}`}
                      onClick={() => removeSource(source.id)}
                    >
                      삭제
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>스타일 프로필</CardTitle>
          <Button type="button" onClick={learnStyle} disabled={busy === "learn" || sources.length === 0}>
            {busy === "learn" ? "학습 중…" : style ? "다시 학습" : "문체 학습"}
          </Button>
        </CardHeader>
        <CardContent>
          {!style ? (
            <p className="text-sm text-zinc-500">아직 학습된 스타일이 없습니다. 원문을 추가한 뒤 학습하세요.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge>v{style.version}</Badge>
                <span className="text-zinc-500">
                  {new Date(style.updatedAt).toLocaleString("ko-KR")}
                </span>
              </div>
              <p className="whitespace-pre-wrap leading-6 text-zinc-800">{style.summaryText}</p>
              {style.traitsJson ? (
                <pre className="overflow-x-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">
                  {JSON.stringify(style.traitsJson, null, 2)}
                </pre>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>새 포스트</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label>
            <span>키워드 (선택)</span>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="예: 봄 시즌 신메뉴"
              maxLength={120}
            />
          </Label>
          <Button type="button" onClick={createPost} disabled={busy === "post" || !style}>
            {busy === "post" ? "생성 중…" : "사진 수집 포스트 만들기"}
          </Button>
          {!style ? (
            <p className="text-xs text-amber-700">스타일 학습 후 포스트를 만들 수 있습니다.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>포스트 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {posts.length === 0 ? (
            <p className="text-sm text-zinc-500">아직 포스트가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {posts.map((post) => (
                <li key={post.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <Link href={`/posts/${post.id}`} className="font-medium text-zinc-900 hover:underline">
                    {post.title || post.keyword || "(제목 없음)"}
                  </Link>
                  <Badge>{post.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

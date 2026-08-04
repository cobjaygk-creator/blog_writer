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
import { postStatusLabel } from "@/lib/post-status";
import { normalizeExtendedTraits } from "@/lib/style-traits";

type SourcePost = {
  id: string;
  rawText: string;
  sourceUrl?: string | null;
  title?: string | null;
  createdAt: string;
};
type ImportJob = {
  id: string;
  status: string;
  targetCount: number;
  listedCount: number;
  fetchedCount: number;
  skippedCount: number;
  failedCount: number;
  error?: string | null;
};
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
  const [sourceMode, setSourceMode] = useState<"text" | "url" | "bulk">("bulk");
  const [rawText, setRawText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [blogUrl, setBlogUrl] = useState("");
  const [importProgress, setImportProgress] = useState<ImportJob | null>(null);
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
    const payload =
      sourceMode === "url"
        ? { url: sourceUrl.trim() }
        : { rawText: rawText.trim() };
    const res = await fetch(`/api/brands/${brandId}/source-posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      sourcePost?: SourcePost;
      meta?: { title?: string };
    };
    setBusy(null);
    if (!res.ok || !data.sourcePost) {
      setError(data.error || "원문 등록 실패");
      return;
    }
    setSources((prev) => [data.sourcePost!, ...prev]);
    setRawText("");
    setSourceUrl("");
    router.refresh();
  }

  async function refreshSources() {
    const res = await fetch(`/api/brands/${brandId}/source-posts`);
    const data = (await res.json().catch(() => ({}))) as { sourcePosts?: SourcePost[] };
    if (res.ok && data.sourcePosts) setSources(data.sourcePosts);
  }

  async function bulkImport(event: FormEvent) {
    event.preventDefault();
    setBusy("bulk");
    setError(null);
    setImportProgress(null);

    const createRes = await fetch(`/api/brands/${brandId}/source-import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blogUrl: blogUrl.trim(), autoLearn: true }),
    });
    const createData = (await createRes.json().catch(() => ({}))) as {
      error?: string;
      job?: ImportJob;
    };
    if (!createRes.ok || !createData.job) {
      setBusy(null);
      setError(createData.error || "블로그 일괄 가져오기 시작 실패");
      return;
    }

    let job = createData.job;
    setImportProgress(job);

    while (job.status === "fetching" || job.status === "learning" || job.status === "listing") {
      if (job.status === "learning") {
        setImportProgress(job);
      }
      const tickRes = await fetch(`/api/brands/${brandId}/source-import/${job.id}/tick`, {
        method: "POST",
      });
      const tickData = (await tickRes.json().catch(() => ({}))) as {
        error?: string;
        job?: ImportJob;
      };
      if (!tickRes.ok || !tickData.job) {
        setBusy(null);
        setError(tickData.error || "가져오기 진행 중 오류");
        return;
      }
      job = tickData.job;
      setImportProgress(job);
      if (job.status === "fetching") {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    setBusy(null);
    if (job.error) setError(job.error);
    await refreshSources();

    const styleRes = await fetch(`/api/brands/${brandId}`);
    const styleData = (await styleRes.json().catch(() => ({}))) as {
      brand?: { styleProfile?: StyleProfile };
    };
    if (styleData.brand?.styleProfile) setStyle(styleData.brand.styleProfile);
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

  async function deleteBrand() {
    if (!confirm("테마를 삭제하면 원문·스타일·글이 모두 삭제됩니다. 계속할까요?")) return;
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
          <CardTitle>테마 정보</CardTitle>
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
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>원문 등록</CardTitle>
          <div className="flex rounded-lg border border-zinc-200 p-0.5 text-xs">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 ${sourceMode === "bulk" ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
              onClick={() => setSourceMode("bulk")}
            >
              블로그 일괄
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 ${sourceMode === "url" ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
              onClick={() => setSourceMode("url")}
            >
              URL
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 ${sourceMode === "text" ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
              onClick={() => setSourceMode("text")}
            >
              붙여넣기
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {sourceMode === "bulk" ? (
            <form onSubmit={bulkImport} className="space-y-3">
              <Label>
                <span>네이버 블로그 URL</span>
                <Input
                  type="url"
                  required
                  value={blogUrl}
                  onChange={(e) => setBlogUrl(e.target.value)}
                  placeholder="https://blog.naver.com/블로그ID"
                  disabled={busy === "bulk"}
                />
                <span className="block text-xs font-normal text-zinc-500">
                  최신 공개글 최대 100개를 가져와 원문으로 저장하고, 말투·용어·제품·편집 습관을 심화 학습합니다.
                  본인 운영 블로그의 공개글만 사용해 주세요.
                </span>
              </Label>
              <Button type="submit" disabled={busy === "bulk" || !blogUrl.trim()}>
                {busy === "bulk"
                  ? importProgress?.status === "learning"
                    ? "문체 학습 중…"
                    : importProgress
                      ? `가져오는 중… ${importProgress.fetchedCount + importProgress.skippedCount + importProgress.failedCount}/${importProgress.targetCount}`
                      : "목록 수집 중…"
                  : "일괄 가져오기 + 학습"}
              </Button>
              {importProgress ? (
                <p className="text-xs text-zinc-500">
                  성공 {importProgress.fetchedCount} · 중복/스킵 {importProgress.skippedCount} · 실패{" "}
                  {importProgress.failedCount}
                  {importProgress.status === "completed" ? " · 완료" : ""}
                </p>
              ) : null}
            </form>
          ) : (
            <form onSubmit={addSource} className="space-y-3">
              {sourceMode === "url" ? (
                <Label>
                  <span>블로그 글 URL</span>
                  <Input
                    type="url"
                    required
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://blog.naver.com/... 또는 일반 블로그 URL"
                  />
                  <span className="block text-xs font-normal text-zinc-500">
                    글 하나만 가져와 문체 학습용 원문으로 저장합니다.
                  </span>
                </Label>
              ) : (
                <Label>
                  <span>기존 블로그 글 (문체 학습용)</span>
                  <Textarea
                    rows={8}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="테마 톤이 잘 드러나는 글을 붙여넣으세요 (20자 이상)"
                  />
                </Label>
              )}
              <Button
                type="submit"
                disabled={
                  busy === "source" ||
                  (sourceMode === "url" ? !sourceUrl.trim() : rawText.trim().length < 20)
                }
              >
                {busy === "source" ? (sourceMode === "url" ? "가져오는 중…" : "등록 중…") : "원문 추가"}
              </Button>
            </form>
          )}

          {sources.length === 0 ? (
            <p className="text-sm text-zinc-500">등록된 원문이 없습니다.</p>
          ) : (
            <ul className="space-y-3">
              {sources.map((source) => (
                <li key={source.id} className="rounded-lg border border-zinc-200 p-3">
                  {source.title ? (
                    <p className="mb-1 text-sm font-medium text-zinc-800">{source.title}</p>
                  ) : null}
                  {source.sourceUrl ? (
                    <a
                      href={source.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mb-2 block truncate text-xs text-zinc-500 hover:underline"
                    >
                      {source.sourceUrl}
                    </a>
                  ) : null}
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
              <StyleTraitsView traits={style.traitsJson} />
              <p className="text-xs text-zinc-500">
                학습이 끝나면 상단 메뉴의 <strong>새 글</strong>에서 이 테마 문체로 글을 만들 수 있습니다.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>머리말·꼬리말 템플릿</CardTitle>
          <Link href={`/brands/${brandId}/templates`}>
            <Button type="button" size="sm" variant="outline">
              템플릿 관리
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-600">
            자주 쓰는 인사말·맺음말을 템플릿으로 저장해 두고, 포스트 편집에서 선택 후 적용할 수 있습니다.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>다음 단계</CardTitle>
          {style ? (
            <Link href={`/posts/new?brandId=${brandId}`}>
              <Button type="button" size="sm">
                새 글
              </Button>
            </Link>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {style ? (
            <p className="text-sm text-zinc-600">
              문체 학습이 완료되었습니다. 새 글에서 이 테마를 선택해 글을 만드세요.
            </p>
          ) : (
            <p className="text-sm text-amber-700">샘플 원문을 넣고 문체 학습을 마치면 글을 만들 수 있습니다.</p>
          )}
          {posts.length > 0 ? (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {posts.map((post) => (
                <li key={post.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <Link href={`/posts/${post.id}`} className="font-medium text-zinc-900 hover:underline">
                    {post.title || post.keyword || "(제목 없음)"}
                  </Link>
                  <Badge>{postStatusLabel(post.status)}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">이 테마로 만든 글은 아직 없습니다.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StyleTraitsView({ traits }: { traits: unknown }) {
  const t = normalizeExtendedTraits(traits);
  return (
    <div className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 sm:grid-cols-2">
      <Trait label="톤" value={t.tone} />
      <Trait label="문장" value={t.sentenceLength} />
      <Trait label="줄바꿈" value={t.lineBreakStyle} />
      <Trait label="이모지" value={t.emojiUsage} />
      <Trait label="자주 쓰는 이모지" value={t.frequentEmojis.join(" ") || "-"} />
      <Trait label="강조" value={t.emphasisStyle} />
      <Trait label="글자 크기" value={t.fontSizes.join(", ") || "-"} />
      <div>
        <p className="font-medium text-zinc-500">강조색</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {t.colorPalette.map((c) => (
            <span key={c} className="inline-flex items-center gap-1">
              <span className="inline-block h-3.5 w-3.5 rounded-full border border-zinc-300" style={{ backgroundColor: c }} />
              {c}
            </span>
          ))}
        </div>
      </div>
      <Trait label="도입" value={t.openerStyle} />
      <Trait label="마무리" value={t.closerStyle} />
      {t.commonPhrases.length ? <Trait label="자주 쓰는 말" value={t.commonPhrases.join(" · ")} /> : null}
      <Trait label="구성" value={t.structureNotes} />
      {t.domainTerms?.length ? <Trait label="용어" value={t.domainTerms.join(" · ")} /> : null}
      {t.productMentions?.length ? (
        <Trait label="자주 등장 제품" value={t.productMentions.join(" · ")} />
      ) : null}
      {t.ctaPhrases?.length ? <Trait label="CTA" value={t.ctaPhrases.join(" · ")} /> : null}
    </div>
  );
}

function Trait({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-medium text-zinc-500">{label}</p>
      <p className="mt-0.5 leading-5 text-zinc-800">{value}</p>
    </div>
  );
}

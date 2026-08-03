"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markdownToPlainText, markdownToPublishHtml } from "@/lib/markdown";

type PublishImage = {
  id: string;
  imageUrl: string;
  caption: string | null;
  orderIndex: number;
};

export function PublishExport({
  title,
  body,
  images,
  onMarkedPublished,
  busy,
}: {
  title: string;
  body: string;
  images: PublishImage[];
  onMarkedPublished: () => void;
  busy?: boolean;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const plainBody = useMemo(() => markdownToPlainText(body || ""), [body]);
  const htmlBody = useMemo(() => markdownToPublishHtml(body || ""), [body]);
  const fullPlain = useMemo(() => {
    const parts = [title.trim(), "", plainBody].filter(Boolean);
    return parts.join("\n");
  }, [title, plainBody]);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast(`${label} 복사됨 — 네이버/티스토리에 붙여넣으세요.`);
    } catch {
      setToast("클립보드 복사에 실패했습니다. 수동으로 선택해 복사해 주세요.");
    }
  }

  const ready = Boolean(title.trim() && plainBody.trim());

  return (
    <Card className="border-zinc-900/10">
      <CardHeader>
        <CardTitle>네이버 / 티스토리로 옮기기</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ol className="list-decimal space-y-1 pl-5 leading-6 text-zinc-700">
          <li>아래 버튼으로 제목·본문을 복사합니다.</li>
          <li>네이버 블로그 또는 티스토리 글쓰기 화면에 붙여넣습니다.</li>
          <li>사진은 순서대로 직접 업로드하고, 캡션을 맞춰 넣습니다.</li>
          <li>외부에 올린 뒤 여기서 <strong>올림 표시</strong>를 누릅니다.</li>
        </ol>

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!title.trim()} onClick={() => copy(title.trim(), "제목")}>
            제목 복사
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!plainBody.trim()}
            onClick={() => copy(plainBody, "본문(텍스트)")}
          >
            본문 복사 (텍스트)
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!htmlBody.trim()}
            onClick={() => copy(htmlBody, "본문(HTML)")}
          >
            본문 복사 (HTML)
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!ready}
            onClick={() => copy(fullPlain, "제목+본문")}
          >
            제목+본문 한번에
          </Button>
          <Button type="button" variant="ghost" disabled={!ready || busy} onClick={onMarkedPublished}>
            올림 표시
          </Button>
        </div>

        {toast ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
            {toast}
          </p>
        ) : null}

        {images.length > 0 ? (
          <div className="space-y-2">
            <p className="font-medium text-zinc-800">사진 업로드 체크리스트 (순서대로)</p>
            <ul className="space-y-2">
              {images.map((image, index) => (
                <li
                  key={image.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-zinc-500">사진 {index + 1}</p>
                    <p className="truncate text-zinc-800">{image.caption || "(캡션 없음)"}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => copy(image.imageUrl, `사진 ${index + 1} URL`)}
                    >
                      URL 복사
                    </Button>
                    <a href={image.imageUrl} target="_blank" rel="noopener noreferrer">
                      <Button type="button" size="sm" variant="ghost">
                        열기/저장
                      </Button>
                    </a>
                    {image.caption ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => copy(image.caption!, `사진 ${index + 1} 캡션`)}
                      >
                        캡션 복사
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-zinc-500">등록된 사진이 없습니다. 텍스트만 붙여넣어도 됩니다.</p>
        )}

        <p className="text-xs leading-5 text-zinc-500">
          팁: 네이버는 <strong>본문 복사(텍스트)</strong>가 무난하고, 티스토리 HTML 모드에서는{" "}
          <strong>본문 복사(HTML)</strong>가 서식 유지에 유리합니다. 자동 업로드는 지원하지 않습니다.
        </p>
      </CardContent>
    </Card>
  );
}

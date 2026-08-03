"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markdownToPlainText, markdownToPublishHtml } from "@/lib/markdown";
import { ensureImagesInMarkdown } from "@/lib/publish-body";

type PublishImage = {
  id: string;
  imageUrl: string;
  caption: string | null;
  orderIndex: number;
};

const EMBED_MAX_BYTES = 1.5 * 1024 * 1024;

export function PublishExport({
  title,
  body,
  images,
  onMarkedPublished,
  onSyncImagesIntoBody,
  busy,
}: {
  title: string;
  body: string;
  images: PublishImage[];
  onMarkedPublished: () => void;
  onSyncImagesIntoBody?: () => void;
  busy?: boolean;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const [embedding, setEmbedding] = useState(false);

  const bodyWithImages = useMemo(
    () =>
      ensureImagesInMarkdown(
        body || "",
        images.map((img) => ({ imageUrl: img.imageUrl, caption: img.caption })),
      ),
    [body, images],
  );

  const plainBody = useMemo(() => markdownToPlainText(bodyWithImages), [bodyWithImages]);
  const htmlBody = useMemo(() => markdownToPublishHtml(bodyWithImages), [bodyWithImages]);
  const fullPlain = useMemo(() => {
    const parts = [title.trim(), "", plainBody].filter(Boolean);
    return parts.join("\n");
  }, [title, plainBody]);

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast(`${label} 복사됨 — 네이버/티스토리에 붙여넣으세요.`);
    } catch {
      setToast("클립보드 복사에 실패했습니다. 수동으로 선택해 복사해 주세요.");
    }
  }

  async function copyHtmlWithImages() {
    setEmbedding(true);
    setToast(null);
    try {
      let html = htmlBody;
      const notes: string[] = [];

      for (const [index, image] of images.entries()) {
        try {
          const dataUrl = await fetchImageAsDataUrl(image.imageUrl);
          if (dataUrl) {
            html = html.split(image.imageUrl).join(dataUrl);
          } else {
            notes.push(`사진 ${index + 1}은 용량 때문에 URL로 유지했습니다.`);
          }
        } catch {
          notes.push(`사진 ${index + 1} 임베드 실패 — URL 유지.`);
        }
      }

      const plain = markdownToPlainText(bodyWithImages);
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(html);
      }

      setToast(
        notes.length
          ? `본문+이미지 복사됨. ${notes.join(" ")}`
          : "본문+이미지 복사됨 — 에디터에 붙여넣으면 사진이 함께 들어갑니다.",
      );
    } catch {
      setToast("이미지 포함 복사에 실패했습니다. HTML 복사 또는 사진 개별 저장을 사용해 주세요.");
    } finally {
      setEmbedding(false);
    }
  }

  const ready = Boolean(title.trim() && plainBody.trim());
  const missingInBody = images.filter((img) => !body.includes(img.imageUrl)).length;

  return (
    <Card className="border-zinc-900/10">
      <CardHeader>
        <CardTitle>네이버 / 티스토리로 옮기기</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ol className="list-decimal space-y-1 pl-5 leading-6 text-zinc-700">
          <li>
            <strong>본문+이미지 복사</strong>로 글과 사진을 함께 복사합니다.
          </li>
          <li>네이버/티스토리 글쓰기에 붙여넣습니다.</li>
          <li>사진이 빠지면 아래 체크리스트에서 개별 저장 후 업로드합니다.</li>
          <li>올린 뒤 <strong>올림 표시</strong>를 누릅니다.</li>
        </ol>

        {missingInBody > 0 && onSyncImagesIntoBody ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            본문에 아직 없는 사진이 {missingInBody}장 있습니다.{" "}
            <button type="button" className="underline" onClick={onSyncImagesIntoBody}>
              본문에 사진 넣기
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!ready || embedding} onClick={() => void copyHtmlWithImages()}>
            {embedding ? "이미지 준비 중…" : "본문+이미지 복사"}
          </Button>
          <Button type="button" disabled={!title.trim()} variant="outline" onClick={() => copyText(title.trim(), "제목")}>
            제목 복사
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!plainBody.trim()}
            onClick={() => copyText(plainBody, "본문(텍스트)")}
          >
            본문 복사 (텍스트)
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!htmlBody.trim()}
            onClick={() => copyText(htmlBody, "본문(HTML)")}
          >
            본문 복사 (HTML)
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!ready}
            onClick={() => copyText(fullPlain, "제목+본문")}
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
            <p className="font-medium text-zinc-800">사진 체크리스트 (붙여넣기 실패 시)</p>
            <ul className="space-y-2">
              {images.map((image, index) => (
                <li
                  key={image.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.imageUrl}
                      alt={image.caption || `사진 ${index + 1}`}
                      className="h-12 w-12 rounded object-cover"
                    />
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-500">사진 {index + 1}</p>
                      <p className="truncate text-zinc-800">{image.caption || "(캡션 없음)"}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a href={image.imageUrl} download target="_blank" rel="noopener noreferrer">
                      <Button type="button" size="sm" variant="outline">
                        저장
                      </Button>
                    </a>
                    {image.caption ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => copyText(image.caption!, `사진 ${index + 1} 캡션`)}
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
          <strong>본문+이미지 복사</strong>는 사진을 데이터로 넣어 붙여넣기를 시도합니다. 에디터/용량에 따라
          실패할 수 있으니, 그때는 사진 저장 후 수동 업로드하세요.
        </p>
      </CardContent>
    </Card>
  );
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  if (blob.size > EMBED_MAX_BYTES) return null;
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

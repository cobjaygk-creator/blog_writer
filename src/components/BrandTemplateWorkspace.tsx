"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { RichEditor } from "@/components/RichEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prepareTemplateHtml } from "@/lib/image-style";

export type BrandTemplateItem = {
  id: string;
  name: string;
  kind: "header" | "footer";
  html: string;
  updatedAt: string;
};

type Props = {
  brandId: string;
  brandName: string;
  initialTemplates: BrandTemplateItem[];
};

export function BrandTemplateWorkspace({ brandId, brandName, initialTemplates }: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"header" | "footer">("header");
  const [html, setHtml] = useState("<p></p>");
  const [editorRevision, setEditorRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function resetForm() {
    setEditingId(null);
    setName("");
    setKind("header");
    setHtml("<p></p>");
    setEditorRevision((n) => n + 1);
  }

  function startCreate(nextKind: "header" | "footer" = "header") {
    setEditingId(null);
    setName("");
    setKind(nextKind);
    setHtml("<p></p>");
    setEditorRevision((n) => n + 1);
    setError(null);
  }

  function startEdit(template: BrandTemplateItem) {
    setEditingId(template.id);
    setName(template.name);
    setKind(template.kind);
    setHtml(template.html || "<p></p>");
    setEditorRevision((n) => n + 1);
    setError(null);
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("템플릿 이름을 입력해 주세요.");
      return;
    }
    const content = (html || "").trim();
    if (!content || content === "<p></p>") {
      setError("본문 내용을 입력해 주세요.");
      return;
    }
    setBusy("save");
    setError(null);

    const payload = { name: name.trim(), kind, html: prepareTemplateHtml(content) };
    const res = await fetch(
      editingId
        ? `/api/brands/${brandId}/templates/${editingId}`
        : `/api/brands/${brandId}/templates`,
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      template?: BrandTemplateItem;
    };
    setBusy(null);
    if (!res.ok || !data.template) {
      setError(data.error || "저장 실패");
      return;
    }

    const saved = {
      ...data.template,
      updatedAt:
        typeof data.template.updatedAt === "string"
          ? data.template.updatedAt
          : new Date().toISOString(),
    };
    setTemplates((prev) => {
      const others = prev.filter((t) => t.id !== saved.id);
      return [saved, ...others].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
        return b.updatedAt.localeCompare(a.updatedAt);
      });
    });
    resetForm();
    router.refresh();
  }

  async function removeTemplate(templateId: string) {
    if (!window.confirm("이 템플릿을 삭제할까요?")) return;
    setBusy(`del-${templateId}`);
    setError(null);
    const res = await fetch(`/api/brands/${brandId}/templates/${templateId}`, {
      method: "DELETE",
    });
    setBusy(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "삭제 실패");
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    if (editingId === templateId) resetForm();
    router.refresh();
  }

  const headers = templates.filter((t) => t.kind === "header");
  const footers = templates.filter((t) => t.kind === "footer");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">{brandName}</p>
          <h2 className="text-xl font-semibold text-zinc-900">머리말·꼬리말 템플릿</h2>
          <p className="mt-1 text-sm text-zinc-600">
            에디터로 이미지·텍스트를 넣어 두고, 포스트 편집에서 선택한 뒤 적용할 수 있습니다.
          </p>
        </div>
        <Link href={`/brands/${brandId}`} className="text-sm text-zinc-500 hover:text-zinc-800">
          ← 업체 학습
        </Link>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <TemplateList
          title="머리말"
          items={headers}
          busy={busy}
          onEdit={startEdit}
          onDelete={(id) => void removeTemplate(id)}
          onCreate={() => startCreate("header")}
        />
        <TemplateList
          title="꼬리말"
          items={footers}
          busy={busy}
          onEdit={startEdit}
          onDelete={(id) => void removeTemplate(id)}
          onCreate={() => startCreate("footer")}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "템플릿 수정" : "새 템플릿"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveTemplate} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Label>
                <span>이름</span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 기본 인사말"
                  maxLength={80}
                  required
                />
              </Label>
              <Label>
                <span>종류</span>
                <select
                  className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  value={kind}
                  onChange={(e) => setKind(e.target.value === "footer" ? "footer" : "header")}
                >
                  <option value="header">머리말</option>
                  <option value="footer">꼬리말</option>
                </select>
              </Label>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-zinc-800">내용</p>
              <RichEditor
                value={html}
                revision={editorRevision}
                onChange={setHtml}
                imageMode="natural"
                placeholder="머리말 또는 꼬리말 내용을 입력하세요. 이미지 URL 삽입도 가능합니다."
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy === "save"}>
                {busy === "save" ? "저장 중…" : editingId ? "수정 저장" : "템플릿 저장"}
              </Button>
              {editingId ? (
                <Button type="button" variant="ghost" onClick={resetForm}>
                  새로 만들기
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function TemplateList({
  title,
  items,
  busy,
  onEdit,
  onDelete,
  onCreate,
}: {
  title: string;
  items: BrandTemplateItem[];
  busy: string | null;
  onEdit: (template: BrandTemplateItem) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={onCreate}>
          추가
        </Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">아직 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">{item.name}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(item.updatedAt).toLocaleString("ko-KR")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge>{item.kind === "header" ? "머리말" : "꼬리말"}</Badge>
                  <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(item)}>
                    수정
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy === `del-${item.id}`}
                    onClick={() => onDelete(item.id)}
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
  );
}

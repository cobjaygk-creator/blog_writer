"use client";

import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Table,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ImageGroup } from "@/components/editor/image-group-extension";
import { TemplateBlock } from "@/components/editor/template-block-extension";
import {
  NATURAL_IMAGE_STYLE,
  prepareEditorHtml,
  prepareTemplateHtml,
  SINGLE_IMAGE_STYLE,
} from "@/lib/image-style";
import { cn } from "@/lib/utils";

import "prosemirror-view/style/prosemirror.css";

const COLORS = ["#222222", "#E85D04", "#C2255C", "#0B7285", "#2F9E44", "#F08C00", "#5F3DC4"];
const HIGHLIGHTS = ["#FEF08A", "#BBF7D0", "#BAE6FD", "#FBCFE8", "#E9D5FF"];
const SIZES = [
  { label: "본문", value: "15px" },
  { label: "강조", value: "18px" },
  { label: "큰글", value: "22px" },
];

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  /** Bump to force content reload from value (e.g. after generate). */
  revision?: number;
  accentColors?: string[];
  /** `natural` keeps full image height (templates). Default crops post photos. */
  imageMode?: "crop" | "natural";
};

export function RichEditor({
  value,
  onChange,
  placeholder = "초안을 생성하면 여기에 표시됩니다.",
  className,
  revision = 0,
  accentColors,
  imageMode = "crop",
}: Props) {
  const palette = [...new Set([...(accentColors || []), ...COLORS])].slice(0, 10);
  const prepare = imageMode === "natural" ? prepareTemplateHtml : prepareEditorHtml;
  const imageStyle = imageMode === "natural" ? NATURAL_IMAGE_STYLE : SINGLE_IMAGE_STYLE;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  const [headingOpen, setHeadingOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);

  async function insertImageFiles(files: File[]) {
    const ed = editorRef.current;
    if (!ed) return;
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const src = await readFileAsDataUrl(file);
      ed.chain().focus().setImage({ src, alt: file.name }).run();
    }
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TextStyle,
      Color,
      FontSize,
      Underline,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      TableKit.configure({
        table: { resizable: false },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          style: imageStyle,
        },
      }),
      ImageGroup,
      TemplateBlock,
      Placeholder.configure({ placeholder }),
    ],
    content: prepare(value || "") || "<p></p>",
    editorProps: {
      attributes: {
        class: cn(
          "rich-doc min-h-[28rem] px-4 py-3 focus:outline-none",
          imageMode === "natural" && "rich-doc--natural-images",
        ),
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        const images = [...files].filter((f) => f.type.startsWith("image/"));
        if (!images.length) return false;
        event.preventDefault();
        void insertImageFiles(images);
        return true;
      },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files;
        if (!files?.length) return false;
        const images = [...files].filter((f) => f.type.startsWith("image/"));
        if (!images.length) return false;
        event.preventDefault();
        void insertImageFiles(images);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(prepareRef.current(ed.getHTML()));
    },
  });

  editorRef.current = editor;

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = prepare(value || "") || "<p></p>";
    if (normalizeHtml(current) !== normalizeHtml(next)) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only on revision / external value reset
  }, [editor, revision]);

  if (!editor) {
    return (
      <div className="min-h-[28rem] rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-400">
        에디터 로딩…
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border border-zinc-200 bg-white", className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-zinc-100 px-2 py-1.5">
        <IconBtn
          title="실행 취소"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo2 className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="다시 실행"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo2 className="h-4 w-4" />
        </IconBtn>

        <Sep />

        <div className="relative">
          <IconBtn
            title="제목"
            active={editor.isActive("heading")}
            onClick={() => {
              setHeadingOpen((v) => !v);
              setListOpen(false);
              setColorOpen(false);
            }}
          >
            <Heading2 className="h-4 w-4" />
          </IconBtn>
          {headingOpen ? (
            <Dropdown onClose={() => setHeadingOpen(false)}>
              <DropItem
                label="본문"
                onClick={() => {
                  editor.chain().focus().setParagraph().run();
                  setHeadingOpen(false);
                }}
              />
              <DropItem
                label="제목 1"
                onClick={() => {
                  editor.chain().focus().toggleHeading({ level: 1 }).run();
                  setHeadingOpen(false);
                }}
              />
              <DropItem
                label="제목 2"
                onClick={() => {
                  editor.chain().focus().toggleHeading({ level: 2 }).run();
                  setHeadingOpen(false);
                }}
              />
              <DropItem
                label="제목 3"
                onClick={() => {
                  editor.chain().focus().toggleHeading({ level: 3 }).run();
                  setHeadingOpen(false);
                }}
              />
            </Dropdown>
          ) : null}
        </div>

        <div className="relative">
          <IconBtn
            title="목록"
            active={editor.isActive("bulletList") || editor.isActive("orderedList")}
            onClick={() => {
              setListOpen((v) => !v);
              setHeadingOpen(false);
              setColorOpen(false);
            }}
          >
            <List className="h-4 w-4" />
          </IconBtn>
          {listOpen ? (
            <Dropdown onClose={() => setListOpen(false)}>
              <DropItem
                label="글머리 기호"
                icon={<List className="h-3.5 w-3.5" />}
                onClick={() => {
                  editor.chain().focus().toggleBulletList().run();
                  setListOpen(false);
                }}
              />
              <DropItem
                label="번호 목록"
                icon={<ListOrdered className="h-3.5 w-3.5" />}
                onClick={() => {
                  editor.chain().focus().toggleOrderedList().run();
                  setListOpen(false);
                }}
              />
            </Dropdown>
          ) : null}
        </div>

        <Sep />

        <IconBtn
          title="굵게"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="기울임"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="취소선"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="밑줄"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </IconBtn>

        <div className="relative">
          <IconBtn
            title="글자색 / 형광펜"
            active={Boolean(editor.getAttributes("textStyle").color) || editor.isActive("highlight")}
            onClick={() => {
              setColorOpen((v) => !v);
              setHeadingOpen(false);
              setListOpen(false);
            }}
          >
            <Highlighter className="h-4 w-4" />
          </IconBtn>
          {colorOpen ? (
            <Dropdown onClose={() => setColorOpen(false)} className="w-52 p-2">
              <p className="mb-1.5 text-[11px] font-medium text-zinc-500">글자색</p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {palette.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={color}
                    className="h-6 w-6 rounded-full border border-zinc-200"
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      editor.chain().focus().setColor(color).run();
                      setColorOpen(false);
                    }}
                  />
                ))}
                <button
                  type="button"
                  className="h-6 rounded-md border border-zinc-200 px-1.5 text-[10px] text-zinc-600"
                  onClick={() => {
                    editor.chain().focus().unsetColor().run();
                    setColorOpen(false);
                  }}
                >
                  해제
                </button>
              </div>
              <p className="mb-1.5 text-[11px] font-medium text-zinc-500">형광펜</p>
              <div className="flex flex-wrap gap-1.5">
                {HIGHLIGHTS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={color}
                    className="h-6 w-6 rounded-full border border-zinc-200"
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      editor.chain().focus().toggleHighlight({ color }).run();
                      setColorOpen(false);
                    }}
                  />
                ))}
                <button
                  type="button"
                  className="h-6 rounded-md border border-zinc-200 px-1.5 text-[10px] text-zinc-600"
                  onClick={() => {
                    editor.chain().focus().unsetHighlight().run();
                    setColorOpen(false);
                  }}
                >
                  해제
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1 border-t border-zinc-100 pt-2">
                {SIZES.map((size) => (
                  <button
                    key={size.value}
                    type="button"
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px]",
                      editor.getAttributes("textStyle").fontSize === size.value
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-700",
                    )}
                    onClick={() => {
                      editor.chain().focus().setFontSize(size.value).run();
                      setColorOpen(false);
                    }}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </Dropdown>
          ) : null}
        </div>

        <Sep />

        <IconBtn
          title="왼쪽 정렬"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="가운데 정렬"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="오른쪽 정렬"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="양쪽 정렬"
          active={editor.isActive({ textAlign: "justify" })}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        >
          <AlignJustify className="h-4 w-4" />
        </IconBtn>

        <Sep />

        <IconBtn
          title="표 삽입"
          active={editor.isActive("table")}
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          <Table className="h-4 w-4" />
        </IconBtn>
        <IconBtn title="이미지 추가" onClick={() => fileInputRef.current?.click()}>
          <ImagePlus className="h-4 w-4" />
        </IconBtn>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files ? [...e.target.files] : [];
            void insertImageFiles(files);
            e.target.value = "";
          }}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px self-center bg-zinc-200" />;
}

function IconBtn({
  title,
  onClick,
  active,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-700 transition",
        active ? "bg-zinc-900 text-white" : "hover:bg-zinc-100",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
      )}
    >
      {children}
    </button>
  );
}

function Dropdown({
  children,
  onClose,
  className,
}: {
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointer(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-editor-dropdown]")) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [onClose]);

  return (
    <div
      data-editor-dropdown
      className={cn(
        "absolute left-0 top-full z-30 mt-1 min-w-[9rem] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg",
        className,
      )}
    >
      {children}
    </div>
  );
}

function DropItem({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-800 hover:bg-zinc-50"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("이미지를 읽지 못했습니다."));
    };
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function normalizeHtml(html: string) {
  return html.replace(/\s+/g, " ").trim();
}

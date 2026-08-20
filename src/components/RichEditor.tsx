"use client";

import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import Youtube from "@tiptap/extension-youtube";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  CodeSquare,
  Eraser,
  Heading2,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table,
  TableCellsMerge,
  Underline as UnderlineIcon,
  Undo2,
  Video,
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

const COLORS = ["#222222", "#5E56F0", "#E85D04", "#C2255C", "#0B7285", "#2F9E44", "#F08C00", "#868E96"];
const HIGHLIGHTS = ["#FEF08A", "#BBF7D0", "#BAE6FD", "#FBCFE8", "#E9D5FF", "#FECACA"];
const SIZES = [
  { label: "작게", value: "13px" },
  { label: "본문", value: "15px" },
  { label: "강조", value: "18px" },
  { label: "큰글", value: "22px" },
  { label: "특대", value: "28px" },
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
  /** Renders above the toolbar inside the sticky chrome (e.g. edit/preview tabs). */
  headerSlot?: ReactNode;
  /** Stick toolbar to the top of the nearest scroll parent (default true). */
  stickyToolbar?: boolean;
};

export function RichEditor({
  value,
  onChange,
  placeholder = "초안을 생성하면 여기에 표시됩니다.",
  className,
  revision = 0,
  accentColors,
  imageMode = "crop",
  headerSlot,
  stickyToolbar = true,
}: Props) {
  const palette = [...new Set([...(accentColors || []), ...COLORS])].slice(0, 12);
  const prepare = imageMode === "natural" ? prepareTemplateHtml : prepareEditorHtml;
  const imageStyle = imageMode === "natural" ? NATURAL_IMAGE_STYLE : SINGLE_IMAGE_STYLE;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  const [headingOpen, setHeadingOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);

  function closeMenus() {
    setHeadingOpen(false);
    setListOpen(false);
    setColorOpen(false);
    setTableOpen(false);
  }

  async function insertImageFiles(files: File[]) {
    const ed = editorRef.current;
    if (!ed) return;
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const src = await readFileAsDataUrl(file);
      ed.chain().focus().setImage({ src, alt: file.name }).run();
    }
  }

  function setLink() {
    const ed = editorRef.current;
    if (!ed) return;
    const prev = ed.getAttributes("link").href as string | undefined;
    const url = window.prompt("링크 URL", prev || "https://");
    if (url === null) return;
    if (url.trim() === "") {
      ed.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    ed.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function insertYoutube() {
    const ed = editorRef.current;
    if (!ed) return;
    const url = window.prompt("YouTube URL", "https://www.youtube.com/watch?v=");
    if (!url?.trim()) return;
    ed.chain().focus().setYoutubeVideo({ src: url.trim() }).run();
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: false,
      }),
      TextStyle,
      Color,
      FontSize,
      Underline,
      Subscript,
      Superscript,
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: "text-[var(--accent)] underline underline-offset-2",
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({
        table: { resizable: true },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          style: imageStyle,
        },
      }),
      Youtube.configure({
        controls: true,
        nocookie: true,
        width: 640,
        height: 360,
      }),
      ImageGroup,
      TemplateBlock,
      Placeholder.configure({ placeholder }),
    ],
    content: prepare(value || "") || "<p></p>",
    editorProps: {
      attributes: {
        class: cn(
          "rich-doc min-h-[32rem] px-5 py-4 focus:outline-none md:px-6",
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
      <div className="min-h-[32rem] rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--muted)]">
        에디터 로딩…
      </div>
    );
  }

  const inTable = editor.isActive("table");

  return (
    <div className={cn("rounded-lg border border-[var(--border)] bg-white", className)}>
      <div
        className={cn(
          "z-30 border-b border-[var(--border)] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90",
          stickyToolbar && "sticky top-0 shadow-sm",
        )}
      >
        {headerSlot ? (
          <div className="border-b border-[var(--border)] px-3 py-2">{headerSlot}</div>
        ) : null}
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
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
              setTableOpen(false);
            }}
          >
            <Heading2 className="h-4 w-4" />
          </IconBtn>
          {headingOpen ? (
            <Dropdown onClose={closeMenus}>
              <DropItem
                label="본문"
                onClick={() => {
                  editor.chain().focus().setParagraph().run();
                  closeMenus();
                }}
              />
              {[1, 2, 3, 4].map((level) => (
                <DropItem
                  key={level}
                  label={`제목 ${level}`}
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .toggleHeading({ level: level as 1 | 2 | 3 | 4 })
                      .run();
                    closeMenus();
                  }}
                />
              ))}
            </Dropdown>
          ) : null}
        </div>

        <div className="relative">
          <IconBtn
            title="목록"
            active={
              editor.isActive("bulletList") ||
              editor.isActive("orderedList") ||
              editor.isActive("taskList")
            }
            onClick={() => {
              setListOpen((v) => !v);
              setHeadingOpen(false);
              setColorOpen(false);
              setTableOpen(false);
            }}
          >
            <List className="h-4 w-4" />
          </IconBtn>
          {listOpen ? (
            <Dropdown onClose={closeMenus}>
              <DropItem
                label="글머리 기호"
                icon={<List className="h-3.5 w-3.5" />}
                onClick={() => {
                  editor.chain().focus().toggleBulletList().run();
                  closeMenus();
                }}
              />
              <DropItem
                label="번호 목록"
                icon={<ListOrdered className="h-3.5 w-3.5" />}
                onClick={() => {
                  editor.chain().focus().toggleOrderedList().run();
                  closeMenus();
                }}
              />
              <DropItem
                label="체크리스트"
                icon={<ListTodo className="h-3.5 w-3.5" />}
                onClick={() => {
                  editor.chain().focus().toggleTaskList().run();
                  closeMenus();
                }}
              />
            </Dropdown>
          ) : null}
        </div>

        <IconBtn
          title="인용"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="구분선"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus className="h-4 w-4" />
        </IconBtn>

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
          title="밑줄"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="취소선"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="인라인 코드"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="코드 블록"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <CodeSquare className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="위 첨자"
          active={editor.isActive("superscript")}
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
        >
          <SuperscriptIcon className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="아래 첨자"
          active={editor.isActive("subscript")}
          onClick={() => editor.chain().focus().toggleSubscript().run()}
        >
          <SubscriptIcon className="h-4 w-4" />
        </IconBtn>

        <div className="relative">
          <IconBtn
            title="글자색 / 형광펜 / 크기"
            active={Boolean(editor.getAttributes("textStyle").color) || editor.isActive("highlight")}
            onClick={() => {
              setColorOpen((v) => !v);
              setHeadingOpen(false);
              setListOpen(false);
              setTableOpen(false);
            }}
          >
            <Highlighter className="h-4 w-4" />
          </IconBtn>
          {colorOpen ? (
            <Dropdown onClose={closeMenus} className="w-56 p-2">
              <p className="mb-1.5 text-[11px] font-medium text-[color:var(--muted)]">글자색</p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {palette.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={color}
                    className="h-6 w-6 rounded-full border border-[var(--border)]"
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      editor.chain().focus().setColor(color).run();
                      closeMenus();
                    }}
                  />
                ))}
                <button
                  type="button"
                  className="h-6 rounded-md border border-[var(--border)] px-1.5 text-[10px] text-[color:var(--muted)]"
                  onClick={() => {
                    editor.chain().focus().unsetColor().run();
                    closeMenus();
                  }}
                >
                  해제
                </button>
              </div>
              <p className="mb-1.5 text-[11px] font-medium text-[color:var(--muted)]">형광펜</p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {HIGHLIGHTS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={color}
                    className="h-6 w-6 rounded-full border border-[var(--border)]"
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      editor.chain().focus().toggleHighlight({ color }).run();
                      closeMenus();
                    }}
                  />
                ))}
                <button
                  type="button"
                  className="h-6 rounded-md border border-[var(--border)] px-1.5 text-[10px] text-[color:var(--muted)]"
                  onClick={() => {
                    editor.chain().focus().unsetHighlight().run();
                    closeMenus();
                  }}
                >
                  해제
                </button>
              </div>
              <p className="mb-1.5 text-[11px] font-medium text-[color:var(--muted)]">글자 크기</p>
              <div className="flex flex-wrap gap-1">
                {SIZES.map((size) => (
                  <button
                    key={size.value}
                    type="button"
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px]",
                      editor.getAttributes("textStyle").fontSize === size.value
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[var(--background)] text-[color:var(--foreground)]",
                    )}
                    onClick={() => {
                      editor.chain().focus().setFontSize(size.value).run();
                      closeMenus();
                    }}
                  >
                    {size.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] text-[color:var(--muted)]"
                  onClick={() => {
                    editor.chain().focus().unsetFontSize().run();
                    closeMenus();
                  }}
                >
                  기본
                </button>
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

        <IconBtn title="링크" active={editor.isActive("link")} onClick={setLink}>
          <Link2 className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="링크 제거"
          disabled={!editor.isActive("link")}
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <Eraser className="h-4 w-4" />
        </IconBtn>
        <IconBtn title="이미지 추가" onClick={() => fileInputRef.current?.click()}>
          <ImagePlus className="h-4 w-4" />
        </IconBtn>
        <IconBtn title="YouTube" onClick={insertYoutube}>
          <Video className="h-4 w-4" />
        </IconBtn>

        <div className="relative">
          <IconBtn
            title="표"
            active={inTable}
            onClick={() => {
              setTableOpen((v) => !v);
              setHeadingOpen(false);
              setListOpen(false);
              setColorOpen(false);
            }}
          >
            <Table className="h-4 w-4" />
          </IconBtn>
          {tableOpen ? (
            <Dropdown onClose={closeMenus} className="w-44">
              <DropItem
                label="표 삽입 (3×3)"
                icon={<Table className="h-3.5 w-3.5" />}
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run();
                  closeMenus();
                }}
              />
              <DropItem
                label="행 위에 추가"
                onClick={() => {
                  editor.chain().focus().addRowBefore().run();
                  closeMenus();
                }}
              />
              <DropItem
                label="행 아래에 추가"
                onClick={() => {
                  editor.chain().focus().addRowAfter().run();
                  closeMenus();
                }}
              />
              <DropItem
                label="열 왼쪽에 추가"
                onClick={() => {
                  editor.chain().focus().addColumnBefore().run();
                  closeMenus();
                }}
              />
              <DropItem
                label="열 오른쪽에 추가"
                onClick={() => {
                  editor.chain().focus().addColumnAfter().run();
                  closeMenus();
                }}
              />
              <DropItem
                label="행 삭제"
                onClick={() => {
                  editor.chain().focus().deleteRow().run();
                  closeMenus();
                }}
              />
              <DropItem
                label="열 삭제"
                onClick={() => {
                  editor.chain().focus().deleteColumn().run();
                  closeMenus();
                }}
              />
              <DropItem
                label="셀 병합/분할"
                icon={<TableCellsMerge className="h-3.5 w-3.5" />}
                onClick={() => {
                  if (editor.can().mergeCells()) {
                    editor.chain().focus().mergeCells().run();
                  } else {
                    editor.chain().focus().splitCell().run();
                  }
                  closeMenus();
                }}
              />
              <DropItem
                label="표 삭제"
                onClick={() => {
                  editor.chain().focus().deleteTable().run();
                  closeMenus();
                }}
              />
            </Dropdown>
          ) : null}
        </div>

        <Sep />

        <IconBtn
          title="서식 지우기"
          onClick={() =>
            editor.chain().focus().unsetAllMarks().clearNodes().setParagraph().run()
          }
        >
          <RemoveFormatting className="h-4 w-4" />
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
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px self-center bg-[var(--border)]" />;
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
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--foreground)] transition",
        active ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--accent-soft)]",
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
        "absolute left-0 top-full z-40 mt-1 max-h-[min(24rem,70vh)] min-w-[9rem] overflow-y-auto rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg",
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
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[color:var(--foreground)] hover:bg-[var(--accent-soft)]"
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

"use client";

import { useEffect, useRef } from "react";
import Editor from "@toast-ui/editor";
import "@toast-ui/editor/dist/toastui-editor.css";
import "@toast-ui/editor/dist/i18n/ko-kr";

import { stripEmptyBlocks } from "@/lib/content";
import { buildImageGroupHtml } from "@/lib/image-group";
import { cn } from "@/lib/utils";

export type LibraryImage = { src: string; alt?: string };

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  /** Bump to force content reload from value (e.g. after generate). */
  revision?: number;
  libraryImages?: LibraryImage[];
};

function normalizeHtml(html: string) {
  return html.replace(/\s+/g, " ").trim();
}

function createLabelButton(label: string, onClick: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "toastui-editor-toolbar-icons bw-se-tool-btn";
  button.style.cssText =
    "background-image:none;width:auto;min-width:auto;margin:0;padding:0 8px;font-size:12px;line-height:32px;color:#333;";
  button.textContent = label;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    onClick();
  });
  return button;
}

export function SmartEditor({
  value,
  onChange,
  placeholder = "초안을 생성하면 여기에 표시됩니다.",
  className,
  revision = 0,
  libraryImages = [],
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  const libraryRef = useRef(libraryImages);
  const silentRef = useRef(false);

  onChangeRef.current = onChange;
  libraryRef.current = libraryImages;

  useEffect(() => {
    if (!mountRef.current || editorRef.current) return;

    const insertGroup = (cols: 2 | 3) => {
      const editor = editorRef.current;
      if (!editor) return;
      const images = libraryRef.current.filter((img) => img.src);
      if (images.length < 2) {
        window.alert("묶으려면 업로드된 사진이 2장 이상 필요합니다.");
        return;
      }
      const html = buildImageGroupHtml(
        images.map((img) => ({ imageUrl: img.src, caption: img.alt })),
        cols,
      );
      silentRef.current = true;
      editor.setHTML(`${editor.getHTML()}${html}`);
      silentRef.current = false;
      onChangeRef.current(editor.getHTML());
    };

    const editor = new Editor({
      el: mountRef.current,
      height: "560px",
      minHeight: "420px",
      initialEditType: "wysiwyg",
      previewStyle: "tab",
      hideModeSwitch: true,
      usageStatistics: false,
      language: "ko-KR",
      autofocus: false,
      placeholder,
      toolbarItems: [
        ["heading", "bold", "italic", "strike"],
        ["hr", "quote"],
        ["ul", "ol", "indent", "outdent"],
        ["table", "image", "link"],
        ["scrollSync"],
      ],
      hooks: {
        addImageBlobHook(blob, callback) {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") {
              callback(reader.result, "image");
            }
          };
          reader.readAsDataURL(blob);
        },
      },
    });

    editor.insertToolbarItem(
      { groupIndex: 3, itemIndex: 3 },
      {
        name: "group2",
        tooltip: "업로드 사진 2열 묶음",
        el: createLabelButton("2열", () => insertGroup(2)),
      },
    );
    editor.insertToolbarItem(
      { groupIndex: 3, itemIndex: 4 },
      {
        name: "group3",
        tooltip: "업로드 사진 3열 묶음",
        el: createLabelButton("3열", () => insertGroup(3)),
      },
    );

    silentRef.current = true;
    editor.setHTML(value?.trim() ? stripEmptyBlocks(value) : "<p><br></p>");
    silentRef.current = false;

    editor.on("change", () => {
      if (silentRef.current) return;
      onChangeRef.current(editor.getHTML());
    });

    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = value?.trim() ? stripEmptyBlocks(value) : "<p><br></p>";
    if (normalizeHtml(editor.getHTML()) === normalizeHtml(next)) return;
    silentRef.current = true;
    editor.setHTML(next);
    silentRef.current = false;
  }, [revision, value]);

  return (
    <div className={cn("bw-smart-editor overflow-hidden rounded-lg border border-zinc-200 bg-white", className)}>
      <div ref={mountRef} />
    </div>
  );
}

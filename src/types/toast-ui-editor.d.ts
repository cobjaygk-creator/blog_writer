declare module "@toast-ui/editor" {
  export type EditorType = "markdown" | "wysiwyg";

  export interface EditorOptions {
    el: HTMLElement;
    height?: string;
    minHeight?: string;
    initialValue?: string;
    initialEditType?: EditorType;
    previewStyle?: "tab" | "vertical";
    hideModeSwitch?: boolean;
    usageStatistics?: boolean;
    language?: string;
    autofocus?: boolean;
    placeholder?: string;
    toolbarItems?: Array<Array<string | Record<string, unknown>>>;
    hooks?: {
      addImageBlobHook?: (
        blob: Blob | File,
        callback: (url: string, text?: string) => void,
      ) => void;
    };
  }

  export default class Editor {
    constructor(options: EditorOptions);
    getHTML(): string;
    setHTML(html: string, cursorToEnd?: boolean): void;
    on(type: string, handler: (...args: unknown[]) => void): void;
    destroy(): void;
    insertToolbarItem(
      indexPath: { groupIndex: number; itemIndex: number },
      item: string | Record<string, unknown>,
    ): void;
  }
}

declare module "@toast-ui/editor/dist/i18n/ko-kr";

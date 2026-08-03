import { Node, mergeAttributes } from "@tiptap/core";

export type TemplateBlockKind = "header" | "footer";

export const TemplateBlock = Node.create({
  name: "templateBlock",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: "header" as TemplateBlockKind,
        parseHTML: (element) => {
          const kind = element.getAttribute("data-bw-template");
          return kind === "footer" ? "footer" : "header";
        },
        renderHTML: (attributes) => ({
          "data-bw-template": attributes.kind === "footer" ? "footer" : "header",
        }),
      },
      templateId: {
        default: null as string | null,
        parseHTML: (element) => element.getAttribute("data-template-id"),
        renderHTML: (attributes) =>
          attributes.templateId ? { "data-template-id": String(attributes.templateId) } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-bw-template]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "bw-template-block",
      }),
      0,
    ];
  },
});

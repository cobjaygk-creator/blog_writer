import { Node, mergeAttributes } from "@tiptap/core";

import { GROUP_IMAGE_STYLE } from "@/lib/image-style";

export type GroupImage = { src: string; alt?: string };

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageGroup: {
      setImageGroup: (options: { images: GroupImage[]; cols?: 2 | 3 }) => ReturnType;
    };
  }
}

export const ImageGroup = Node.create({
  name: "imageGroup",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      cols: {
        default: 2,
        parseHTML: (element) => {
          const n = Number(element.getAttribute("data-cols") || "2");
          return n === 3 ? 3 : 2;
        },
        renderHTML: (attributes) => ({
          "data-cols": String(attributes.cols === 3 ? 3 : 2),
        }),
      },
      images: {
        default: [] as GroupImage[],
        parseHTML: (element) =>
          [...element.querySelectorAll("img")]
            .map((img) => ({
              src: img.getAttribute("src") || "",
              alt: img.getAttribute("alt") || "",
            }))
            .filter((img) => img.src),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="image-group"]' }];
  },

  renderHTML({ node }) {
    const cols = node.attrs.cols === 3 ? 3 : 2;
    const images = (node.attrs.images || []) as GroupImage[];
    const safeCols = images.length <= 1 ? 1 : Math.min(cols, images.length);

    return [
      "div",
      mergeAttributes({
        "data-type": "image-group",
        "data-cols": String(safeCols),
        class: `bw-image-group bw-image-group--${safeCols}`,
        style: `display:grid;grid-template-columns:repeat(${safeCols},minmax(0,1fr));gap:8px;margin:12px 0;`,
      }),
      ...images.map((img) => [
        "img",
        {
          src: img.src,
          alt: img.alt || "",
          style: GROUP_IMAGE_STYLE,
        },
      ]),
    ];
  },

  addCommands() {
    return {
      setImageGroup:
        (options) =>
        ({ commands }) => {
          const images = options.images.filter((img) => img.src);
          if (!images.length) return false;
          const cols = options.cols === 3 ? 3 : 2;
          return commands.insertContent({
            type: this.name,
            attrs: { images, cols },
          });
        },
    };
  },
});

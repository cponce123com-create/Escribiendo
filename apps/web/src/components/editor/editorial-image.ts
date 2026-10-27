import { Node, mergeAttributes } from "@tiptap/core";

export type EditorialImageAlignment = "left" | "center" | "right";

export interface EditorialImageAttrs {
  src?: string | null;
  alt?: string | null;
  caption?: string | null;
  widthPx?: number | null;
  heightPx?: number | null;
  widthPercent?: number;
  alignment?: EditorialImageAlignment;
  publicId?: string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    editorialImage: {
      insertEditorialImage: (attrs: EditorialImageAttrs) => ReturnType;
      updateEditorialImage: (attrs: Partial<EditorialImageAttrs>) => ReturnType;
    };
  }
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Nodo de imagen del manuscrito.
 *
 * No es una imagen suelta: es una figura con pie, proporción y alineación.
 * Tiptap guarda esos atributos en el JSON de la sección y el exportador los
 * reutiliza para PDF, EPUB y DOCX.
 */
export const EditorialImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute("src"),
      },
      alt: {
        default: null,
        parseHTML: (element) => element.getAttribute("alt"),
      },
      caption: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-caption"),
        renderHTML: (attributes) =>
          attributes.caption ? { "data-caption": attributes.caption } : {},
      },
      widthPx: {
        default: null,
        parseHTML: (element) => numberOrNull(element.getAttribute("data-width-px")),
        renderHTML: (attributes) =>
          attributes.widthPx ? { "data-width-px": String(attributes.widthPx) } : {},
      },
      heightPx: {
        default: null,
        parseHTML: (element) => numberOrNull(element.getAttribute("data-height-px")),
        renderHTML: (attributes) =>
          attributes.heightPx ? { "data-height-px": String(attributes.heightPx) } : {},
      },
      widthPercent: {
        default: 100,
        parseHTML: (element) => {
          const value = Number(element.getAttribute("data-width-percent"));
          return Number.isFinite(value) && value >= 10 && value <= 100 ? value : 100;
        },
        renderHTML: (attributes) => ({
          "data-width-percent": String(attributes.widthPercent ?? 100),
        }),
      },
      alignment: {
        default: "center",
        parseHTML: (element) => {
          const value = element.getAttribute("data-alignment");
          return value === "left" || value === "right" ? value : "center";
        },
        renderHTML: (attributes) => ({
          "data-alignment": attributes.alignment ?? "center",
        }),
      },
      publicId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-public-id"),
        renderHTML: (attributes) =>
          attributes.publicId ? { "data-public-id": attributes.publicId } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-editorial-image]",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }

          const image = element.querySelector("img");
          const caption = element.querySelector("figcaption")?.textContent ?? "";

          if (!image) {
            return false;
          }

          return {
            src: image.getAttribute("src"),
            alt: image.getAttribute("alt"),
            caption: caption || element.getAttribute("data-caption"),
            widthPx: numberOrNull(element.getAttribute("data-width-px")),
            heightPx: numberOrNull(element.getAttribute("data-height-px")),
            widthPercent: Number(element.getAttribute("data-width-percent")) || 100,
            alignment: element.getAttribute("data-alignment") ?? "center",
            publicId: element.getAttribute("data-public-id"),
          };
        },
      },
      { tag: "img[src]" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const src = stringOrNull(HTMLAttributes.src);
    const alt = stringOrNull(HTMLAttributes.alt) ?? "";
    const caption = stringOrNull(HTMLAttributes.caption);
    const widthPercent = Math.min(100, Math.max(10, Number(HTMLAttributes.widthPercent) || 100));
    const alignment =
      HTMLAttributes.alignment === "left" || HTMLAttributes.alignment === "right"
        ? HTMLAttributes.alignment
        : "center";

    return [
      "figure",
      mergeAttributes(this.options.HTMLAttributes, {
        "data-editorial-image": "true",
        "data-alignment": alignment,
        "data-width-percent": String(widthPercent),
        "data-caption": caption ?? undefined,
        "data-public-id": stringOrNull(HTMLAttributes.publicId) ?? undefined,
        class: `editorial-image align-${alignment}`,
        style: `width: ${widthPercent}%`,
      }),
      [
        "img",
        {
          src: src ?? "",
          alt,
          ...(HTMLAttributes.widthPx ? { width: String(HTMLAttributes.widthPx) } : {}),
          ...(HTMLAttributes.heightPx ? { height: String(HTMLAttributes.heightPx) } : {}),
          loading: "lazy",
          // La imagen no bloquea el hilo principal mientras el editor se
          // hidrata: el texto aparece antes y la figura se decodifica aparte.
          decoding: "async",
        },
      ],
      ...(caption ? [["figcaption", {}, caption] as const] : []),
    ];
  },

  addCommands() {
    return {
      insertEditorialImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
      updateEditorialImage:
        (attrs) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attrs),
    };
  },
});

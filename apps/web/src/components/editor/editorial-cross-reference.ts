import { mergeAttributes, Node } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    crossReference: {
      /** Inserta una referencia a otra sección del libro. */
      insertCrossReference: (attrs: {
        targetId: string;
        label: string;
        format: "page" | "title";
      }) => ReturnType;
    };
  }
}

/**
 * Referencia cruzada a otra sección.
 *
 * Guarda el destino y una etiqueta para el editor. El texto final —folio o
 * título— se resuelve al componer, porque el número de página todavía no
 * existe cuando se escribe.
 */
export const EditorialCrossReference = Node.create({
  name: "crossReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      targetId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-target-id"),
        renderHTML: (attributes) =>
          typeof attributes.targetId === "string" && attributes.targetId.length > 0
            ? { "data-target-id": attributes.targetId }
            : {},
      },
      label: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-label") ?? element.textContent ?? "",
        renderHTML: (attributes) =>
          typeof attributes.label === "string" && attributes.label.length > 0
            ? { "data-label": attributes.label }
            : {},
      },
      format: {
        default: "page",
        parseHTML: (element) =>
          element.getAttribute("data-format") === "title" ? "title" : "page",
        renderHTML: (attributes) => ({
          "data-format": attributes.format === "title" ? "title" : "page",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-cross-reference]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const label =
      typeof node.attrs.label === "string" && node.attrs.label ? node.attrs.label : "referencia";

    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-cross-reference": "", class: "cross-reference" }),
      label,
    ];
  },

  addCommands() {
    return {
      insertCrossReference:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

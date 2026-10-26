import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Nota al margen del manuscrito.
 *
 * Es un bloque de texto que no forma parte del flujo: la maqueta lo compone en
 * la columna exterior, anclado a la primera línea del párrafo anterior. El
 * contenido se edita como texto normal dentro del bloque.
 */
export const EditorialMarginNote = Node.create({
  name: "marginNote",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "aside[data-margin-note]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "aside",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-margin-note": "",
        class: "margin-note",
      }),
      0,
    ];
  },
});

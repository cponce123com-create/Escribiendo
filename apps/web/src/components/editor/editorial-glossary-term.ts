import { Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    glossaryTerm: {
      /** Marca la selección como término del glosario. */
      setGlossaryTerm: (term: string) => ReturnType;
      unsetGlossaryTerm: () => ReturnType;
    };
  }
}

/**
 * Marca de término de glosario.
 *
 * No guarda la definición: el término es la clave y la definición vive en el
 * glosario del libro, de modo que editarla no obliga a reescribir el texto.
 */
export const EditorialGlossaryTerm = Mark.create({
  name: "glossaryTerm",
  inclusive: false,

  addAttributes() {
    return {
      term: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-glossary-term"),
        renderHTML: (attributes) => {
          const term = attributes.term;

          return typeof term === "string" && term.length > 0 ? { "data-glossary-term": term } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-glossary-term]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "glossary-term" }), 0];
  },

  addCommands() {
    return {
      setGlossaryTerm:
        (term: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { term }),
      unsetGlossaryTerm:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

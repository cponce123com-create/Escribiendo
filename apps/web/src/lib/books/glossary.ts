import type { TiptapDocument } from "@escribiendo/book-schema";

/**
 * Glosario del libro.
 *
 * Los términos se guardan aparte y se vierten en una sección GLOSSARY normal,
 * de modo que el glosario pasa por la vista previa y por todos los formatos de
 * exportación sin casos especiales en el motor.
 */

export interface GlossaryTermInput {
  term: string;
  definition: string;
}

/** Documento Tiptap de la sección de glosario, ordenado alfabéticamente. */
export function buildGlossaryDocument(terms: readonly GlossaryTermInput[]): TiptapDocument {
  const ordered = [...terms].sort((left, right) =>
    left.term.localeCompare(right.term, "es", { sensitivity: "base" }),
  );

  return {
    type: "doc",
    content: ordered.map((item) => ({
      type: "paragraph",
      content: [
        { type: "text", text: item.term, marks: [{ type: "bold" }] },
        { type: "text", text: `. ${item.definition}` },
      ],
    })),
  };
}

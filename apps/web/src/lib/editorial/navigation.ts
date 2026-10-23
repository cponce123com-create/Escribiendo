/** Destino común para las materias automáticas y las secciones antiguas. */
export function editorialMatterKind(type: string): "legal" | "toc" | null {
  return type === "COPYRIGHT" ? "legal" : type === "TABLE_OF_CONTENTS" ? "toc" : null;
}
export function editorialGalleryHref(
  bookId: string,
  kind: "legal" | "toc",
  legacySectionId?: string,
): string {
  const query = legacySectionId ? `?legacySection=${encodeURIComponent(legacySectionId)}` : "";
  return `/books/${bookId}/edicion${query}#${kind === "legal" ? "legal-title" : "toc-title"}`;
}
export function sectionNavigationHref(
  bookId: string,
  section: { id: string; type: string },
): string {
  const kind = editorialMatterKind(section.type);
  return kind
    ? editorialGalleryHref(bookId, kind, section.id)
    : `/books/${bookId}/sections/${section.id}`;
}

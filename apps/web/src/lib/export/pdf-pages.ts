import type { LaidOutPage } from "@escribiendo/editorial-engine";
import type { PdfOutlineItem } from "@escribiendo/export-engine";

/**
 * Marcadores (outline) del PDF.
 *
 * Se construyen a partir de la primera página de cada sección compuesta por el
 * motor editorial. Se usa el título editorial de la sección, no el texto del
 * bloque: así el marcador sigue siendo el mismo aunque el manuscrito empiece
 * con un encabezado equivalente.
 *
 * La vista previa no necesita estos marcadores: son metadatos de navegación del
 * archivo PDF. Por eso esta pieza es pura y no toca la base de datos.
 */
export function outlineFromPages(
  pages: readonly LaidOutPage[],
  sections: readonly {
    id: string;
    title: string;
    showInToc: boolean;
    displayTitle?: string | null;
  }[],
): PdfOutlineItem[] {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const seen = new Set<string>();
  const outline: PdfOutlineItem[] = [];

  pages.forEach((page, pageIndex) => {
    for (const block of page.blocks) {
      if (!block.sectionId || !block.firstOfSection || seen.has(block.sectionId)) {
        continue;
      }

      seen.add(block.sectionId);
      const section = byId.get(block.sectionId);
      // El bloque de título (chapterTitle o el legado title) lleva el título
      // compuesto del autor; si no se insertó porque el manuscrito ya abre con
      // un encabezado equivalente, el marcador usa el título de la sección para
      // no prometer en el índice una composición que el cuerpo no muestra.
      const isEditorialTitle = block.kind === "title" || block.kind === "chapterTitle";
      const title = isEditorialTitle
        ? (section?.displayTitle ?? section?.title ?? "")
        : (section?.title ?? "");

      if (section && section.showInToc && title.trim().length > 0) {
        outline.push({ title, pageIndex });
      }
    }
  });

  return outline;
}

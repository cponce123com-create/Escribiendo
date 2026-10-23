import "server-only";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import { parseTiptapDocument, type TiptapDocument } from "@escribiendo/book-schema";
import {
  runsToText,
  type EditorialImage,
  type InlineFootnote,
  type InlineRun,
} from "@escribiendo/editorial-engine";
import { editorialImageFromNode } from "@/lib/layout/image";
import { inlineRuns, trimRuns, type FootnoteCounter } from "@/lib/layout/inline";
import { seccionesExportables } from "@/lib/layout/blocks";
import { displayTitleForSection } from "@/lib/layout/section-title";
import { createHash } from "node:crypto";

/**
 * Manuscrito de exportación.
 *
 * Un trabajo de exportación guarda las versiones de las secciones que
 * exportó. Como las revisiones son inmutables, el mismo trabajo se puede
 * reproducir aunque el manuscrito haya cambiado después: si la sección ya no
 * está en la versión guardada, se recupera de la revisión.
 */

export interface ExportSection {
  id: string;
  title: string;
  type: string;
  /** Sección padre, para reproducir la jerarquía del índice. */
  parentId: string | null;
  content: unknown;
  version: number;
  /** La sección debe empezar en página par. */
  startOnOddPage: boolean;
  /** La sección empieza en página nueva, aunque no abra capítulo. */
  pageBreakBefore: boolean;
  /** La sección entra en los archivos exportados. */
  includeInExport: boolean;
  /** La sección aparece en el índice del libro. */
  showInToc: boolean;
  /** El título editorial se inserta en el cuerpo. */
  showTitle: boolean;
  /** El título se acompaña con la etiqueta del tipo. */
  showSectionType: boolean;
  /** El título se acompaña con el número correlativo. */
  showSectionNumber: boolean;
  /** Título ya compuesto con etiqueta y número, si procede. */
  displayTitle?: string | null;
}

export interface SectionVersion {
  id: string;
  version: number;
}

/** Versiones de las secciones de un libro, en orden de lectura. */
export async function currentSectionVersions(
  session: SessionContext,
  bookId: string,
): Promise<SectionVersion[]> {
  const sections = await prisma.bookSection.findMany({
    where: {
      bookId,
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: { id: true, version: true },
  });

  return sections.map((section) => ({ id: section.id, version: section.version }));
}

/**
 * Huella del manuscrito.
 *
 * Cambia en cuanto cambia el contenido de cualquier sección, de modo que un
 * trabajo con la misma clave pero distinto manuscrito es un trabajo nuevo.
 */
export function manuscriptHash(sections: ExportSection[], extra: string): string {
  const hash = createHash("sha256");

  for (const section of sections) {
    hash.update(section.id);
    hash.update(`:${section.version}:`);
    // El título editorial forma parte del archivo: renombrar una sección no
    // puede reutilizar un PDF o un EPUB generado con el título anterior.
    hash.update(section.title);
    hash.update(section.includeInExport ? ":export" : ":hidden");
    hash.update(section.showInToc ? ":toc" : ":no-toc");
    hash.update(section.showTitle ? ":title" : ":no-title");
    hash.update(section.showSectionType ? ":type" : ":no-type");
    hash.update(section.showSectionNumber ? ":number" : ":no-number");
    hash.update(":");
    hash.update(
      createHash("sha256")
        .update(JSON.stringify(section.content ?? null))
        .digest("hex"),
    );
    hash.update("|");
  }

  hash.update(extra);

  return hash.digest("hex");
}

/**
 * Carga el manuscrito en las versiones indicadas.
 *
 * Si no se indican versiones, se usa el contenido actual de cada sección.
 */
export async function loadManuscript(
  session: SessionContext,
  bookId: string,
  versions?: SectionVersion[],
): Promise<ExportSection[]> {
  const sections = await prisma.bookSection.findMany({
    where: {
      bookId,
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      type: true,
      parentId: true,
      content: true,
      version: true,
      startOnOddPage: true,
      pageBreakBefore: true,
      includeInExport: true,
      showInToc: true,
      showTitle: true,
      showSectionType: true,
      showSectionNumber: true,
    },
  });

  // Una sección excluida del libro no se exporta. La vista previa aplica el
  // mismo filtro, de modo que ambas cosas cuentan la misma historia.
  const exportables = seccionesExportables(sections);

  if (!versions || versions.length === 0) {
    return exportables.map((section) => ({
      id: section.id,
      title: section.title,
      parentId: section.parentId,
      type: section.type,
      content: section.content,
      version: section.version,
      startOnOddPage: section.startOnOddPage,
      pageBreakBefore: section.pageBreakBefore,
      includeInExport: section.includeInExport,
      showInToc: section.showInToc,
      showTitle: section.showTitle,
      showSectionType: section.showSectionType,
      showSectionNumber: section.showSectionNumber,
    }));
  }

  const desired = new Map(versions.map((version) => [version.id, version.version]));
  const necesitaRevision = exportables.filter(
    (section) => desired.has(section.id) && desired.get(section.id) !== section.version,
  );

  const revisiones = await prisma.sectionRevision.findMany({
    where: {
      sectionId: { in: necesitaRevision.map((section) => section.id) },
      version: { in: necesitaRevision.map((section) => desired.get(section.id) ?? 0) },
    },
    select: { sectionId: true, version: true, content: true, title: true },
  });

  const porSeccion = new Map(
    revisiones.map((revision) => [`${revision.sectionId}:${revision.version}`, revision]),
  );

  return exportables
    .filter((section) => desired.has(section.id))
    .map((section) => {
      const version = desired.get(section.id) ?? section.version;

      if (version === section.version) {
        return {
          id: section.id,
          title: section.title,
          parentId: section.parentId,
          type: section.type,
          content: section.content,
          version: section.version,
          startOnOddPage: section.startOnOddPage,
          pageBreakBefore: section.pageBreakBefore,
          includeInExport: section.includeInExport,
          showInToc: section.showInToc,
          showTitle: section.showTitle,
          showSectionType: section.showSectionType,
          showSectionNumber: section.showSectionNumber,
        };
      }

      const revision = porSeccion.get(`${section.id}:${version}`);

      if (!revision) {
        throw new Error(
          `No se ha podido recuperar la versión ${version} de la sección «${section.title}».`,
        );
      }

      return {
        id: section.id,
        title: revision.title,
        parentId: section.parentId,
        type: section.type,
        content: revision.content,
        version,
        startOnOddPage: section.startOnOddPage,
        pageBreakBefore: section.pageBreakBefore,
        includeInExport: section.includeInExport,
        showInToc: section.showInToc,
        showTitle: section.showTitle,
        showSectionType: section.showSectionType,
        showSectionNumber: section.showSectionNumber,
      };
    });
}

/** Tramo de texto con formato, en la forma plana que consumen los escritores. */
export interface ManuscriptRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  link?: string;
  /** Llamada a nota al pie, con su número y su texto. */
  footnote?: InlineFootnote;
}

/** Bloques de un documento Tiptap, con su clase y su formato. */
export interface ManuscriptBlock {
  kind: "title" | "heading" | "body" | "quote" | "pageBreak" | "rule" | "image";
  text: string;
  runs?: ManuscriptRun[];
  /** Nivel del encabezado de contenido, de 1 a 4. */
  level?: number;
  /** Referencia de la imagen, cuando `kind` es `image`. */
  image?: EditorialImage;
}

/** Aplana las marcas anidadas a la forma que espera el motor de exportación. */
function flattenRuns(runs: readonly InlineRun[]): ManuscriptRun[] {
  return runs.map((run) => {
    const marks = run.marks;

    return {
      text: run.text,
      ...(marks?.bold ? { bold: true } : {}),
      ...(marks?.italic ? { italic: true } : {}),
      ...(marks?.underline ? { underline: true } : {}),
      ...(marks?.strike ? { strike: true } : {}),
      ...(marks?.superscript ? { superscript: true } : {}),
      ...(marks?.subscript ? { subscript: true } : {}),
      ...(marks?.link ? { link: marks.link } : {}),
      ...(run.footnote ? { footnote: run.footnote } : {}),
    };
  });
}

/** Convierte una sección en bloques con formato para el EPUB y el DOCX. */
export function sectionToBlocks(
  section: ExportSection,
  footnotes?: FootnoteCounter,
): ManuscriptBlock[] {
  const blocks: ManuscriptBlock[] = [];
  // Si se llama a una sección aislada, sus notas se numeran dentro de ella.
  // generateFile pasa un contador compartido para numerar todo el libro.
  const counter = footnotes ?? { next: 1 };
  let document: TiptapDocument | null = null;

  try {
    document = parseTiptapDocument(section.content);
  } catch {
    // El título sigue siendo válido aunque el contenido guardado esté
    // corrupto; el exportador no debe hacerlo desaparecer.
  }

  const baseTitle = section.displayTitle === undefined ? section.title : section.displayTitle;
  const title =
    baseTitle === null
      ? null
      : displayTitleForSection(baseTitle, document, [section.title]);

  if (title) {
    blocks.push({ kind: "title", text: title, runs: [{ text: title }] });
  }

  if (!document) {
    return blocks;
  }

  const pushRuns = (
    kind: ManuscriptBlock["kind"],
    runs: readonly InlineRun[],
    level?: number,
  ): void => {
    const limpios = trimRuns(runs);
    const text = runsToText(limpios);

    if (text.trim().length === 0) {
      return;
    }

    blocks.push({
      kind,
      text,
      runs: flattenRuns(limpios),
      ...(level !== undefined ? { level } : {}),
    });
  };

  for (const node of document.content ?? []) {
    switch (node.type) {
      case "heading":
        pushRuns(
          "heading",
          inlineRuns(node, counter),
          Math.min(4, Math.max(1, Number(node.attrs?.level ?? 1))),
        );
        break;

      case "paragraph":
        pushRuns("body", inlineRuns(node, counter));
        break;

      case "blockquote":
        pushRuns("quote", inlineRuns(node, counter));
        break;

      case "codeBlock":
        pushRuns("body", inlineRuns(node, counter));
        break;

      case "bulletList":
      case "orderedList": {
        let position = 1;

        for (const item of node.content ?? []) {
          if (item.type !== "listItem") {
            continue;
          }

          const itemRuns = trimRuns(inlineRuns(item, counter));

          if (itemRuns.length === 0) {
            continue;
          }

          const prefix = node.type === "orderedList" ? `${position}. ` : "· ";
          position += 1;

          pushRuns("body", [{ text: prefix }, ...itemRuns]);
        }

        break;
      }

      case "horizontalRule":
      case "sceneBreak":
        // Un separador de escena no es un salto de página: es una marca
        // tipográfica dentro del capítulo.
        blocks.push({ kind: "rule", text: "" });
        break;

      case "image": {
        const image = editorialImageFromNode(node);

        blocks.push({
          kind: "image",
          text: image.alt ?? image.caption ?? "",
          image,
        });
        break;
      }

      default:
        pushRuns("body", inlineRuns(node, counter));
        break;
    }
  }

  return blocks.filter(
    (block) => block.kind === "rule" || block.kind === "image" || block.text.length > 0,
  );
}

import "server-only";
import { editorialOrder } from "@/lib/books/reading-order";
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
  parentId?: string | null;
  id: string;
  title: string;
  type: string;
  content: unknown;
  version: number;
  /** La sección debe empezar en página par. */
  startOnOddPage: boolean;
  /** La sección empieza en página nueva, aunque no abra capítulo. */
  pageBreakBefore: boolean;
  /** La sección entra en los archivos exportados. */
  includeInExport: boolean;
  /** La sección aparece en el índice (y en los marcadores del PDF). */
  showInToc: boolean;
  /** El título editorial se inserta en el cuerpo de la sección. */
  showTitle: boolean;
  /** El título se acompaña con la etiqueta del tipo (Capítulo, Prólogo...). */
  showSectionType: boolean;
  /** El título se acompaña con el número correlativo del tipo. */
  showSectionNumber: boolean;
}

export interface SectionVersion {
  id: string;
  version: number;
}

/**
 * Instantánea editorial de una sección.
 *
 * Guarda todo lo que afecta al archivo exportado, no solo el texto: el título,
 * el tipo y las opciones de composición pueden cambiar sin que cambie la
 * versión del manuscrito. Sin esta instantánea, renombrar un capítulo después
 * de pedir la exportación alteraría el archivo del trabajo en curso.
 */
export interface SectionSnapshot extends SectionVersion {
  parentId?: string | null;
  content?: unknown;
  title: string;
  type: string;
  startOnOddPage: boolean;
  pageBreakBefore: boolean;
  includeInExport: boolean;
  showInToc: boolean;
  showTitle: boolean;
  showSectionType: boolean;
  showSectionNumber: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }, { id: "asc" }],
    select: { id: true, version: true, parentId: true, sortOrder: true, title: true, type: true },
  });

  return editorialOrder(sections).map((section) => ({ id: section.id, version: section.version }));
}

/** Instantánea editorial de las secciones, en orden de lectura. */
export async function currentSectionSnapshots(
  session: SessionContext,
  bookId: string,
): Promise<SectionSnapshot[]> {
  const sections = await prisma.bookSection.findMany({
    where: {
      bookId,
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }, { id: "asc" }],
    select: {
      id: true,
      parentId: true,
      sortOrder: true,
      content: true,
      version: true,
      title: true,
      type: true,
      startOnOddPage: true,
      pageBreakBefore: true,
      includeInExport: true,
      showInToc: true,
      showTitle: true,
      showSectionType: true,
      showSectionNumber: true,
    },
  });

  return seccionesExportables(editorialOrder(sections)).map(toSectionSnapshot);
}

function toSectionSnapshot(section: SectionSnapshot): SectionSnapshot {
  return {
    id: section.id,
    parentId: section.parentId ?? null,
    version: section.version,
    content: parseTiptapDocument(section.content),
    title: section.title,
    type: section.type,
    startOnOddPage: section.startOnOddPage,
    pageBreakBefore: section.pageBreakBefore,
    includeInExport: section.includeInExport,
    showInToc: section.showInToc,
    showTitle: section.showTitle,
    showSectionType: section.showSectionType,
    showSectionNumber: section.showSectionNumber,
  };
}

/**
 * Lee la instantánea guardada en un trabajo.
 *
 * Devuelve `null` para los trabajos antiguos, que solo guardaban `{id, version}`:
 * en ese caso se conserva la reconstrucción anterior.
 */
export function readSectionSnapshot(value: unknown): SectionSnapshot[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const snapshot: SectionSnapshot[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      return null;
    }

    const {
      id,
      version,
      title,
      type,
      startOnOddPage,
      pageBreakBefore,
      includeInExport,
      showInToc,
      showTitle,
      showSectionType,
      showSectionNumber,
    } = entry;

    if (
      typeof id !== "string" ||
      typeof version !== "number" ||
      !Number.isInteger(version) ||
      version < 1 ||
      typeof title !== "string" ||
      typeof type !== "string" ||
      typeof startOnOddPage !== "boolean" ||
      typeof pageBreakBefore !== "boolean" ||
      typeof includeInExport !== "boolean" ||
      typeof showInToc !== "boolean" ||
      typeof showTitle !== "boolean" ||
      typeof showSectionType !== "boolean" ||
      typeof showSectionNumber !== "boolean"
    ) {
      return null;
    }

    snapshot.push({
      ...(entry.parentId === null || typeof entry.parentId === "string"
        ? { parentId: entry.parentId }
        : {}),
      ...("content" in entry ? { content: parseTiptapDocument(entry.content) } : {}),
      id,
      version,
      title,
      type,
      startOnOddPage,
      pageBreakBefore,
      includeInExport,
      showInToc,
      showTitle,
      showSectionType,
      showSectionNumber,
    });
  }

  return snapshot;
}

/**
 * Huella del manuscrito.
 *
 * Incluye todo lo que cambia el archivo: contenido, versión, título, tipo,
 * orden y opciones de composición. Cambiar cualquiera de ellos da lugar a un
 * trabajo nuevo; repetir la misma exportación reutiliza el trabajo existente.
 */
export function manuscriptHash(sections: ExportSection[], extra: string): string {
  const hash = createHash("sha256");

  for (const section of sections) {
    hash.update(
      JSON.stringify({
        id: section.id,
        version: section.version,
        title: section.title,
        type: section.type,
        parentId: section.parentId ?? null,
        startOnOddPage: section.startOnOddPage,
        pageBreakBefore: section.pageBreakBefore,
        includeInExport: section.includeInExport,
        showInToc: section.showInToc,
        showTitle: section.showTitle,
        showSectionType: section.showSectionType,
        showSectionNumber: section.showSectionNumber,
        content: section.content ?? null,
      }),
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
      ...(versions ? { id: { in: versions.map((section) => section.id) } } : { deletedAt: null }),
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }, { id: "asc" }],
    select: {
      id: true,
      title: true,
      parentId: true,
      sortOrder: true,
      type: true,
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
  const byId = new Map(sections.map((section) => [section.id, section]));
  if (versions && versions.some((section) => !byId.has(section.id))) {
    throw new Error(
      "Faltan secciones de la exportación histórica. No se generará un archivo parcial.",
    );
  }
  const exportables = versions
    ? versions.map((section) => byId.get(section.id)!)
    : seccionesExportables(editorialOrder(sections));

  if (!versions) {
    return exportables.map((section) => ({
      id: section.id,
      parentId: section.parentId ?? null,
      title: section.title,
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
          parentId: section.parentId ?? null,
          title: section.title,
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

/**
 * Carga el manuscrito exactamente como estaba al pedir el trabajo.
 *
 * Los metadatos (título, tipo y opciones) salen de la instantánea, no de la
 * fila actual: renombrar un capítulo o cambiar su entrada en el índice después
 * de pedir la exportación no altera el archivo del trabajo. El contenido se
 * recupera de la revisión si la sección ya ha avanzado de versión.
 *
 * No se filtra por `deletedAt`: una sección borrada después de pedir el
 * trabajo sigue formando parte de la instantánea.
 */
export async function loadManuscriptFromSnapshot(
  session: SessionContext,
  bookId: string,
  snapshot: SectionSnapshot[],
): Promise<ExportSection[]> {
  if (snapshot.every((section) => section.content !== undefined)) {
    return snapshot.map((section) => ({
      ...section,
      content: parseTiptapDocument(section.content),
    }));
  }

  const rows = await prisma.bookSection.findMany({
    where: {
      id: { in: snapshot.map((section) => section.id) },
      bookId,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    select: { id: true, version: true, content: true },
  });

  const porId = new Map(rows.map((row) => [row.id, row]));
  const necesitanRevision = snapshot.filter((section) => {
    const row = porId.get(section.id);

    return row !== undefined && row.version !== section.version;
  });

  const revisiones =
    necesitanRevision.length > 0
      ? await prisma.sectionRevision.findMany({
          where: {
            sectionId: { in: necesitanRevision.map((section) => section.id) },
            version: { in: necesitanRevision.map((section) => section.version) },
          },
          select: { sectionId: true, version: true, content: true },
        })
      : [];

  const porRevision = new Map(
    revisiones.map((revision) => [`${revision.sectionId}:${revision.version}`, revision]),
  );

  return snapshot.map((section) => {
    const row = porId.get(section.id);

    if (!row) {
      throw new Error(`La sección «${section.title}» ya no existe en este libro.`);
    }

    const content =
      row.version === section.version
        ? row.content
        : porRevision.get(`${section.id}:${section.version}`)?.content;

    if (content === undefined) {
      throw new Error(
        `No se ha podido recuperar la versión ${section.version} de la sección «${section.title}».`,
      );
    }

    return {
      id: section.id,
      parentId: section.parentId ?? null,
      title: section.title,
      type: section.type,
      content,
      version: section.version,
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

/**
 * Carga el manuscrito de un trabajo guardado.
 *
 * Los trabajos nuevos traen la instantánea completa; los antiguos solo
 * guardaban `{id, version}` y se reconstruyen con los metadatos actuales.
 */
export async function loadManuscriptForJob(
  session: SessionContext,
  bookId: string,
  stored: unknown,
): Promise<ExportSection[]> {
  const snapshot = readSectionSnapshot(stored);

  if (snapshot) {
    return loadManuscriptFromSnapshot(session, bookId, snapshot);
  }

  if (
    !Array.isArray(stored) ||
    stored.some(
      (entry) =>
        !isRecord(entry) ||
        typeof entry.id !== "string" ||
        !Number.isInteger(entry.version) ||
        Number(entry.version) < 1 ||
        Object.keys(entry).some((key) => key !== "id" && key !== "version"),
    )
  ) {
    throw new Error(
      "La instantánea editorial está incompleta o corrupta. No se puede reconstruir con datos actuales.",
    );
  }
  const versions = stored as SectionVersion[];

  return loadManuscript(session, bookId, versions);
}

export interface ManuscriptRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  link?: string;
  /** Término del glosario al que pertenece el tramo. */
  glossary?: string;
  /** Llamada a nota al pie, con su número y su texto. */
  footnote?: InlineFootnote;
}

/** Bloques de un documento Tiptap, con su clase y su formato. */
export interface ManuscriptBlock {
  kind: "title" | "heading" | "body" | "quote" | "pageBreak" | "rule" | "image";
  text: string;
  runs?: ManuscriptRun[];
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
      ...(marks?.glossary ? { glossary: marks.glossary } : {}),
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

  let document: TiptapDocument;

  try {
    document = parseTiptapDocument(section.content);
  } catch {
    throw new Error(
      `La sección «${section.title}» contiene un documento inválido y no se puede exportar.`,
    );
  }

  const pushRuns = (kind: ManuscriptBlock["kind"], runs: readonly InlineRun[]): void => {
    const limpios = trimRuns(runs);
    const text = runsToText(limpios);

    if (text.trim().length === 0) {
      return;
    }

    blocks.push({ kind, text, runs: flattenRuns(limpios) });
  };

  for (const node of document.content ?? []) {
    switch (node.type) {
      case "heading":
        pushRuns("heading", inlineRuns(node, counter));
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

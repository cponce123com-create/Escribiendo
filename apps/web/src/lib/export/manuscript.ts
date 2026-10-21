import "server-only";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import { parseTiptapDocument, type TiptapDocument } from "@escribiendo/book-schema";
import { runsToText, type EditorialImage, type InlineRun } from "@escribiendo/editorial-engine";
import { editorialImageFromNode } from "@/lib/layout/image";
import { inlineRuns, trimRuns } from "@/lib/layout/inline";
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
  content: unknown;
  version: number;
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
    select: { id: true, title: true, type: true, content: true, version: true },
  });

  if (!versions || versions.length === 0) {
    return sections.map((section) => ({
      id: section.id,
      title: section.title,
      type: section.type,
      content: section.content,
      version: section.version,
    }));
  }

  const desired = new Map(versions.map((version) => [version.id, version.version]));
  const necesitaRevision = sections.filter(
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

  return sections
    .filter((section) => desired.has(section.id))
    .map((section) => {
      const version = desired.get(section.id) ?? section.version;

      if (version === section.version) {
        return {
          id: section.id,
          title: section.title,
          type: section.type,
          content: section.content,
          version: section.version,
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
    };
  });
}

/** Convierte una sección en bloques con formato para el EPUB y el DOCX. */
export function sectionToBlocks(section: ExportSection): ManuscriptBlock[] {
  const blocks: ManuscriptBlock[] = [];

  let document: TiptapDocument;

  try {
    document = parseTiptapDocument(section.content);
  } catch {
    return blocks;
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
        pushRuns("heading", inlineRuns(node));
        break;

      case "paragraph":
        pushRuns("body", inlineRuns(node));
        break;

      case "blockquote":
        pushRuns("quote", inlineRuns(node));
        break;

      case "codeBlock":
        pushRuns("body", inlineRuns(node));
        break;

      case "bulletList":
      case "orderedList": {
        let position = 1;

        for (const item of node.content ?? []) {
          if (item.type !== "listItem") {
            continue;
          }

          const itemRuns = trimRuns(inlineRuns(item));

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
        pushRuns("body", inlineRuns(node));
        break;
    }
  }

  return blocks.filter(
    (block) => block.kind === "rule" || block.kind === "image" || block.text.length > 0,
  );
}

import "server-only";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import {
  parseTiptapDocument,
  type TiptapDocument,
  type TiptapNode,
} from "@escribiendo/book-schema";
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

/** Bloques de un documento Tiptap, con su clase. */
export interface ManuscriptBlock {
  kind: "title" | "heading" | "body" | "quote" | "pageBreak";
  text: string;
}

function nodeText(node: TiptapNode): string {
  if (node.type === "text") {
    return node.text ?? "";
  }

  return (node.content ?? []).map(nodeText).join("");
}

/** Convierte una sección en bloques de texto para el EPUB y el DOCX. */
export function sectionToBlocks(section: ExportSection): ManuscriptBlock[] {
  const blocks: ManuscriptBlock[] = [];

  let document: TiptapDocument;

  try {
    document = parseTiptapDocument(section.content);
  } catch {
    return blocks;
  }

  for (const node of document.content ?? []) {
    switch (node.type) {
      case "heading":
        blocks.push({ kind: "heading", text: nodeText(node).trim() });
        break;

      case "paragraph":
        blocks.push({ kind: "body", text: nodeText(node).trim() });
        break;

      case "blockquote":
        blocks.push({ kind: "quote", text: nodeText(node).trim() });
        break;

      case "codeBlock":
        blocks.push({ kind: "body", text: nodeText(node).trim() });
        break;

      case "bulletList":
      case "orderedList":
        for (const item of node.content ?? []) {
          blocks.push({ kind: "body", text: `· ${nodeText(item).trim()}` });
        }
        break;

      case "horizontalRule":
      case "sceneBreak":
        blocks.push({ kind: "pageBreak", text: "" });
        break;

      default:
        blocks.push({ kind: "body", text: nodeText(node).trim() });
        break;
    }
  }

  return blocks.filter((block) => block.kind === "pageBreak" || block.text.length > 0);
}

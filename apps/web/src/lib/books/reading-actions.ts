"use server";

import { parseTiptapDocument } from "@escribiendo/book-schema";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { assertServerActionOrigin } from "@/lib/security/request-context";
import { editorialOrder } from "./reading-order";
import { z } from "zod";
import {
  createReadAloudQueue,
  isReadAloudPayloadWithinLimit,
  type ReadAloudMode,
} from "@/lib/editor/read-aloud-queue";
import { readAloudBlocksFromDocument, type ReadAloudBlock } from "@/lib/editor/read-aloud-document";

const readRequestSchema = z.object({
  bookId: z.string().uuid(),
  currentSectionId: z.string().uuid(),
  mode: z.enum(["chapter", "book"]),
});

export interface ReadAloudSection {
  id: string;
  title: string;
  paragraphs: ReadAloudBlock[];
}

export type ReadAloudResult =
  | { success: true; bookTitle: string; sections: ReadAloudSection[] }
  | { success: false; message: string };

/** Devuelve solo el texto legible y en orden editorial del libro autorizado. */
export async function getBookReadAloudContentAction(
  bookIdValue: string,
  currentSectionIdValue: string,
  modeValue: ReadAloudMode,
): Promise<ReadAloudResult> {
  await assertServerActionOrigin();
  const parsed = readRequestSchema.safeParse({
    bookId: bookIdValue,
    currentSectionId: currentSectionIdValue,
    mode: modeValue,
  });
  if (!parsed.success) return { success: false, message: "La solicitud de lectura no es válida." };

  const session = await getSession();
  if (!session) return { success: false, message: "Inicia sesión para escuchar el manuscrito." };

  const book = await prisma.book.findFirst({
    where: {
      id: parsed.data.bookId,
      workspaceId: session.workspace.id,
      deletedAt: null,
    },
    select: { id: true, title: true },
  });
  if (!book)
    return { success: false, message: "No se encontró el libro en tu espacio de trabajo." };

  const orderRows = await prisma.bookSection.findMany({
    where: { bookId: book.id, deletedAt: null },
    select: {
      id: true,
      parentId: true,
      type: true,
      title: true,
      sortOrder: true,
    },
  });
  const ordered = editorialOrder(orderRows, false);
  const selected = createReadAloudQueue(ordered, parsed.data.currentSectionId, parsed.data.mode);
  if (selected.length === 0) {
    return { success: false, message: "No se encontró la sección desde la que quieres escuchar." };
  }

  const contentRows = await prisma.bookSection.findMany({
    where: { bookId: book.id, id: { in: selected.map((section) => section.id) }, deletedAt: null },
    select: { id: true, content: true },
  });
  const contentById = new Map(contentRows.map((section) => [section.id, section.content]));
  const sections = selected.flatMap((section) => {
    try {
      const content = contentById.get(section.id);
      if (content === undefined) return [];
      const paragraphs = readAloudBlocksFromDocument(parseTiptapDocument(content));
      return paragraphs.some((paragraph) => paragraph.text)
        ? [{ id: section.id, title: section.title, paragraphs }]
        : [];
    } catch {
      // Una sección dañada no impide escuchar las demás. Nunca se lee JSON crudo.
      return [];
    }
  });

  if (sections.length === 0) {
    return { success: false, message: "Este libro todavía no tiene texto para escuchar." };
  }
  const nativeSections = sections.map(({ id, title, paragraphs }) => ({
    id,
    title,
    paragraphs: paragraphs.map(({ text }) => text),
  }));
  if (!isReadAloudPayloadWithinLimit(book.title, nativeSections)) {
    return {
      success: false,
      message:
        "El texto seleccionado supera el límite de 10 MB para la lectura móvil. Elige «Este capítulo» o empieza más adelante.",
    };
  }

  return { success: true, bookTitle: book.title, sections };
}

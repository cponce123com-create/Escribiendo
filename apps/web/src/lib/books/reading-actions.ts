"use server";

import { extractPlainText, parseTiptapDocument } from "@escribiendo/book-schema";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { assertServerActionOrigin } from "@/lib/security/request-context";
import { editorialOrder } from "./reading-order";
import { z } from "zod";

const bookIdSchema = z.string().uuid();

export interface ReadAloudSection {
  id: string;
  title: string;
  text: string;
}

export type ReadAloudResult =
  | { success: true; bookTitle: string; sections: ReadAloudSection[] }
  | { success: false; message: string };

/** Devuelve solo el texto legible y en orden editorial del libro autorizado. */
export async function getBookReadAloudContentAction(bookIdValue: string): Promise<ReadAloudResult> {
  await assertServerActionOrigin();
  const parsedId = bookIdSchema.safeParse(bookIdValue);
  if (!parsedId.success) return { success: false, message: "El libro no es válido." };

  const session = await getSession();
  if (!session) return { success: false, message: "Inicia sesión para escuchar el manuscrito." };

  const book = await prisma.book.findFirst({
    where: {
      id: parsedId.data,
      workspaceId: session.workspace.id,
      deletedAt: null,
    },
    select: { id: true, title: true },
  });
  if (!book)
    return { success: false, message: "No se encontró el libro en tu espacio de trabajo." };

  const rows = await prisma.bookSection.findMany({
    where: { bookId: book.id, deletedAt: null },
    select: {
      id: true,
      parentId: true,
      type: true,
      title: true,
      sortOrder: true,
      content: true,
    },
  });
  const sections = editorialOrder(rows, false).flatMap((section) => {
    try {
      const text = extractPlainText(parseTiptapDocument(section.content));
      return text ? [{ id: section.id, title: section.title, text }] : [];
    } catch {
      // Una sección dañada no impide escuchar las demás. Nunca se lee JSON crudo.
      return [];
    }
  });

  if (sections.length === 0) {
    return { success: false, message: "Este libro todavía no tiene texto para escuchar." };
  }

  return { success: true, bookTitle: book.title, sections };
}

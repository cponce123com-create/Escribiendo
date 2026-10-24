"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { countWordsInDocument, parseTiptapDocument } from "@escribiendo/book-schema";
import type { Prisma } from "@escribiendo/database";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { assertServerActionOrigin, type RequestContext } from "@/lib/security/request-context";
import { logger } from "@/lib/logger";
import { assertCanPerform } from "./permissions";
import { recomputeBookTotals } from "./statistics";
import type { LibraryActionState } from "./action-state";
import { BookImportError, MAX_IMPORT_FILE_BYTES, parseBookImport } from "./importer";

function errorState(message: string, fieldErrors?: Record<string, string>): LibraryActionState {
  return { status: "error", message, ...(fieldErrors ? { fieldErrors } : {}) };
}

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

const titleSchema = z.string().trim().min(1, "El título es obligatorio.").max(300);
const authorSchema = z.string().trim().min(1, "La autoría es obligatoria.").max(200);
const languageSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u, "El código de idioma no es válido.")
  .max(20);

export async function importBookAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  let context: RequestContext | undefined;
  try {
    context = await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }

  const session = await getSession();
  if (!session) redirect("/login");

  try {
    assertCanPerform(session.workspace.role, "book:create");
  } catch {
    return errorState("No tienes permisos para crear libros en este espacio de trabajo.");
  }

  const upload = formData.get("file");
  if (!upload || typeof upload === "string" || typeof upload.arrayBuffer !== "function") {
    return errorState("Selecciona un archivo EPUB, DOCX o PDF.", {
      file: "Selecciona un archivo.",
    });
  }
  if (upload.size === 0)
    return errorState("El archivo está vacío.", { file: "El archivo está vacío." });
  if (upload.size > MAX_IMPORT_FILE_BYTES) {
    return errorState("El archivo no puede superar los 15 MB.", { file: "Máximo 15 MB." });
  }

  let imported;
  try {
    imported = await parseBookImport(upload.name, new Uint8Array(await upload.arrayBuffer()));
  } catch (error) {
    if (error instanceof BookImportError) return errorState(error.message, { file: error.message });
    logger.error("books.import_parse_error", {
      requestId: context.requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return errorState(
      "No se pudo leer el archivo. Comprueba que no esté dañado e inténtalo de nuevo.",
    );
  }

  const parsedTitle = titleSchema.safeParse(formText(formData, "title") || imported.title || "");
  if (!parsedTitle.success) {
    return errorState(parsedTitle.error.issues[0]?.message ?? "El título no es válido.", {
      title: parsedTitle.error.issues[0]?.message ?? "El título no es válido.",
    });
  }

  const parsedAuthor = authorSchema.safeParse(
    formText(formData, "authorName") || imported.authorName || "Autor desconocido",
  );
  if (!parsedAuthor.success) {
    return errorState(parsedAuthor.error.issues[0]?.message ?? "La autoría no es válida.", {
      authorName: parsedAuthor.error.issues[0]?.message ?? "La autoría no es válida.",
    });
  }

  const parsedLanguage = languageSchema.safeParse(imported.language || "es");
  const language = parsedLanguage.success ? parsedLanguage.data : "es";

  let sections: Array<{
    title: string;
    content: Prisma.InputJsonValue;
    wordCount: number;
  }>;
  try {
    sections = imported.sections.map((section) => {
      const document = parseTiptapDocument({
        type: "doc",
        content: section.paragraphs.map((text) => ({
          type: "paragraph",
          content: [{ type: "text", text }],
        })),
      });
      return {
        title: section.title.slice(0, 300),
        content: document as unknown as Prisma.InputJsonValue,
        wordCount: countWordsInDocument(document),
      };
    });
  } catch (error) {
    logger.error("books.import_document_error", {
      requestId: context.requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return errorState("El texto extraído supera los límites de contenido de la biblioteca.");
  }

  try {
    const book = await prisma.$transaction(
      async (transaction) => {
        const created = await transaction.book.create({
          data: {
            workspaceId: session.workspace.id,
            createdById: session.user.id,
            title: parsedTitle.data,
            authorName: parsedAuthor.data,
            language,
          },
          select: { id: true },
        });

        const sectionRows = sections.map((section, sortOrder) => ({
          id: randomUUID(),
          bookId: created.id,
          type: "CHAPTER" as const,
          title: section.title,
          content: section.content,
          wordCount: section.wordCount,
          version: 1,
          sortOrder,
        }));
        await transaction.bookSection.createMany({ data: sectionRows });

        await transaction.sectionRevision.createMany({
          data: sections.map((section, index) => ({
            sectionId: sectionRows[index]!.id,
            createdById: session.user.id,
            version: 1,
            content: section.content,
            wordCount: section.wordCount,
            reason: "IMPORT" as const,
            title: section.title,
          })),
        });

        await recomputeBookTotals(transaction, created.id);
        return created;
      },
      { timeout: 30_000 },
    );

    await writeAuditLog(
      {
        action: "BOOK_IMPORTED",
        entityType: "Book",
        entityId: book.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { format: imported.format, sectionCount: sections.length },
      },
      context,
    );

    revalidatePath("/books");
    redirect(`/books/${book.id}`);
  } catch (error) {
    // Next redirect es una excepción de control de flujo y debe propagarse.
    if (error && typeof error === "object" && "digest" in error) throw error;
    logger.error("books.import_persist_error", {
      requestId: context.requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return errorState("No se pudo guardar el libro importado. Inténtalo de nuevo.");
  }
}

"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  IMPORT_SECTION_TYPES,
  type ImportAnalysisState,
  type ImportSectionType,
} from "./import-types";
import { tieneControlesIlegales } from "@escribiendo/shared";
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

const titleSchema = z
  .string()
  .trim()
  .min(1, "El título es obligatorio.")
  .max(300)
  .refine((value) => !tieneControlesIlegales(value), "El título contiene caracteres de control.");
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
  let fingerprint: string;
  try {
    const bytes = new Uint8Array(await upload.arrayBuffer());
    fingerprint = createHash("sha256").update(bytes).digest("hex");
    imported = await parseBookImport(upload.name, bytes);
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
    formText(formData, "authorName") || imported.authorName || "",
  );
  if (!parsedAuthor.success) {
    return errorState(parsedAuthor.error.issues[0]?.message ?? "La autoría no es válida.", {
      authorName: parsedAuthor.error.issues[0]?.message ?? "La autoría no es válida.",
    });
  }

  const parsedLanguage = languageSchema.safeParse(imported.language || "es");
  const language = parsedLanguage.success ? parsedLanguage.data : "es";

  const rawChoices = formText(formData, "sectionChoices");
  if (!rawChoices || !formText(formData, "fingerprint"))
    return errorState("Primero analiza el archivo y revisa sus secciones antes de confirmar.");
  let choices:
    Array<{ index: number; title: string; type: ImportSectionType; include: boolean }> | undefined;
  if (rawChoices) {
    if (rawChoices.length > 200_000)
      return errorState("La revisión del archivo es demasiado grande.");
    try {
      choices = z
        .array(
          z.object({
            index: z.number().int().min(0),
            title: titleSchema,
            type: z.enum(
              Object.keys(IMPORT_SECTION_TYPES) as [ImportSectionType, ...ImportSectionType[]],
            ),
            include: z.boolean(),
          }),
        )
        .max(200)
        .parse(JSON.parse(rawChoices));
      if (
        formText(formData, "fingerprint") !== fingerprint ||
        choices.length !== imported.sections.length ||
        choices.some((choice, index) => choice.index !== index)
      )
        return errorState("El archivo cambió. Vuelve a analizarlo antes de importar.");
      if (!choices.some((choice) => choice.include))
        return errorState("Selecciona al menos una sección para importar.");
    } catch {
      return errorState("La selección de secciones no es válida. Vuelve a analizar el archivo.");
    }
  }
  let sections: Array<{
    title: string;
    type: ImportSectionType;
    content: Prisma.InputJsonValue;
    wordCount: number;
  }>;
  try {
    sections = imported.sections.flatMap((section, index) => {
      const choice = choices?.[index];
      if (choice && !choice.include) return [];
      const document = parseTiptapDocument(
        section.content ?? {
          type: "doc",
          content: section.paragraphs.map((text) => ({
            type: "paragraph",
            content: [{ type: "text", text }],
          })),
        },
      );
      return {
        title: (choice?.title ?? section.title).slice(0, 300),
        type: choice?.type ?? section.type ?? "CHAPTER",
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
          type: section.type,
          showInToc: ![
            "COPYRIGHT",
            "TABLE_OF_CONTENTS",
            "TITLE_PAGE",
            "DEDICATION",
            "EPIGRAPH",
          ].includes(section.type),
          title: section.title,
          content: section.content,
          wordCount: section.wordCount,
          version: 1,
          sortOrder,
        }));
        await transaction.bookSection.createMany({ data: sectionRows });
        const manualMatters = sectionRows.filter(
          (section) => section.type === "COPYRIGHT" || section.type === "TABLE_OF_CONTENTS",
        );
        if (manualMatters.length)
          await transaction.editorialMatter.createMany({
            data: manualMatters.map((section) => ({
              bookId: created.id,
              sectionId: section.id,
              kind: section.type as "COPYRIGHT" | "TABLE_OF_CONTENTS",
              mode: "MANUAL",
              title: section.title,
              showInToc: false,
              data: { source: "book-import" },
            })),
          });

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

/** Analiza sin escribir en BD. El archivo vuelve a validarse al confirmar. */
export async function analyzeBookImportAction(formData: FormData): Promise<ImportAnalysisState> {
  try {
    await assertServerActionOrigin();
  } catch {
    return { status: "error", message: "No se ha podido validar la solicitud." };
  }
  const session = await getSession();
  if (!session) return { status: "error", message: "Inicia sesión para analizar el archivo." };
  try {
    assertCanPerform(session.workspace.role, "book:create");
  } catch {
    return { status: "error", message: "No tienes permisos para importar libros." };
  }
  const upload = formData.get("file");
  if (!upload || typeof upload === "string" || typeof upload.arrayBuffer !== "function")
    return { status: "error", message: "Selecciona un archivo EPUB, DOCX o PDF." };
  if (upload.size > MAX_IMPORT_FILE_BYTES)
    return { status: "error", message: "El archivo no puede superar los 15 MB." };
  try {
    const bytes = new Uint8Array(await upload.arrayBuffer());
    const imported = await parseBookImport(upload.name, bytes);
    return {
      status: "success",
      preview: {
        fingerprint: createHash("sha256").update(bytes).digest("hex"),
        format: imported.format,
        title: imported.title ?? "",
        authorName: imported.authorName ?? "",
        warnings: [
          ...(imported.warnings ?? []),
          ...(!imported.authorName
            ? ["No se detectó la autoría: complétala antes de confirmar."]
            : []),
          ...(imported.sections.length === 1
            ? ["Solo se detectó una sección. Revisa si el original contiene divisiones que faltan."]
            : []),
        ],
        sections: imported.sections.map((section, index) => ({
          index,
          title: section.title,
          type: section.type ?? "CHAPTER",
          words: section.paragraphs.join(" ").split(/\s+/u).filter(Boolean).length,
          excerpt: section.paragraphs.join("\n").slice(0, 500),
        })),
      },
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof BookImportError
          ? error.message
          : "No se pudo analizar el archivo. Comprueba su formato e inténtalo de nuevo.",
    };
  }
}

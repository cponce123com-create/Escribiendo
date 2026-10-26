"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { countWordsInDocument } from "@escribiendo/book-schema";
import type { Prisma } from "@escribiendo/database";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { assertServerActionOrigin, type RequestContext } from "@/lib/security/request-context";
import { errorState, formValue, successState } from "@/lib/form-helpers";
import type { ActionState } from "@/lib/action-state";
import { assertCanPerform } from "./permissions";
import { withSerializableRetry } from "./serializable";
import { buildGlossaryDocument } from "./glossary";

const termSchema = z.object({
  bookId: z.string().uuid(),
  term: z.string().trim().min(1, "El término es obligatorio.").max(160),
  definition: z.string().trim().min(1, "La definición es obligatoria.").max(2000),
});

const updateSchema = termSchema.extend({ id: z.string().uuid() });

function duplicateTerm(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

async function bookInWorkspace(bookId: string, workspaceId: string) {
  return prisma.book.findFirst({
    where: { id: bookId, workspaceId, deletedAt: null },
    select: { id: true, title: true },
  });
}

function revalidateGlossary(bookId: string): void {
  for (const path of ["", "/glossary", "/edit", "/preview"])
    revalidatePath(`/books/${bookId}${path}`);
}

export async function createGlossaryTermAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }

  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  try {
    assertCanPerform(session.workspace.role, "section:update");
  } catch {
    return errorState("No tienes permisos para editar el glosario.");
  }

  const parsed = termSchema.safeParse({
    bookId: formValue(formData, "bookId"),
    term: formValue(formData, "term"),
    definition: formValue(formData, "definition"),
  });

  if (!parsed.success) {
    return errorState("Revisa el término y la definición.");
  }

  const book = await bookInWorkspace(parsed.data.bookId, session.workspace.id);

  if (!book) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  try {
    await prisma.bookGlossaryTerm.create({
      data: {
        bookId: book.id,
        term: parsed.data.term,
        definition: parsed.data.definition,
      },
    });
  } catch (error) {
    return errorState(
      duplicateTerm(error)
        ? "Ya existe un término con ese nombre en este libro."
        : "No se ha podido guardar el término.",
    );
  }

  revalidateGlossary(book.id);

  return successState("Término añadido.");
}

export async function updateGlossaryTermAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }

  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  try {
    assertCanPerform(session.workspace.role, "section:update");
  } catch {
    return errorState("No tienes permisos para editar el glosario.");
  }

  const parsed = updateSchema.safeParse({
    id: formValue(formData, "id"),
    bookId: formValue(formData, "bookId"),
    term: formValue(formData, "term"),
    definition: formValue(formData, "definition"),
  });

  if (!parsed.success) {
    return errorState("Revisa el término y la definición.");
  }

  const book = await bookInWorkspace(parsed.data.bookId, session.workspace.id);

  if (!book) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  try {
    const updated = await prisma.bookGlossaryTerm.updateMany({
      where: { id: parsed.data.id, bookId: book.id },
      data: { term: parsed.data.term, definition: parsed.data.definition },
    });

    if (updated.count !== 1) {
      return errorState("El término ya no existe.");
    }
  } catch (error) {
    return errorState(
      duplicateTerm(error)
        ? "Ya existe un término con ese nombre en este libro."
        : "No se ha podido guardar el término.",
    );
  }

  revalidateGlossary(book.id);

  return successState("Término actualizado.");
}

export async function deleteGlossaryTermAction(formData: FormData): Promise<void> {
  try {
    await assertServerActionOrigin();
  } catch {
    return;
  }

  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (!session || !canEdit(session.workspace.role)) {
    return;
  }

  const parsed = z
    .object({ id: z.string().uuid(), bookId: z.string().uuid() })
    .safeParse({ id: formValue(formData, "id"), bookId: formValue(formData, "bookId") });

  if (!parsed.success) {
    return;
  }

  const book = await bookInWorkspace(parsed.data.bookId, session.workspace.id);

  if (!book) {
    return;
  }

  await prisma.bookGlossaryTerm.deleteMany({
    where: { id: parsed.data.id, bookId: book.id },
  });

  revalidateGlossary(book.id);
}

function canEdit(role: Parameters<typeof assertCanPerform>[0]): boolean {
  try {
    assertCanPerform(role, "section:update");
    return true;
  } catch {
    return false;
  }
}

/**
 * Crea o actualiza la sección GLOSSARY con los términos actuales.
 *
 * La sección es contenido normal: se revisa, se previsualiza y se exporta como
 * cualquier otra, y el autor puede retocarla después.
 */
export async function syncGlossarySectionAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let context: RequestContext;

  try {
    context = await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }

  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  try {
    assertCanPerform(session.workspace.role, "section:update");
  } catch {
    return errorState("No tienes permisos para editar el glosario.");
  }

  const bookId = z.string().uuid().safeParse(formValue(formData, "bookId"));

  if (!bookId.success) {
    return errorState("El libro no es válido.");
  }

  const book = await bookInWorkspace(bookId.data, session.workspace.id);

  if (!book) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  const terms = await prisma.bookGlossaryTerm.findMany({
    where: { bookId: book.id },
    orderBy: { term: "asc" },
    select: { term: true, definition: true },
  });

  if (terms.length === 0) {
    return errorState("Añade al menos un término antes de generar el glosario.");
  }

  const document = buildGlossaryDocument(terms);
  const wordCount = countWordsInDocument(document);
  const existing = await prisma.bookSection.findFirst({
    where: { bookId: book.id, type: "GLOSSARY", deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, title: true, version: true },
  });
  let message: string;

  if (existing) {
    const nextVersion = existing.version + 1;

    try {
      await withSerializableRetry(() =>
        prisma.$transaction(async (transaction) => {
          await transaction.sectionRevision.create({
            data: {
              sectionId: existing.id,
              createdById: session.user.id,
              version: nextVersion,
              content: document as unknown as Prisma.InputJsonValue,
              wordCount,
              reason: "MANUAL",
              title: existing.title,
            },
          });

          const saved = await transaction.bookSection.updateMany({
            where: {
              id: existing.id,
              bookId: book.id,
              version: existing.version,
              deletedAt: null,
            },
            data: {
              content: document as unknown as Prisma.InputJsonValue,
              wordCount,
              version: nextVersion,
            },
          });

          if (saved.count !== 1) {
            throw new Error("SECTION_VERSION_CONFLICT");
          }
        }),
      );
    } catch {
      return errorState("Otra persona ha editado el glosario. Vuelve a intentarlo.");
    }

    message = "Sección de glosario actualizada.";
  } else {
    try {
      assertCanPerform(session.workspace.role, "section:create");
    } catch {
      return errorState("No tienes permisos para crear la sección de glosario.");
    }

    const last = await prisma.bookSection.aggregate({
      where: { bookId: book.id, deletedAt: null },
      _max: { sortOrder: true },
    });

    await prisma.bookSection.create({
      data: {
        bookId: book.id,
        type: "GLOSSARY",
        title: "Glosario",
        content: document as unknown as Prisma.InputJsonValue,
        wordCount,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
    });

    message = "Sección de glosario creada.";
  }

  await writeAuditLog(
    {
      action: "BOOK_GLOSSARY_SYNCED",
      entityType: "Book",
      entityId: book.id,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: { terms: terms.length, sectionId: existing?.id ?? null },
    },
    context,
  );

  revalidateGlossary(book.id);

  return successState(message);
}

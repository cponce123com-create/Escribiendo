"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertCanPerform } from "@/lib/books/permissions";
import { writeAuditLog } from "@/lib/auth/audit";
import { getSession } from "@/lib/auth/session";
import { assertServerActionOrigin } from "@/lib/security/request-context";
import { beginStoryAction } from "../action-helpers";
import type { ActionState } from "@/lib/action-state";
import { loadWritingPlanning } from "./queries";
import {
  MASTER_FIELDS,
  CHAPTER_FIELDS,
  masterFieldsSchema,
  chapterFieldsSchema,
  masterSnapshotSchema,
  chapterSnapshotSchema,
  masterChanged,
  buildWritingGuide,
  WritingGuideError,
} from "./brief";

const requestSchema = z.object({
  bookId: z.uuid(),
  sectionId: z.union([z.uuid(), z.literal("")]),
  version: z.coerce.number().int().nonnegative(),
  masterVersion: z.coerce.number().int().nonnegative(),
  sourceVersion: z.coerce.number().int().nonnegative(),
  sourceKey: z.string().regex(/^[a-f0-9]{64}$/u),
  status: z.enum(["DRAFT", "APPROVED"]),
});
const text = (form: FormData, key: string) =>
  typeof form.get(key) === "string" ? String(form.get(key)) : "";
const error = (e: unknown): ActionState => ({
  status: "error",
  message:
    e instanceof WritingGuideError
      ? e.message
      : "No se pudo guardar. Si otra persona modificó el plan, recarga antes de reintentarlo.",
});

export async function saveWritingBriefAction(_: ActionState, form: FormData): Promise<ActionState> {
  const start = await beginStoryAction();
  if (!start.ok) return start.state;
  assertCanPerform(start.session.workspace.role, "story:manage");
  const parsed = requestSchema.safeParse(
    Object.fromEntries(
      [
        "bookId",
        "sectionId",
        "version",
        "masterVersion",
        "sourceVersion",
        "sourceKey",
        "status",
      ].map((key) => [key, text(form, key)]),
    ),
  );
  if (!parsed.success) return { status: "error", message: "Revisa los datos de la guía." };
  const values = parsed.data;
  try {
    const data = await loadWritingPlanning(start.session, values.bookId);
    if (!data) throw new WritingGuideError("El libro no existe en este espacio de trabajo.");
    if (data.sourceKey !== values.sourceKey)
      throw new WritingGuideError(
        "El título, la autoría o la estructura cambiaron. Recarga y revisa antes de guardar.",
      );
    const section = values.sectionId ? data.sections.find((s) => s.id === values.sectionId) : null;
    if (values.sectionId && !section)
      throw new WritingGuideError("El capítulo no pertenece a este libro.");
    const current = section ? section.brief : data.master;
    if ((current?.version ?? 0) !== values.version)
      throw new WritingGuideError("La guía cambió en otra pestaña. Recarga antes de guardar.");
    const masterVersion = data.master?.version ?? 0;
    if (section && (masterVersion !== values.masterVersion || !data.master))
      throw new WritingGuideError("La ficha maestra cambió. Recarga y revisa el capítulo.");
    if (section && values.sourceVersion !== section.version)
      throw new WritingGuideError(
        "El manuscrito cambió. Revisa el resumen de lo escrito antes de guardarlo.",
      );
    const fields = section
      ? chapterFieldsSchema.parse({
          ...Object.fromEntries(Object.keys(CHAPTER_FIELDS).map((key) => [key, text(form, key)])),
          characterIds: form.getAll("characterIds"),
          worldIds: form.getAll("worldIds"),
        })
      : masterFieldsSchema.parse(
          Object.fromEntries(Object.keys(MASTER_FIELDS).map((key) => [key, text(form, key)])),
        );
    if (values.status === "APPROVED") {
      if (section) {
        if (!("objective" in fields) || !fields.objective || !fields.scenes || !fields.endingPoint)
          throw new WritingGuideError(
            "Para aprobar, completa objetivo, escenas y situación al finalizar.",
          );
        if (
          data.master?.status !== "APPROVED" ||
          masterChanged(data.master.content, data.book, data.sections)
        )
          throw new WritingGuideError("Aprueba primero una ficha maestra vigente.");
      } else if (!("premise" in fields) || !fields.premise || !fields.rules)
        throw new WritingGuideError(
          "Para aprobar la ficha maestra, completa la premisa y las reglas del libro.",
        );
    }
    const version = values.version + 1;
    const content =
      section && "characterIds" in fields
        ? (() => {
            const characters = fields.characterIds.map((id) =>
              data.characters.find((c) => c.id === id),
            );
            const worlds = fields.worldIds.map((id) => data.worlds.find((w) => w.id === id));
            if (characters.some((c) => !c) || worlds.some((w) => !w))
              throw new WritingGuideError(
                "Un personaje o lugar seleccionado no pertenece al libro o ya no está disponible.",
              );
            const context = [
              ...characters.map(
                (c) =>
                  `Personaje: ${c!.name}${c!.aliases.length ? ` (alias: ${c!.aliases.join(", ")})` : ""}. ${c!.summary || "Sin descripción registrada."}`,
              ),
              ...worlds.map(
                (w) =>
                  `Lugar o elemento: ${w!.name}. ${w!.summary || "Sin descripción registrada."}`,
              ),
            ].join("\n");
            return chapterSnapshotSchema.parse({
              ...fields,
              title: section.title,
              masterVersion,
              sourceVersion: section.version,
              context,
            });
          })()
        : masterSnapshotSchema.parse({
            ...fields,
            title: data.book.title,
            author: data.book.authorName,
            genre: data.book.genre ?? "",
            sections: data.sections.map(({ id, title }) => ({ id, title })),
          });

    // Revisiones inmutables + unicidad de versión: dos peticiones concurrentes
    // no pueden reemplazarse. El chequeo del libro se repite dentro de la transacción.
    await prisma.$transaction(
      async (tx) => {
        const book = await tx.book.findFirst({
          where: { id: values.bookId, workspaceId: start.session.workspace.id, deletedAt: null },
          select: { id: true, title: true, authorName: true, genre: true },
        });
        if (
          !book ||
          book.title !== data.book.title ||
          book.authorName !== data.book.authorName ||
          book.genre !== data.book.genre
        )
          throw new WritingGuideError("El libro cambió. Recarga antes de guardar.");
        // La lectura dentro de la transacción detecta cambios de estructura y versión.
        const rows = await tx.bookSection.findMany({
          where: { bookId: values.bookId, deletedAt: null, isHidden: false },
          select: {
            id: true,
            title: true,
            type: true,
            parentId: true,
            sortOrder: true,
            version: true,
          },
        });
        const { editorialOrder } = await import("@/lib/books/reading-order");
        const ordered = editorialOrder(rows, false);
        if (
          JSON.stringify(ordered.map(({ id, title }) => ({ id, title }))) !==
          JSON.stringify(data.sections.map(({ id, title }) => ({ id, title })))
        )
          throw new WritingGuideError("La estructura cambió. Recarga antes de guardar.");
        if (section) {
          const fresh = ordered.find((s) => s.id === section.id);
          const master = await tx.bookWritingBrief.findFirst({
            where: { bookId: values.bookId },
            orderBy: { version: "desc" },
            select: { version: true },
          });
          if (fresh?.version !== values.sourceVersion || master?.version !== masterVersion)
            throw new WritingGuideError(
              "El manuscrito o la ficha maestra cambió. Revisa antes de guardar.",
            );
          await tx.chapterWritingBrief.create({
            data: { sectionId: section.id, version, status: values.status, content },
          });
        } else {
          await tx.bookWritingBrief.create({
            data: { bookId: values.bookId, version, status: values.status, content },
          });
        }
      },
      { isolationLevel: "Serializable" },
    );
    await writeAuditLog(
      {
        action: "WRITING_BRIEF_SAVED",
        entityType: section ? "BookSection" : "Book",
        entityId: section?.id ?? values.bookId,
        workspaceId: start.session.workspace.id,
        actorId: start.session.user.id,
        metadata: { version, status: values.status },
      },
      start.context,
    );
    revalidatePath("/planning");
    return {
      status: "success",
      message:
        values.status === "APPROVED"
          ? "Guía aprobada. Se conserva la revisión anterior."
          : "Borrador guardado. Se conserva la revisión anterior.",
    };
  } catch (e) {
    if (e instanceof z.ZodError)
      return {
        status: "error",
        message: e.issues[0]?.message ?? "Revisa los campos y sus límites.",
      };
    return error(e);
  }
}

export async function getWritingGuideAction(
  bookId: string,
  sectionId: string,
  mode: "brief" | "complete",
): Promise<{ ok: true; content: string } | { ok: false; message: string }> {
  try {
    await assertServerActionOrigin();
    const session = await getSession();
    if (!session) throw new WritingGuideError("Inicia sesión para continuar.");
    if (
      !z.uuid().safeParse(bookId).success ||
      !z.uuid().safeParse(sectionId).success ||
      !["brief", "complete"].includes(mode)
    )
      throw new WritingGuideError("La selección no es válida.");
    const data = await loadWritingPlanning(session, bookId);
    const section = data?.sections.find((s) => s.id === sectionId);
    if (!data?.master || !section?.brief)
      throw new WritingGuideError(
        "Completa y aprueba las fichas antes de preparar las instrucciones.",
      );
    if (masterChanged(data.master.content, data.book, data.sections))
      throw new WritingGuideError(
        "El título, la autoría o la estructura cambiaron. Revisa y aprueba otra vez la ficha maestra.",
      );
    return {
      ok: true,
      content: buildWritingGuide({
        master: data.master,
        chapter: section.brief,
        sectionId,
        sections: data.sections,
        mode,
      }),
    };
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof WritingGuideError
          ? e.message
          : "No se pudo preparar la guía. Comprueba que las migraciones estén aplicadas.",
    };
  }
}

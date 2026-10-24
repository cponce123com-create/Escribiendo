"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  tocParametersSchema,
  TOC_TEMPLATE_CATALOG,
  legalPageTemplateSchema,
  legalClausesSchema,
  LEGAL_TEMPLATE_VERSIONS,
  CREATIVE_COMMONS_LICENSES,
} from "@escribiendo/templates";
import { getSession } from "@/lib/auth/session";
import { assertCanPerform } from "@/lib/books/permissions";
import { assertServerActionOrigin } from "@/lib/security/request-context";
import { writeAuditLog } from "@/lib/auth/audit";
import { prisma } from "@/lib/db";
import { errorState, successState, formValue } from "@/lib/form-helpers";
import type { ActionState } from "@/lib/action-state";
import {
  dedicationSettingsSchema,
  dropCapOverrideSchema,
  dropCapSettingsSchema,
  legalFieldsSchema,
  settingsRecord,
} from "./template-settings";

export async function updateLegalTemplateAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  let context;
  try {
    context = await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }
  const session = await getSession();
  if (!session) return errorState("Inicia sesión para guardar la página legal.");
  try {
    assertCanPerform(session.workspace.role, "layout:manage");
  } catch {
    return errorState("No tienes permisos para gestionar la maquetación.");
  }
  const parsed = z
    .object({
      bookId: z.string().uuid(),
      template: legalPageTemplateSchema,
      mode: z.enum(["TEMPLATE", "DISABLED", "MANUAL"]),
      sectionId: z.union([z.string().uuid(), z.literal("")]),
      clauses: legalClausesSchema,
      license: z.union([z.enum(CREATIVE_COMMONS_LICENSES), z.literal("")]),
    })
    .safeParse({
      bookId: formValue(form, "bookId"),
      template: formValue(form, "template"),
      mode: formValue(form, "mode"),
      sectionId: formValue(form, "sectionId"),
      clauses: formValue(form, "customClauses"),
      license: formValue(form, "license"),
    });
  if (!parsed.success)
    return errorState(parsed.error.issues[0]?.message ?? "Revisa la configuración legal.");
  let fields;
  try {
    fields = legalFieldsSchema.parse(JSON.parse(formValue(form, "legalFields") || "{}"));
  } catch {
    return errorState("Revisa los datos de la página legal.");
  }
  const data = parsed.data;
  if (data.mode === "MANUAL" && !data.sectionId)
    return errorState("Elige una sección para la página legal propia.");
  if (data.mode === "TEMPLATE" && data.template === "copyright-creative-commons" && !data.license)
    return errorState("Elige una licencia Creative Commons.");
  try {
    const editionId = await prisma.$transaction(
      async (tx) => {
        const edition = await tx.bookEdition.findFirst({
          where: {
            bookId: data.bookId,
            book: { workspaceId: session.workspace.id, deletedAt: null },
          },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: { id: true, settings: true },
        });
        if (!edition) throw new Error("Aplica primero una maqueta a este libro.");
        if (data.mode === "MANUAL") {
          const section = await tx.bookSection.findFirst({
            where: {
              id: data.sectionId,
              type: { in: ["CUSTOM", "COPYRIGHT"] },
              bookId: data.bookId,
              deletedAt: null,
              book: { workspaceId: session.workspace.id, deletedAt: null },
            },
            select: { id: true },
          });
          if (!section) throw new Error("La sección no pertenece a este libro.");
        }
        const settings = {
          ...settingsRecord(edition.settings),
          legalPageTemplate: data.template,
          legalPageTemplateVersion: LEGAL_TEMPLATE_VERSIONS[data.template],
          legalPageMode: data.mode,
          legalPageSectionId: data.sectionId || null,
          legalPageClauses: data.clauses,
          legalPageLicense: data.license,
          legalPageFields: fields,
        };
        await tx.bookEdition.update({
          where: { id: edition.id },
          data: { settings: JSON.parse(JSON.stringify(settings)) },
        });
        const existing = await tx.editorialMatter.findMany({
          where: { bookId: data.bookId, kind: "COPYRIGHT", deletedAt: null },
          select: { id: true, data: true },
        });
        const row =
          existing.find((item) => settingsRecord(item.data).editionId === edition.id) ??
          existing.find((item) => !settingsRecord(item.data).editionId);
        const matterData = {
          mode: data.mode,
          enabled: data.mode !== "DISABLED",
          sectionId: data.mode === "MANUAL" ? data.sectionId : null,
          templateSlug: data.template,
          templateVersion: LEGAL_TEMPLATE_VERSIONS[data.template],
          data: JSON.parse(JSON.stringify({ ...settingsRecord(row?.data), editionId: edition.id })),
          includeInExport: true,
        };
        if (row) await tx.editorialMatter.update({ where: { id: row.id }, data: matterData });
        else
          await tx.editorialMatter.create({
            data: { ...matterData, bookId: data.bookId, kind: "COPYRIGHT" },
          });
        return edition.id;
      },
      { isolationLevel: "Serializable" },
    );
    await writeAuditLog(
      {
        action: "LEGAL_TEMPLATE_UPDATED",
        entityType: "BookEdition",
        entityId: editionId,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: {
          template: data.template,
          version: LEGAL_TEMPLATE_VERSIONS[data.template],
          mode: data.mode,
        },
      },
      context,
    );
  } catch (error) {
    return errorState(
      error instanceof Error &&
        [
          "Aplica primero una maqueta a este libro.",
          "La sección no pertenece a este libro.",
        ].includes(error.message)
        ? error.message
        : "No se pudo guardar. Vuelve a intentarlo.",
    );
  }
  for (const path of ["/edicion", "/layout", "/preview", "/export"])
    revalidatePath(`/books/${data.bookId}${path}`);
  return successState("Página legal guardada.");
}

export async function updateTocTemplateAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  let context;
  try {
    context = await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }
  const session = await getSession();
  if (!session) return errorState("Inicia sesión para guardar el índice.");
  try {
    assertCanPerform(session.workspace.role, "layout:manage");
  } catch {
    return errorState("No tienes permisos para gestionar la maquetación.");
  }
  const bookId = z.string().uuid().safeParse(formValue(form, "bookId"));
  let parameters;
  try {
    parameters = tocParametersSchema.parse(JSON.parse(formValue(form, "parameters")));
  } catch {
    return errorState("Revisa los parámetros del índice.");
  }
  if (!bookId.success) return errorState("El libro no es válido.");
  const version = TOC_TEMPLATE_CATALOG.find(
    (item) => item.slug === parameters.tocTemplate,
  )!.version;
  try {
    const editionId = await prisma.$transaction(
      async (tx) => {
        const edition = await tx.bookEdition.findFirst({
          where: {
            bookId: bookId.data,
            book: { workspaceId: session.workspace.id, deletedAt: null },
          },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: { id: true, settings: true },
        });
        if (!edition) throw new Error("Aplica primero una maqueta a este libro.");
        const settings = {
          ...settingsRecord(edition.settings),
          ...parameters,
          tocTemplateVersion: version,
        };
        await tx.bookEdition.update({
          where: { id: edition.id },
          data: {
            settings,
            tocDepth: parameters.tocDepth,
            tocIncludeFrontMatter: parameters.tocIncludeFrontMatter,
            tocIncludeBackMatter: parameters.tocIncludeBackMatter,
          },
        });
        const rows = await tx.editorialMatter.findMany({
          where: { bookId: bookId.data, kind: "TABLE_OF_CONTENTS", deletedAt: null },
          select: { id: true, data: true, mode: true },
        });
        // Conserva las filas MANUAL antiguas; la elección explícita de esta edición manda.
        const row = rows.find((item) => settingsRecord(item.data).editionId === edition.id);
        const values = {
          mode: "AUTOMATIC" as const,
          enabled: true,
          sectionId: null,
          templateSlug: parameters.tocTemplate,
          templateVersion: version,
          title: parameters.tocTitle,
          data: JSON.parse(JSON.stringify({ ...settingsRecord(row?.data), editionId: edition.id })),
          includeInExport: true,
        };
        if (row) await tx.editorialMatter.update({ where: { id: row.id }, data: values });
        else
          await tx.editorialMatter.create({
            data: { ...values, bookId: bookId.data, kind: "TABLE_OF_CONTENTS" },
          });
        return edition.id;
      },
      { isolationLevel: "Serializable" },
    );
    await writeAuditLog(
      {
        action: "TOC_TEMPLATE_UPDATED",
        entityType: "BookEdition",
        entityId: editionId,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { template: parameters.tocTemplate, version },
      },
      context,
    );
  } catch {
    return errorState("No se pudo guardar el índice. Comprueba la maqueta y vuelve a intentarlo.");
  }
  for (const path of ["/edicion", "/layout", "/preview", "/export"])
    revalidatePath(`/books/${bookId.data}${path}`);
  return successState("Plantilla de índice guardada.");
}

/**
 * Guarda la composición de la dedicatoria de la edición actual.
 *
 * El texto no se duplica: sigue en la sección `DEDICATION`. Solo se persiste
 * cómo se compone, de modo que la vista previa y el PDF apliquen exactamente
 * la misma plantilla, alineación, posición y firma.
 */
export async function updateDedicationAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  let context;
  try {
    context = await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }
  const session = await getSession();
  if (!session) return errorState("Inicia sesión para guardar la dedicatoria.");
  try {
    assertCanPerform(session.workspace.role, "layout:manage");
  } catch {
    return errorState("No tienes permisos para gestionar la maquetación.");
  }
  const bookId = z.string().uuid().safeParse(formValue(form, "bookId"));
  if (!bookId.success) return errorState("El libro no es válido.");
  const dedication = dedicationSettingsSchema.safeParse({
    template: formValue(form, "template"),
    alignment: formValue(form, "alignment"),
    verticalPosition: formValue(form, "verticalPosition"),
    signature: formValue(form, "signature"),
  });
  if (!dedication.success)
    return errorState(
      dedication.error.issues[0]?.message ?? "Revisa la composición de la dedicatoria.",
    );
  try {
    const editionId = await prisma.$transaction(
      async (tx) => {
        const edition = await tx.bookEdition.findFirst({
          where: {
            bookId: bookId.data,
            book: { workspaceId: session.workspace.id, deletedAt: null },
          },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: { id: true, settings: true },
        });
        if (!edition) throw new Error("Aplica primero una maqueta a este libro.");
        const settings = {
          ...settingsRecord(edition.settings),
          dedication: dedication.data,
        };
        await tx.bookEdition.update({
          where: { id: edition.id },
          data: { settings: JSON.parse(JSON.stringify(settings)) },
        });
        return edition.id;
      },
      { isolationLevel: "Serializable" },
    );
    await writeAuditLog(
      {
        action: "DEDICATION_UPDATED",
        entityType: "BookEdition",
        entityId: editionId,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: {
          template: dedication.data.template,
          alignment: dedication.data.alignment,
          verticalPosition: dedication.data.verticalPosition,
        },
      },
      context,
    );
  } catch (error) {
    return errorState(
      error instanceof Error && error.message === "Aplica primero una maqueta a este libro."
        ? error.message
        : "No se pudo guardar. Vuelve a intentarlo.",
    );
  }
  for (const path of ["/edicion", "/layout", "/preview", "/export"])
    revalidatePath(`/books/${bookId.data}${path}`);
  return successState("Dedicatoria guardada.");
}

/**
 * Guarda la letra capital de la edición.
 *
 * Vista previa y exportación leen esta única decisión: no hay dos
 * interruptores que puedan mostrar estados distintos.
 */
export async function updateDropCapAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  let context;
  try {
    context = await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }
  const session = await getSession();
  if (!session) return errorState("Inicia sesión para guardar la letra capital.");
  try {
    assertCanPerform(session.workspace.role, "layout:manage");
  } catch {
    return errorState("No tienes permisos para gestionar la maquetación.");
  }
  const bookId = z.string().uuid().safeParse(formValue(form, "bookId"));
  if (!bookId.success) return errorState("El libro no es válido.");
  const overridesSchema = z.record(z.string().uuid(), dropCapOverrideSchema);
  let overrides: Record<string, { enabled: boolean; lines: 2 | 3 }> = {};
  const rawOverrides = formValue(form, "overrides");
  if (rawOverrides) {
    try {
      const parsed = overridesSchema.safeParse(JSON.parse(rawOverrides));
      if (!parsed.success) return errorState("Revisa las excepciones por capítulo.");
      overrides = parsed.data;
    } catch {
      return errorState("Revisa las excepciones por capítulo.");
    }
  }
  const dropCap = dropCapSettingsSchema.safeParse({
    enabled: formValue(form, "enabled") === "true",
    lines: Number(formValue(form, "lines")),
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
  });
  if (!dropCap.success)
    return errorState(
      dropCap.error.issues[0]?.message ?? "Revisa la configuración de la letra capital.",
    );
  try {
    const editionId = await prisma.$transaction(
      async (tx) => {
        const edition = await tx.bookEdition.findFirst({
          where: {
            bookId: bookId.data,
            book: { workspaceId: session.workspace.id, deletedAt: null },
          },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: { id: true, settings: true },
        });
        if (!edition) throw new Error("Aplica primero una maqueta a este libro.");
        const sectionIds = new Set(
          (
            await tx.bookSection.findMany({
              where: { bookId: bookId.data, deletedAt: null },
              select: { id: true },
            })
          ).map((section) => section.id),
        );
        if (Object.keys(dropCap.data.overrides ?? {}).some((id) => !sectionIds.has(id))) {
          throw new Error("Alguna de las secciones ya no existe.");
        }
        const settings = {
          ...settingsRecord(edition.settings),
          dropCap: dropCap.data,
        };
        await tx.bookEdition.update({
          where: { id: edition.id },
          data: { settings: JSON.parse(JSON.stringify(settings)) },
        });
        return edition.id;
      },
      { isolationLevel: "Serializable" },
    );
    await writeAuditLog(
      {
        action: "DROP_CAP_UPDATED",
        entityType: "BookEdition",
        entityId: editionId,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: {
          enabled: dropCap.data.enabled,
          lines: dropCap.data.lines,
          overrides: Object.keys(dropCap.data.overrides ?? {}).length,
        },
      },
      context,
    );
  } catch (error) {
    const known =
      error instanceof Error &&
      (error.message === "Aplica primero una maqueta a este libro." ||
        error.message === "Alguna de las secciones ya no existe.");
    return errorState(known ? error.message : "No se pudo guardar. Vuelve a intentarlo.");
  }
  for (const path of ["/edicion", "/layout", "/preview", "/export"])
    revalidatePath(`/books/${bookId.data}${path}`);
  return successState("Letra capital guardada.");
}

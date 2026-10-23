"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
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
import { legalFieldsSchema, settingsRecord } from "./template-settings";

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
          data: { editionId: edition.id },
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

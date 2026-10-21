"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { assertServerActionOrigin, type RequestContext } from "@/lib/security/request-context";
import { logger } from "@/lib/logger";
import { errorState, formValue, successState } from "@/lib/form-helpers";
import type { ActionState } from "@/lib/action-state";
import { assertCanPerform } from "@/lib/books/permissions";
import { ensureTemplateProfile, getTemplate } from "@/lib/layout/profiles";
import { validateLayoutGeometry } from "@escribiendo/editorial-engine";

/**
 * Perfiles de página, plantillas y ediciones.
 *
 * La geometría se valida con el motor de maquetación antes de escribir: un
 * perfil con márgenes que no dejan área de texto no debe poder guardarse.
 */

const uuidSchema = z.string().uuid("El identificador no es válido.");

const profileSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(160),
  format: z.enum(["A4", "A5", "B5", "INCH_5X8", "INCH_5_5X8_5", "INCH_6X9", "POCKET", "CUSTOM"]),
  pageWidthMm: z.coerce.number().min(1).max(600),
  pageHeightMm: z.coerce.number().min(1).max(600),
  marginTopMm: z.coerce.number().min(0).max(200),
  marginBottomMm: z.coerce.number().min(0).max(200),
  marginInnerMm: z.coerce.number().min(0).max(200),
  marginOuterMm: z.coerce.number().min(0).max(200),
  gutterMm: z.coerce.number().min(0).max(200),
  bleedMm: z.coerce.number().min(0).max(200),
  headerDistanceMm: z.coerce.number().min(0).max(200),
  footerDistanceMm: z.coerce.number().min(0).max(200),
  mirrorMargins: z.coerce.boolean(),
  showPageNumbers: z.coerce.boolean(),
  chapterStartsRecto: z.coerce.boolean(),
});

/**
 * Distancias de encabezado y pie por defecto.
 *
 * Un campo vacío no puede convertirse en cero: el folio quedaría encima del
 * borde de la hoja y se cortaría al imprimir.
 */
const DEFAULT_HEADER_DISTANCE_MM = 8;
const DEFAULT_FOOTER_DISTANCE_MM = 8;

/** Los campos de un `FormData` que representan una casilla marcada. */
function checkbox(formData: FormData, key: string): boolean {
  return formValue(formData, key) === "on" || formValue(formData, key) === "true";
}

function logActionError(event: string, context: RequestContext | undefined, error: unknown): void {
  logger.error(event, {
    requestId: context?.requestId,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

/**
 * Traduce los avisos de la geometría a errores de formulario.
 *
 * Los errores bloquean el guardado; los avisos no, pero se devuelven para
 * que quien edita los vea.
 */
function geometryIssues(input: z.infer<typeof profileSchema>): {
  errors: string[];
  warnings: string[];
} {
  const result = validateLayoutGeometry({
    pageWidthMm: input.pageWidthMm,
    pageHeightMm: input.pageHeightMm,
    marginTopMm: input.marginTopMm,
    marginBottomMm: input.marginBottomMm,
    marginInnerMm: input.marginInnerMm,
    marginOuterMm: input.marginOuterMm,
    gutterMm: input.gutterMm,
    bleedMm: input.bleedMm,
    headerDistanceMm: input.headerDistanceMm,
    footerDistanceMm: input.footerDistanceMm,
  });

  return {
    errors: result.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message),
    warnings: result.issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.message),
  };
}

function parseProfile(formData: FormData): ReturnType<typeof profileSchema.safeParse> {
  return profileSchema.safeParse({
    name: formValue(formData, "name"),
    format: formValue(formData, "format"),
    pageWidthMm: formValue(formData, "pageWidthMm"),
    pageHeightMm: formValue(formData, "pageHeightMm"),
    marginTopMm: formValue(formData, "marginTopMm"),
    marginBottomMm: formValue(formData, "marginBottomMm"),
    marginInnerMm: formValue(formData, "marginInnerMm"),
    marginOuterMm: formValue(formData, "marginOuterMm"),
    gutterMm: formValue(formData, "gutterMm"),
    bleedMm: formValue(formData, "bleedMm"),
    headerDistanceMm:
      formValue(formData, "headerDistanceMm") === ""
        ? DEFAULT_HEADER_DISTANCE_MM
        : formValue(formData, "headerDistanceMm"),
    footerDistanceMm:
      formValue(formData, "footerDistanceMm") === ""
        ? DEFAULT_FOOTER_DISTANCE_MM
        : formValue(formData, "footerDistanceMm"),
    mirrorMargins: checkbox(formData, "mirrorMargins"),
    showPageNumbers: checkbox(formData, "showPageNumbers"),
    chapterStartsRecto: checkbox(formData, "chapterStartsRecto"),
  });
}

export async function createLayoutProfileAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let context: RequestContext | undefined;

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
    assertCanPerform(session.workspace.role, "layout:manage");
  } catch {
    return errorState("No tienes permisos para gestionar la maquetación.");
  }

  const parsed = parseProfile(formData);

  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "El perfil no es válido.");
  }

  const { errors, warnings } = geometryIssues(parsed.data);

  if (errors.length > 0) {
    return errorState(errors[0] ?? "La geometría de la página no es válida.");
  }

  try {
    await prisma.layoutProfile.create({
      data: {
        workspaceId: session.workspace.id,
        name: parsed.data.name,
        format: parsed.data.format,
        pageWidthMm: parsed.data.pageWidthMm,
        pageHeightMm: parsed.data.pageHeightMm,
        marginTopMm: parsed.data.marginTopMm,
        marginBottomMm: parsed.data.marginBottomMm,
        marginInnerMm: parsed.data.marginInnerMm,
        marginOuterMm: parsed.data.marginOuterMm,
        gutterMm: parsed.data.gutterMm,
        bleedMm: parsed.data.bleedMm,
        headerDistanceMm: parsed.data.headerDistanceMm,
        footerDistanceMm: parsed.data.footerDistanceMm,
        mirrorMargins: parsed.data.mirrorMargins,
        showPageNumbers: parsed.data.showPageNumbers,
        chapterStartsRecto: parsed.data.chapterStartsRecto,
      },
    });
  } catch (error) {
    logActionError("layout.profile_create_error", context, error);
    return errorState("No se ha podido guardar el perfil de página.");
  }

  await writeAuditLog(
    {
      action: "LAYOUT_PROFILE_CREATED",
      entityType: "LayoutProfile",
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: { name: parsed.data.name, format: parsed.data.format },
    },
    context,
  );

  revalidatePath("/books");

  // Al terminar se vuelve a la maquetación del libro, que es donde está la
  // lista de perfiles.
  const bookId = uuidSchema.safeParse(formValue(formData, "bookId"));

  if (bookId.success) {
    redirect(`/books/${bookId.data}/layout?aviso=creado`);
  }

  return successState(
    warnings.length > 0
      ? `Perfil guardado. Revisa: ${warnings.join(" ")}`
      : "Perfil de página guardado.",
  );
}

export async function updateLayoutProfileAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let context: RequestContext | undefined;

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
    assertCanPerform(session.workspace.role, "layout:manage");
  } catch {
    return errorState("No tienes permisos para gestionar la maquetación.");
  }

  const profileId = uuidSchema.safeParse(formValue(formData, "profileId"));

  if (!profileId.success) {
    return errorState("El perfil no es válido.");
  }

  const parsed = parseProfile(formData);

  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "El perfil no es válido.");
  }

  const { errors, warnings } = geometryIssues(parsed.data);

  if (errors.length > 0) {
    return errorState(errors[0] ?? "La geometría de la página no es válida.");
  }

  try {
    const result = await prisma.layoutProfile.updateMany({
      where: { id: profileId.data, workspaceId: session.workspace.id, deletedAt: null },
      data: {
        name: parsed.data.name,
        format: parsed.data.format,
        pageWidthMm: parsed.data.pageWidthMm,
        pageHeightMm: parsed.data.pageHeightMm,
        marginTopMm: parsed.data.marginTopMm,
        marginBottomMm: parsed.data.marginBottomMm,
        marginInnerMm: parsed.data.marginInnerMm,
        marginOuterMm: parsed.data.marginOuterMm,
        gutterMm: parsed.data.gutterMm,
        bleedMm: parsed.data.bleedMm,
        headerDistanceMm: parsed.data.headerDistanceMm,
        footerDistanceMm: parsed.data.footerDistanceMm,
        mirrorMargins: parsed.data.mirrorMargins,
        showPageNumbers: parsed.data.showPageNumbers,
        chapterStartsRecto: parsed.data.chapterStartsRecto,
      },
    });

    if (result.count === 0) {
      return errorState("El perfil no existe en este espacio de trabajo.");
    }
  } catch (error) {
    logActionError("layout.profile_update_error", context, error);
    return errorState("No se ha podido guardar el perfil de página.");
  }

  await writeAuditLog(
    {
      action: "LAYOUT_PROFILE_UPDATED",
      entityType: "LayoutProfile",
      entityId: profileId.data,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
    },
    context,
  );

  revalidatePath("/books");

  const bookId = uuidSchema.safeParse(formValue(formData, "bookId"));

  if (bookId.success) {
    redirect(`/books/${bookId.data}/layout?aviso=actualizado`);
  }

  return successState(
    warnings.length > 0
      ? `Perfil guardado. Revisa: ${warnings.join(" ")}`
      : "Perfil de página actualizado.",
  );
}

export async function deleteLayoutProfileAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let context: RequestContext | undefined;

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
    assertCanPerform(session.workspace.role, "layout:manage");
  } catch {
    return errorState("No tienes permisos para gestionar la maquetación.");
  }

  const profileId = uuidSchema.safeParse(formValue(formData, "profileId"));

  if (!profileId.success) {
    return errorState("El perfil no es válido.");
  }

  const inUse = await prisma.bookEdition.count({
    where: { layoutProfileId: profileId.data },
  });

  if (inUse > 0) {
    return errorState(
      "El perfil está en uso por alguna edición. Asigna otro perfil a esas ediciones antes de eliminarlo.",
    );
  }

  try {
    const result = await prisma.layoutProfile.updateMany({
      where: { id: profileId.data, workspaceId: session.workspace.id, deletedAt: null },
      data: { deletedAt: new Date(), isDefault: false },
    });

    if (result.count === 0) {
      return errorState("El perfil no existe en este espacio de trabajo.");
    }
  } catch (error) {
    logActionError("layout.profile_delete_error", context, error);
    return errorState("No se ha podido eliminar el perfil de página.");
  }

  await writeAuditLog(
    {
      action: "LAYOUT_PROFILE_DELETED",
      entityType: "LayoutProfile",
      entityId: profileId.data,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
    },
    context,
  );

  revalidatePath("/books");

  return successState("Perfil de página eliminado.");
}

/** Marca un perfil como el predeterminado del estudio. */
export async function setDefaultLayoutProfileAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let context: RequestContext | undefined;

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
    assertCanPerform(session.workspace.role, "layout:manage");
  } catch {
    return errorState("No tienes permisos para gestionar la maquetación.");
  }

  const profileId = uuidSchema.safeParse(formValue(formData, "profileId"));

  if (!profileId.success) {
    return errorState("El perfil no es válido.");
  }

  const profile = await prisma.layoutProfile.findFirst({
    where: { id: profileId.data, workspaceId: session.workspace.id, deletedAt: null },
    select: { id: true },
  });

  if (!profile) {
    return errorState("El perfil no existe en este espacio de trabajo.");
  }

  try {
    // El índice parcial permite un solo perfil predeterminado por espacio
    // de trabajo: hay que quitar el anterior en la misma transacción.
    await prisma.$transaction([
      prisma.layoutProfile.updateMany({
        where: { workspaceId: session.workspace.id, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.layoutProfile.update({
        where: { id: profile.id },
        data: { isDefault: true },
      }),
    ]);
  } catch (error) {
    logActionError("layout.profile_default_error", context, error);
    return errorState("No se ha podido marcar el perfil como predeterminado.");
  }

  revalidatePath("/books");

  return successState("Perfil predeterminado actualizado.");
}

/**
 * Aplica una plantilla a un libro.
 *
 * La plantilla lleva su geometría predeterminada: el perfil de página se
 * crea o se reutiliza a partir de ella, sin pedir medidas en el flujo
 * principal.
 */
export async function updateEditionAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let context: RequestContext | undefined;

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
    assertCanPerform(session.workspace.role, "layout:manage");
  } catch {
    return errorState("No tienes permisos para gestionar la maquetación.");
  }

  const bookId = uuidSchema.safeParse(formValue(formData, "bookId"));

  if (!bookId.success) {
    return errorState("El libro no es válido.");
  }

  const templateId = uuidSchema.safeParse(formValue(formData, "templateId"));

  if (!templateId.success) {
    return errorState("Elige una plantilla editorial.");
  }

  const template = await getTemplate(session, templateId.data);

  if (!template) {
    return errorState("La plantilla editorial no existe en este espacio de trabajo.");
  }

  const book = await prisma.book.findFirst({
    where: { id: bookId.data, workspaceId: session.workspace.id, deletedAt: null },
    select: { id: true, title: true },
  });

  if (!book) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  let profile: Awaited<ReturnType<typeof ensureTemplateProfile>>;

  try {
    profile = await ensureTemplateProfile(session, template);
  } catch (error) {
    logActionError("layout.template_profile_error", context, error);
    return errorState("No se ha podido preparar la maqueta de la plantilla.");
  }

  try {
    const existing = await prisma.bookEdition.findFirst({
      where: { bookId: book.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true },
    });

    if (existing) {
      await prisma.bookEdition.update({
        where: { id: existing.id },
        data: {
          layoutProfileId: profile.id,
          editorialTemplateId: template.id,
          format: profile.format,
        },
      });
    } else {
      await prisma.bookEdition.create({
        data: {
          bookId: book.id,
          layoutProfileId: profile.id,
          editorialTemplateId: template.id,
          format: profile.format,
          name: `Edición de ${book.title}`,
          isDefault: true,
        },
      });
    }
  } catch (error) {
    logActionError("layout.edition_update_error", context, error);
    return errorState("No se ha podido aplicar la plantilla al libro.");
  }

  await writeAuditLog(
    {
      action: "LAYOUT_EDITION_UPDATED",
      entityType: "BookEdition",
      entityId: book.id,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: {
        templateId: template.id,
        templateSlug: template.slug,
        profileId: profile.id,
      },
    },
    context,
  );

  revalidatePath(`/books/${book.id}`);
  revalidatePath(`/books/${book.id}/layout`);
  revalidatePath(`/books/${book.id}/preview`);

  return successState("Plantilla aplicada al libro.");
}

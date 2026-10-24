"use server";
import {
  tocParametersSchema,
  buildLegalPage,
  legalClausesSchema,
  legalPageTemplateSchema,
} from "@escribiendo/templates";
import { buildTocPreview } from "./toc-preview";
import { getSession } from "@/lib/auth/session";
import { buildLegalMatterPreview } from "@/lib/layout/preview";
import { loadBookMatter } from "./book-matter";
import { assertServerActionOrigin } from "@/lib/security/request-context";
import { legalFieldsSchema } from "./template-settings";
import { z } from "zod";

export async function legalGalleryPreview(
  bookId: string,
  slug: string,
  clauses = "",
  license = "",
  fields: unknown = {},
) {
  await assertServerActionOrigin();
  const session = await getSession();
  if (!session) throw new Error("Inicia sesión para ver la plantilla.");
  const id = z.string().uuid().parse(bookId);
  const template = legalPageTemplateSchema.parse(slug);
  const customClauses = legalClausesSchema.parse(clauses);
  // La galería solo necesita la hoja legal: no se cargan las secciones ni se
  // pagina el cuerpo por cada cambio de campo.
  const matter = await loadBookMatter(session, id, []);
  if (!matter?.legal) return null;
  const input = {
    ...matter.legal,
    ...legalFieldsSchema.parse(fields),
    template,
    customClauses,
    ...(license
      ? { license: z.enum(["cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nc-nd", "cc0"]).parse(license) }
      : {}),
  };
  const result = buildLegalPage(input, { mode: matter.legalMode });
  const preview = await buildLegalMatterPreview(session, id, input, matter.legalMode);
  return { preview, warnings: result.warnings };
}

export async function tocGalleryPreview(bookId: string, raw: unknown) {
  await assertServerActionOrigin();
  const session = await getSession();
  if (!session) throw new Error("Inicia sesión para ver el índice.");
  const id = z.string().uuid().parse(bookId);
  const parameters = tocParametersSchema.parse(raw);
  return buildTocPreview(session, id, parameters);
}

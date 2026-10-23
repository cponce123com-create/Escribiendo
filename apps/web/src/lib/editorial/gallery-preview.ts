"use server";
import {
  tocParametersSchema,
  buildLegalPage,
  legalClausesSchema,
  legalPageTemplateSchema,
} from "@escribiendo/templates";
import { buildTocPreview } from "./toc-preview";
import { getSession } from "@/lib/auth/session";
import { buildPreview, loadPreviewSections } from "@/lib/layout/preview";
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
  const sections = await loadPreviewSections(session, id);
  const matter = await loadBookMatter(session, id, sections);
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
  const result = buildLegalPage(input);
  const preview = await buildPreview(session, id, {
    matterOverride: {
      ...matter,
      legal: input,
      hasCopyrightSection: false,
      legalPageMode: "TEMPLATE",
      previewIncompleteLegal: true,
    },
  });
  if (!preview) return null;
  return {
    preview: {
      ...preview,
      cover: null,
      pages: preview.pages.filter((page) =>
        page.blocks.some((block) => block.sectionId === "matter-copyright"),
      ),
    },
    warnings: result.warnings,
  };
}

export async function tocGalleryPreview(bookId: string, raw: unknown) {
  await assertServerActionOrigin();
  const session = await getSession();
  if (!session) throw new Error("Inicia sesión para ver el índice.");
  const id = z.string().uuid().parse(bookId);
  const parameters = tocParametersSchema.parse(raw);
  return buildTocPreview(session, id, parameters);
}

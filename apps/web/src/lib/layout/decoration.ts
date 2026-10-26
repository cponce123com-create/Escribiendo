import { z } from "zod";
import type { EditorialTemplateConfig } from "@escribiendo/templates";

/**
 * Decoración de página elegida por edición.
 *
 * Se guarda en `BookEdition.settings.decoration` para no duplicar plantillas:
 * la edición hereda la plantilla y solo cambia folio, numeración o cajas de
 * margen. Los valores ausentes se toman de la plantilla.
 */

export const decorationMarginBoxesSchema = z
  .object({
    "top-left-corner": z.string().max(200).optional(),
    "top-left": z.string().max(200).optional(),
    "top-center": z.string().max(200).optional(),
    "top-right": z.string().max(200).optional(),
    "top-right-corner": z.string().max(200).optional(),
    "bottom-left-corner": z.string().max(200).optional(),
    "bottom-left": z.string().max(200).optional(),
    "bottom-center": z.string().max(200).optional(),
    "bottom-right": z.string().max(200).optional(),
    "bottom-right-corner": z.string().max(200).optional(),
  })
  .strict();

export const pageMasterOverridesSchema = z
  .object({
    pageWidthMm: z.number().positive().optional(),
    pageHeightMm: z.number().positive().optional(),
    marginTopMm: z.number().min(0).optional(),
    marginBottomMm: z.number().min(0).optional(),
    marginInnerMm: z.number().min(0).optional(),
    marginOuterMm: z.number().min(0).optional(),
    gutterMm: z.number().min(0).optional(),
    headerDistanceMm: z.number().min(0).optional(),
    footerDistanceMm: z.number().min(0).optional(),
  })
  .strict();

export const editionDecorationSchema = z
  .object({
    folioPosition: z.enum(["bottomCenter", "bottomOuter", "topOuter"]).optional(),
    pageNumbering: z.enum(["arabic", "roman-lower", "roman-upper"]).optional(),
    marginBoxes: decorationMarginBoxesSchema.optional(),
    pageMasters: z.record(z.string(), pageMasterOverridesSchema).optional(),
    sectionMasters: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type EditionDecoration = z.infer<typeof editionDecorationSchema>;

/** Lee la decoración guardada, ignorando datos antiguos o inválidos. */
export function decorationFromSettings(settings: unknown): EditionDecoration {
  if (!settings || typeof settings !== "object") {
    return {};
  }

  const parsed = editionDecorationSchema.safeParse(
    (settings as Record<string, unknown>).decoration,
  );

  return parsed.success ? parsed.data : {};
}

/** Aplica la decoración de la edición sobre la configuración de la plantilla. */
export function applyEditionDecoration(
  config: EditorialTemplateConfig,
  decoration: EditionDecoration,
): EditorialTemplateConfig {
  if (Object.keys(decoration).length === 0) {
    return config;
  }

  return {
    ...config,
    ...(decoration.folioPosition ? { folioPosition: decoration.folioPosition } : {}),
    ...(decoration.pageNumbering ? { pageNumbering: decoration.pageNumbering } : {}),
    ...(decoration.marginBoxes
      ? {
          marginBoxes: {
            ...config.marginBoxes,
            base: { ...config.marginBoxes?.base, ...decoration.marginBoxes },
          },
        }
      : {}),
    ...(decoration.pageMasters
      ? { pageMasters: { ...config.pageMasters, ...decoration.pageMasters } }
      : {}),
    ...(decoration.sectionMasters
      ? { sectionMasters: { ...config.sectionMasters, ...decoration.sectionMasters } }
      : {}),
  };
}

import { z } from "zod";

/**
 * Configuración tipográfica de una maqueta.
 *
 * Describe cómo se compone cada clase de bloque del manuscrito: cuerpo,
 * títulos, cita, etc. Se guarda en `layout_profiles.typographyConfig` y en
 * `editorial_templates.config`.
 */

export type TextAlignment = "left" | "right" | "center" | "justify";

export type FontFamilyId = "serif" | "sans-serif" | "monospace";

export const FONT_FAMILY_LABELS: Record<FontFamilyId, string> = {
  serif: "Serif (libro)",
  "sans-serif": "Palo seco",
  monospace: "Monoespaciada",
};

export const typographyStyleSchema = z
  .object({
    fontFamily: z.enum(["serif", "sans-serif", "monospace"]).default("serif"),
    fontSizePt: z.number().min(4).max(72).default(11),
    lineHeight: z.number().min(0.9).max(3).default(1.5),
    spaceBeforePt: z.number().min(0).max(200).default(0),
    spaceAfterPt: z.number().min(0).max(200).default(0),
    alignment: z.enum(["left", "right", "center", "justify"]).default("justify"),
    firstLineIndentMm: z.number().min(0).max(50).default(0),
    letterSpacingPt: z.number().min(-2).max(10).default(0),
    uppercase: z.boolean().default(false),
    smallCaps: z.boolean().default(false),
    hyphenation: z.boolean().default(false),
    /** El bloque no debe quedar separado del bloque siguiente. */
    keepWithNext: z.boolean().default(false),
  })
  .strict();

export type TypographyStyle = z.infer<typeof typographyStyleSchema>;

export const widowOrphanSchema = z
  .object({
    /** Líneas mínimas de un párrafo que deben quedar al pie de una página. */
    minLinesAtBottom: z.number().int().min(0).max(10).default(2),
    /** Líneas mínimas de un párrafo que deben quedar al principio de una página. */
    minLinesAtTop: z.number().int().min(0).max(10).default(2),
  })
  .strict();

export type WidowOrphanSettings = z.infer<typeof widowOrphanSchema>;

export const typographyConfigSchema = z
  .object({
    body: typographyStyleSchema,
    heading1: typographyStyleSchema,
    heading2: typographyStyleSchema,
    heading3: typographyStyleSchema,
    heading4: typographyStyleSchema,
    blockquote: typographyStyleSchema,
    code: typographyStyleSchema,
    list: typographyStyleSchema,
    /** Estilo de la primera página de cada capítulo. */
    firstParagraph: typographyStyleSchema,
    widowOrphan: widowOrphanSchema,
    /** Primera línea de un capítulo sin sangría. */
    firstParagraphNoIndent: z.boolean().default(true),
    /** Sangría de la primera línea del cuerpo del texto. */
    bodyFirstLineIndentMm: z.number().min(0).max(50).default(5),
  })
  .strict();

export type TypographyConfig = z.infer<typeof typographyConfigSchema>;

/** Estilo de cuerpo: serif de 11 pt, interlineado 1,5 y justificado. */
export const DEFAULT_TYPOGRAPHY_STYLE: TypographyStyle = {
  fontFamily: "serif",
  fontSizePt: 11,
  lineHeight: 1.5,
  spaceBeforePt: 0,
  spaceAfterPt: 0,
  alignment: "justify",
  firstLineIndentMm: 0,
  letterSpacingPt: 0,
  uppercase: false,
  smallCaps: false,
  hyphenation: false,
  keepWithNext: false,
};

export const DEFAULT_TYPOGRAPHY_CONFIG: TypographyConfig = {
  body: DEFAULT_TYPOGRAPHY_STYLE,
  heading1: {
    ...DEFAULT_TYPOGRAPHY_STYLE,
    fontSizePt: 20,
    lineHeight: 1.2,
    spaceBeforePt: 0,
    spaceAfterPt: 18,
    alignment: "left",
    keepWithNext: true,
  },
  heading2: {
    ...DEFAULT_TYPOGRAPHY_STYLE,
    fontSizePt: 15,
    lineHeight: 1.25,
    spaceBeforePt: 18,
    spaceAfterPt: 10,
    alignment: "left",
    keepWithNext: true,
  },
  heading3: {
    ...DEFAULT_TYPOGRAPHY_STYLE,
    fontSizePt: 12.5,
    lineHeight: 1.3,
    spaceBeforePt: 14,
    spaceAfterPt: 6,
    alignment: "left",
    keepWithNext: true,
  },
  heading4: {
    ...DEFAULT_TYPOGRAPHY_STYLE,
    fontSizePt: 11,
    lineHeight: 1.35,
    spaceBeforePt: 12,
    spaceAfterPt: 4,
    alignment: "left",
    uppercase: true,
    keepWithNext: true,
  },
  blockquote: {
    ...DEFAULT_TYPOGRAPHY_STYLE,
    fontSizePt: 10.5,
    lineHeight: 1.45,
    spaceBeforePt: 8,
    spaceAfterPt: 8,
    alignment: "left",
    firstLineIndentMm: 0,
  },
  code: {
    ...DEFAULT_TYPOGRAPHY_STYLE,
    fontFamily: "monospace",
    fontSizePt: 9.5,
    lineHeight: 1.4,
    spaceBeforePt: 8,
    spaceAfterPt: 8,
    alignment: "left",
    hyphenation: false,
  },
  list: {
    ...DEFAULT_TYPOGRAPHY_STYLE,
    lineHeight: 1.45,
    spaceBeforePt: 0,
    spaceAfterPt: 0,
    alignment: "left",
  },
  firstParagraph: {
    ...DEFAULT_TYPOGRAPHY_STYLE,
    alignment: "justify",
  },
  widowOrphan: {
    minLinesAtBottom: 2,
    minLinesAtTop: 2,
  },
  firstParagraphNoIndent: true,
  bodyFirstLineIndentMm: 5,
};

/**
 * Completa una configuración guardada con los valores por defecto.
 *
 * Las plantillas de sistema y los perfiles antiguos pueden no tener todos los
 * campos: se completan en lugar de rechazarlos, para que una plantilla
 * escrita antes de una versión nueva siga funcionando.
 */
export function withTypographyDefaults(value: unknown): TypographyConfig {
  const parsed = typographyConfigSchema.safeParse(value);

  if (parsed.success) {
    return parsed.data;
  }

  const partial = (value ?? {}) as Record<string, unknown>;
  const style = (key: string): TypographyStyle => {
    const result = typographyStyleSchema.safeParse(partial[key]);

    return result.success
      ? result.data
      : { ...DEFAULT_TYPOGRAPHY_STYLE, ...(partial[key] as object) };
  };

  const widowOrphan = widowOrphanSchema.safeParse(partial.widowOrphan);

  return {
    body: style("body"),
    heading1: style("heading1"),
    heading2: style("heading2"),
    heading3: style("heading3"),
    heading4: style("heading4"),
    blockquote: style("blockquote"),
    code: style("code"),
    list: style("list"),
    firstParagraph: style("firstParagraph"),
    widowOrphan: widowOrphan.success ? widowOrphan.data : DEFAULT_TYPOGRAPHY_CONFIG.widowOrphan,
    firstParagraphNoIndent:
      typeof partial.firstParagraphNoIndent === "boolean"
        ? partial.firstParagraphNoIndent
        : DEFAULT_TYPOGRAPHY_CONFIG.firstParagraphNoIndent,
    bodyFirstLineIndentMm:
      typeof partial.bodyFirstLineIndentMm === "number"
        ? partial.bodyFirstLineIndentMm
        : DEFAULT_TYPOGRAPHY_CONFIG.bodyFirstLineIndentMm,
  };
}

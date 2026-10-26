import {
  DEFAULT_TYPOGRAPHY_CONFIG,
  PAGE_FORMAT_PRESETS,
  typographyConfigSchema,
  type PageFormatId,
  type TypographyConfig,
} from "@escribiendo/editorial-engine";
import { z } from "zod";

/**
 * Plantillas editoriales.
 *
 * Una plantilla es una configuración de estilos que se puede aplicar a una
 * edición: cuerpo, títulos, cita, treatment de la primera página y control
 * de viudas y huérfanas. Las plantillas de sistema son las mismas para todos
 * los espacios de trabajo; cada espacio puede tener las suyas.
 */

const marginBoxesSchema = z
  .object({
    "top-left": z.string().max(200).optional(),
    "top-center": z.string().max(200).optional(),
    "top-right": z.string().max(200).optional(),
    "bottom-left": z.string().max(200).optional(),
    "bottom-center": z.string().max(200).optional(),
    "bottom-right": z.string().max(200).optional(),
  })
  .strict();

const pageDecorationLayersSchema = z
  .object({
    base: marginBoxesSchema.optional(),
    verso: marginBoxesSchema.optional(),
    recto: marginBoxesSchema.optional(),
    first: marginBoxesSchema.optional(),
    blank: marginBoxesSchema.optional(),
  })
  .strict();

export const editorialTemplateConfigSchema = z
  .object({
    typography: typographyConfigSchema,
    /** Encabezado de página par (verso) e impar (recto). */
    runningHead: z
      .object({
        verso: z.string().max(200).default(""),
        recto: z.string().max(200).default(""),
      })
      .strict(),
    /** Posición del folio dentro de la página. */
    folioPosition: z.enum(["bottomCenter", "bottomOuter", "topOuter"]).default("bottomCenter"),
    /** Estilo de numeración de los folios. */
    pageNumbering: z.enum(["arabic", "roman-lower", "roman-upper"]).default("arabic"),
    /**
     * Cajas de margen por capas. Si se define, sustituye a la cabecera y al
     * folio derivados de `runningHead`/`folioPosition`.
     */
    marginBoxes: pageDecorationLayersSchema.optional(),
    /** Los capítulos empiezan en página par. */
    chapterStartsRecto: z.boolean().default(true),
    /** Se imprimen los folios. */
    showPageNumbers: z.boolean().default(true),
    /** Primera línea del cuerpo con sangría. */
    firstLineIndentMm: z.number().min(0).max(50).default(5),
    /** La primera línea de cada sección va sin sangría. */
    firstParagraphNoIndent: z.boolean().default(true),
  })
  .strict();

export type EditorialTemplateConfig = z.infer<typeof editorialTemplateConfigSchema>;

/**
 * Geometría predeterminada de una plantilla.
 *
 * La plantilla es la única elección de la maquetación: además del estilo,
 * lleva la página, los márgenes y las opciones de composición. La aplicación
 * deriva de aquí el perfil que usan la vista previa y la exportación.
 */
export interface TemplatePagePreset {
  format: PageFormatId;
  pageWidthMm: number;
  pageHeightMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginInnerMm: number;
  marginOuterMm: number;
  gutterMm: number;
  bleedMm: number;
  headerDistanceMm: number;
  footerDistanceMm: number;
  mirrorMargins: boolean;
  showPageNumbers: boolean;
  chapterStartsRecto: boolean;
}

const A5 = PAGE_FORMAT_PRESETS.A5;
const A4 = PAGE_FORMAT_PRESETS.A4;
const B5 = PAGE_FORMAT_PRESETS.B5;

/** Geometría neutra para plantillas propias sin preset de sistema. */
export const DEFAULT_TEMPLATE_PAGE_PRESET: TemplatePagePreset = {
  format: "A5",
  pageWidthMm: A5.widthMm,
  pageHeightMm: A5.heightMm,
  marginTopMm: 20,
  marginBottomMm: 20,
  marginInnerMm: 18,
  marginOuterMm: 18,
  gutterMm: 0,
  bleedMm: 0,
  headerDistanceMm: 10,
  footerDistanceMm: 10,
  mirrorMargins: true,
  showPageNumbers: true,
  chapterStartsRecto: true,
};

export interface SystemTemplate {
  slug: string;
  name: string;
  description: string;
  config: EditorialTemplateConfig;
  page: TemplatePagePreset;
}

const NOVELA: EditorialTemplateConfig = {
  typography: {
    ...DEFAULT_TYPOGRAPHY_CONFIG,
    body: {
      ...DEFAULT_TYPOGRAPHY_CONFIG.body,
      fontFamily: "serif",
      fontSizePt: 11,
      lineHeight: 1.5,
      alignment: "justify",
      firstLineIndentMm: 0,
    },
    heading1: {
      ...DEFAULT_TYPOGRAPHY_CONFIG.heading1,
      fontSizePt: 20,
      spaceAfterPt: 24,
      alignment: "center",
    },
    heading2: {
      ...DEFAULT_TYPOGRAPHY_CONFIG.heading2,
      fontSizePt: 14,
      spaceBeforePt: 24,
      spaceAfterPt: 12,
    },
    widowOrphan: { minLinesAtBottom: 2, minLinesAtTop: 2 },
    firstParagraphNoIndent: true,
    bodyFirstLineIndentMm: 5,
  },
  runningHead: { verso: "", recto: "" },
  folioPosition: "bottomCenter",
  pageNumbering: "arabic",
  chapterStartsRecto: true,
  showPageNumbers: true,
  firstLineIndentMm: 5,
  firstParagraphNoIndent: true,
};

const ENSAYO: EditorialTemplateConfig = {
  typography: {
    ...DEFAULT_TYPOGRAPHY_CONFIG,
    body: {
      ...DEFAULT_TYPOGRAPHY_CONFIG.body,
      fontFamily: "serif",
      fontSizePt: 11.5,
      lineHeight: 1.6,
      alignment: "justify",
    },
    heading1: {
      ...DEFAULT_TYPOGRAPHY_CONFIG.heading1,
      fontSizePt: 18,
      alignment: "left",
      spaceAfterPt: 18,
    },
    heading2: {
      ...DEFAULT_TYPOGRAPHY_CONFIG.heading2,
      fontSizePt: 13.5,
      alignment: "left",
      spaceBeforePt: 20,
    },
    widowOrphan: { minLinesAtBottom: 3, minLinesAtTop: 3 },
    firstParagraphNoIndent: true,
    bodyFirstLineIndentMm: 0,
  },
  runningHead: { verso: "", recto: "" },
  folioPosition: "bottomCenter",
  pageNumbering: "arabic",
  chapterStartsRecto: true,
  showPageNumbers: true,
  firstLineIndentMm: 0,
  firstParagraphNoIndent: true,
};

const POESIA: EditorialTemplateConfig = {
  typography: {
    ...DEFAULT_TYPOGRAPHY_CONFIG,
    body: {
      ...DEFAULT_TYPOGRAPHY_CONFIG.body,
      fontFamily: "serif",
      fontSizePt: 12,
      lineHeight: 1.4,
      alignment: "left",
      hyphenation: false,
    },
    heading1: {
      ...DEFAULT_TYPOGRAPHY_CONFIG.heading1,
      fontSizePt: 14,
      alignment: "left",
      spaceAfterPt: 24,
    },
    heading2: {
      ...DEFAULT_TYPOGRAPHY_CONFIG.heading2,
      fontSizePt: 12,
      alignment: "left",
      spaceBeforePt: 18,
    },
    widowOrphan: { minLinesAtBottom: 2, minLinesAtTop: 2 },
    firstParagraphNoIndent: true,
    bodyFirstLineIndentMm: 0,
  },
  runningHead: { verso: "", recto: "" },
  folioPosition: "bottomCenter",
  pageNumbering: "arabic",
  chapterStartsRecto: true,
  showPageNumbers: true,
  firstLineIndentMm: 0,
  firstParagraphNoIndent: true,
};

const MANUAL: EditorialTemplateConfig = {
  typography: {
    ...DEFAULT_TYPOGRAPHY_CONFIG,
    body: {
      ...DEFAULT_TYPOGRAPHY_CONFIG.body,
      fontFamily: "sans-serif",
      fontSizePt: 10,
      lineHeight: 1.45,
      alignment: "left",
    },
    heading1: {
      ...DEFAULT_TYPOGRAPHY_CONFIG.heading1,
      fontFamily: "sans-serif",
      fontSizePt: 16,
      alignment: "left",
      spaceAfterPt: 12,
    },
    heading2: {
      ...DEFAULT_TYPOGRAPHY_CONFIG.heading2,
      fontFamily: "sans-serif",
      fontSizePt: 12.5,
      alignment: "left",
      spaceBeforePt: 14,
    },
    code: {
      ...DEFAULT_TYPOGRAPHY_CONFIG.code,
      fontSizePt: 9,
      lineHeight: 1.4,
    },
    widowOrphan: { minLinesAtBottom: 2, minLinesAtTop: 2 },
    firstParagraphNoIndent: true,
    bodyFirstLineIndentMm: 0,
  },
  runningHead: { verso: "", recto: "" },
  folioPosition: "bottomOuter",
  pageNumbering: "arabic",
  chapterStartsRecto: true,
  showPageNumbers: true,
  firstLineIndentMm: 0,
  firstParagraphNoIndent: true,
};

const NOVELA_PAGE: TemplatePagePreset = {
  format: "A5",
  pageWidthMm: A5.widthMm,
  pageHeightMm: A5.heightMm,
  marginTopMm: 20,
  marginBottomMm: 20,
  marginInnerMm: 18,
  marginOuterMm: 14,
  gutterMm: 0,
  bleedMm: 0,
  headerDistanceMm: 10,
  footerDistanceMm: 10,
  mirrorMargins: true,
  showPageNumbers: true,
  chapterStartsRecto: true,
};

const ENSAYO_PAGE: TemplatePagePreset = {
  format: "A5",
  pageWidthMm: A5.widthMm,
  pageHeightMm: A5.heightMm,
  marginTopMm: 22,
  marginBottomMm: 22,
  marginInnerMm: 20,
  marginOuterMm: 18,
  gutterMm: 0,
  bleedMm: 0,
  headerDistanceMm: 10,
  footerDistanceMm: 10,
  mirrorMargins: true,
  showPageNumbers: true,
  chapterStartsRecto: true,
};

const POESIA_PAGE: TemplatePagePreset = {
  format: "B5",
  pageWidthMm: B5.widthMm,
  pageHeightMm: B5.heightMm,
  marginTopMm: 24,
  marginBottomMm: 24,
  marginInnerMm: 22,
  marginOuterMm: 20,
  gutterMm: 0,
  bleedMm: 0,
  headerDistanceMm: 10,
  footerDistanceMm: 10,
  mirrorMargins: true,
  showPageNumbers: true,
  chapterStartsRecto: true,
};

const MANUAL_PAGE: TemplatePagePreset = {
  format: "A4",
  pageWidthMm: A4.widthMm,
  pageHeightMm: A4.heightMm,
  marginTopMm: 25,
  marginBottomMm: 25,
  marginInnerMm: 22,
  marginOuterMm: 20,
  gutterMm: 0,
  // Un manual puede llevar figuras a sangre; el sangrado queda previsto.
  bleedMm: 3,
  headerDistanceMm: 12,
  footerDistanceMm: 12,
  mirrorMargins: false,
  showPageNumbers: true,
  chapterStartsRecto: false,
};

/**
 * Plantillas de sistema.
 *
 * Son un catálogo cerrado y versionado con el código: se pueden instalar en
 * la base de datos, pero no editar. Para adaptar una al gusto de un estudio
 * se crea una plantilla propia a partir de ella.
 */
export const SYSTEM_TEMPLATES: readonly SystemTemplate[] = [
  {
    slug: "novela",
    name: "Novela",
    description:
      "Cuerpo de 11 pt con interlineado amplio, sangría de primera línea y capítulos en página par.",
    config: NOVELA,
    page: NOVELA_PAGE,
  },
  {
    slug: "ensayo",
    name: "Ensayo",
    description: "Sin sangría, interlineado generoso y control de viudas y huérfanas más exigente.",
    config: ENSAYO,
    page: ENSAYO_PAGE,
  },
  {
    slug: "poesia",
    name: "Poesía",
    description: "Verso sin justificar, sin guionado y con títulos discretos.",
    config: POESIA,
    page: POESIA_PAGE,
  },
  {
    slug: "manual",
    name: "Manual",
    description: "Palo seco, texto alineado a la izquierda y folios en el margen exterior.",
    config: MANUAL,
    page: MANUAL_PAGE,
  },
];

/** Plantilla de sistema por su identificador. */
export function getSystemTemplate(slug: string): SystemTemplate | undefined {
  return SYSTEM_TEMPLATES.find((template) => template.slug === slug);
}

/**
 * Geometría que acompaña a una plantilla.
 *
 * Las plantillas de sistema traen su propia página. Las propias, que no
 * tienen un preset asociado en el código, reciben una geometría neutra.
 */
export function templatePagePreset(slug: string, isSystem = true): TemplatePagePreset {
  if (!isSystem) {
    return DEFAULT_TEMPLATE_PAGE_PRESET;
  }

  return getSystemTemplate(slug)?.page ?? DEFAULT_TEMPLATE_PAGE_PRESET;
}

/**
 * Completa una configuración guardada con los valores por defecto.
 *
 * Las plantillas de sistema y las propias pueden venir de versiones
 * anteriores del motor, con campos que ya no existen o que faltan.
 */
export function withTemplateDefaults(value: unknown): EditorialTemplateConfig {
  const parsed = editorialTemplateConfigSchema.safeParse(value);

  if (parsed.success) {
    return parsed.data;
  }

  const partial = (value ?? {}) as Record<string, unknown>;
  const typography = typographyConfigSchema.safeParse(partial.typography);
  const runningHead = z
    .object({
      verso: z.string().max(200).default(""),
      recto: z.string().max(200).default(""),
    })
    .strict()
    .safeParse(partial.runningHead);
  const marginBoxes = pageDecorationLayersSchema.safeParse(partial.marginBoxes);

  return {
    typography: typography.success ? typography.data : DEFAULT_TYPOGRAPHY_CONFIG,
    runningHead: runningHead.success ? runningHead.data : { verso: "", recto: "" },
    folioPosition:
      partial.folioPosition === "bottomOuter" || partial.folioPosition === "topOuter"
        ? partial.folioPosition
        : "bottomCenter",
    pageNumbering:
      partial.pageNumbering === "roman-lower" || partial.pageNumbering === "roman-upper"
        ? partial.pageNumbering
        : "arabic",
    ...(marginBoxes.success ? { marginBoxes: marginBoxes.data } : {}),
    chapterStartsRecto:
      typeof partial.chapterStartsRecto === "boolean" ? partial.chapterStartsRecto : true,
    showPageNumbers: typeof partial.showPageNumbers === "boolean" ? partial.showPageNumbers : true,
    firstLineIndentMm:
      typeof partial.firstLineIndentMm === "number" ? partial.firstLineIndentMm : 0,
    firstParagraphNoIndent:
      typeof partial.firstParagraphNoIndent === "boolean" ? partial.firstParagraphNoIndent : true,
  };
}

/** Configuración tipográfica de una plantilla, con los valores por defecto. */
export function templateTypography(config: unknown): TypographyConfig {
  return withTemplateDefaults(config).typography;
}

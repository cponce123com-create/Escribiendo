import {
  DEFAULT_TYPOGRAPHY_CONFIG,
  typographyConfigSchema,
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

export interface SystemTemplate {
  slug: string;
  name: string;
  description: string;
  config: EditorialTemplateConfig;
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
  chapterStartsRecto: false,
  showPageNumbers: true,
  firstLineIndentMm: 0,
  firstParagraphNoIndent: true,
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
  },
  {
    slug: "ensayo",
    name: "Ensayo",
    description: "Sin sangría, interlineado generoso y control de viudas y huérfanas más exigente.",
    config: ENSAYO,
  },
  {
    slug: "poesia",
    name: "Poesía",
    description: "Verso sin justificar, sin guionado y con títulos discretos.",
    config: POESIA,
  },
  {
    slug: "manual",
    name: "Manual",
    description: "Palo seco, texto alineado a la izquierda y folios en el margen exterior.",
    config: MANUAL,
  },
];

/** Plantilla de sistema por su identificador. */
export function getSystemTemplate(slug: string): SystemTemplate | undefined {
  return SYSTEM_TEMPLATES.find((template) => template.slug === slug);
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

  return {
    typography: typography.success ? typography.data : DEFAULT_TYPOGRAPHY_CONFIG,
    runningHead: runningHead.success ? runningHead.data : { verso: "", recto: "" },
    folioPosition:
      partial.folioPosition === "bottomOuter" || partial.folioPosition === "topOuter"
        ? partial.folioPosition
        : "bottomCenter",
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

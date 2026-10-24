import type {
  EditorialImage,
  InlineRun,
  LayoutBlock,
  LayoutBlockKind,
  LayoutDiagnostic,
  TextAlignment,
} from "@escribiendo/editorial-engine";
import {
  tocParametersFrom,
  type TocParameters,
  type LegalPageBlock,
  type LegalPageResult,
  type MatterBlock,
  type MatterPage,
  type TocEntry,
} from "@escribiendo/templates";

/**
 * Composición de materias editoriales en bloques de maquetación.
 *
 * Los generadores de `@escribiendo/templates` devuelven bloques neutros con un
 * papel editorial (`title`, `small`, `rule`...). El motor de paginación no
 * conoce esos papeles: trabaja con clases tipográficas. Esta traducción es la
 * única frontera entre ambos mundos y la comparten la vista previa y el PDF,
 * de modo que la materia impresa y la de pantalla no pueden divergir.
 *
 * Dos reglas deliberadas:
 *
 * - Los `spacer` se acumulan como espacio anterior del siguiente bloque
 *   (`spaceBeforePt`). Nunca se convierten en líneas vacías: eso inventaría
 *   renglones que después aparecerían en el archivo.
 * - Los `logo` se emiten como imagen cuando el llamador aporta un resolvedor
 *   (`resolveImage`); si no, se avisa por `diagnostics` en lugar de descartarlos
 *   en silencio.
 */

/** Papeles que pueden llegar desde una materia o desde la página legal. */
type MatterRole = MatterBlock["role"] | LegalPageBlock["role"];

interface RoleBlock {
  role: MatterRole;
  text: string;
  spaceMm?: number;
  spaceFraction?: number;
}

export interface MatterBlockOptions {
  /** Identificador estable de la materia; los bloques derivan su id de aquí. */
  id: string;
  /** Título de la sección, para los encabezados de página. */
  sectionTitle?: string;
  /** La materia abre página nueva. */
  pageBreakBefore?: boolean;
  /** El encabezado de la materia abre capítulo y puede forzar página par. */
  startsChapter?: boolean;
  /**
   * Altura útil de la página, para resolver los espaciadores expresados como
   * fracción. Por defecto, 200 mm (un formato de libro habitual).
   */
  contentHeightMm?: number;
  /** Resuelve la URL de un logotipo a una imagen con sus dimensiones. */
  resolveImage?: (src: string) => EditorialImage | null;
  /** Recoge los avisos de composición (por ejemplo, un logo no resuelto). */
  diagnostics?: LayoutDiagnostic[];
}

interface RoleStyle {
  kind: LayoutBlockKind;
  alignment?: TextAlignment;
  italic?: boolean;
}

/** Traduce un papel editorial a clase tipográfica. */
function styleForRole(role: MatterRole): RoleStyle | null {
  switch (role) {
    case "title":
      return { kind: "title", alignment: "center" };
    case "subtitle":
      return { kind: "heading2", alignment: "center" };
    case "author":
    case "publisher":
    case "imprint":
      return { kind: "body", alignment: "center" };
    case "body":
    case "small":
      return { kind: "body", alignment: "left" };
    case "center":
      return { kind: "body", alignment: "center" };
    case "right":
      return { kind: "body", alignment: "right" };
    case "italic":
      return { kind: "body", alignment: "left", italic: true };
    case "rule":
      return { kind: "rule" };
    case "logo":
    case "spacer":
      return null;
  }
}

function normalizedText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

/** Milímetros a puntos tipográficos (1 pt = 25,4/72 mm). */
function mmToPoints(mm: number): number {
  return (mm * 72) / 25.4;
}

/**
 * Convierte una lista de bloques con papel editorial en bloques del motor.
 *
 * El orden se conserva. El primer bloque emitido marca el inicio de la sección
 * y, si la materia lo pide, el salto de página; los papeles descartados no
 * consumen esa marca.
 */
export function roleBlocksToBlocks(
  blocks: readonly RoleBlock[],
  options: MatterBlockOptions,
): LayoutBlock[] {
  const result: LayoutBlock[] = [];
  let index = 0;

  const registration = (): Pick<LayoutBlock, "sectionId" | "sectionTitle"> => ({
    sectionId: options.id,
    ...(options.sectionTitle ? { sectionTitle: options.sectionTitle } : {}),
  });

  const push = (kind: LayoutBlockKind, text: string, style: RoleStyle, spaceBeforePt = 0): void => {
    const runs: InlineRun[] | undefined = style.italic
      ? [{ text, marks: { italic: true } }]
      : undefined;

    result.push({
      id: `${options.id}-${index}`,
      kind,
      text,
      ...(runs ? { runs } : {}),
      ...registration(),
      ...(style.alignment ? { alignment: style.alignment } : {}),
      ...(spaceBeforePt > 0 ? { styleOverride: { spaceBeforePt } } : {}),
      firstOfSection: index === 0,
      ...(index === 0 && options.pageBreakBefore === true ? { breaksBefore: true } : {}),
      ...(index === 0 && options.startsChapter === true ? { startsChapter: true } : {}),
    });

    index += 1;
  };

  const contentHeightMm = options.contentHeightMm ?? 200;
  let pendingSpaceMm = 0;

  for (const block of blocks) {
    if (block.role === "spacer") {
      pendingSpaceMm += (block.spaceMm ?? 0) + (block.spaceFraction ?? 0) * contentHeightMm;
      continue;
    }

    if (block.role === "logo") {
      const src = normalizedText(block.text);
      const image = src.length > 0 && options.resolveImage ? options.resolveImage(src) : null;

      if (image) {
        const spaceBeforePt = mmToPoints(pendingSpaceMm);
        result.push({
          id: `${options.id}-${index}`,
          kind: "image",
          text: "",
          image,
          ...registration(),
          ...(spaceBeforePt > 0 ? { styleOverride: { spaceBeforePt } } : {}),
          firstOfSection: index === 0,
          ...(index === 0 && options.pageBreakBefore === true ? { breaksBefore: true } : {}),
          ...(index === 0 && options.startsChapter === true ? { startsChapter: true } : {}),
        });
        pendingSpaceMm = 0;
        index += 1;
        continue;
      }

      // El espacio pendiente se conserva: omitir el logo no debe mover el texto.
      options.diagnostics?.push({
        code: "MATTER_LOGO_OMITIDO",
        severity: "warning",
        message: "El logotipo de la materia no se ha podido resolver y se ha omitido.",
        sectionId: options.id,
      });
      continue;
    }

    const style = styleForRole(block.role);

    if (!style) {
      continue;
    }

    if (style.kind === "rule") {
      push("rule", "", style, mmToPoints(pendingSpaceMm));
      pendingSpaceMm = 0;
      continue;
    }

    const text = normalizedText(block.text);

    if (text.length === 0) {
      continue;
    }

    push(style.kind, text, style, mmToPoints(pendingSpaceMm));
    pendingSpaceMm = 0;
  }

  return result;
}

/**
 * Compone una materia breve (portadilla, dedicatoria, créditos, colofón...).
 *
 * Una materia marcada como no lista no se compone: sus avisos explican qué
 * falta y el editor debe verlos antes de exportar.
 */
export function matterPageToBlocks(page: MatterPage, options: MatterBlockOptions): LayoutBlock[] {
  if (!page.ready) {
    return [];
  }

  return roleBlocksToBlocks(page.blocks, options);
}

/** Compone la página legal y créditos de edición. */
export function legalPageToBlocks(
  page: LegalPageResult,
  options: MatterBlockOptions,
): LayoutBlock[] {
  if (!page.ready) {
    return [];
  }

  return roleBlocksToBlocks(page.blocks, options);
}

export interface TocBlockOptions extends MatterBlockOptions {
  parameters?: TocParameters;
  /** Título impreso del índice. Por defecto, «Índice». */
  heading?: string;
  /** Ancho de referencia en caracteres para el relleno de puntos. */
  widthChars?: number;
}

/**
 * Compone el índice a partir de entradas ya calculadas.
 *
 * No se inventa ninguna página: si una entrada no tiene etiqueta, la línea se
 * imprime sin número. La jerarquía se expresa con sangría de espacios em, que
 * se miden con la misma fuente que el resto del índice.
 */
export function tocToBlocks(entries: readonly TocEntry[], options: TocBlockOptions): LayoutBlock[] {
  const heading = normalizedText(options.heading ?? "") || "Índice";
  const blocks: LayoutBlock[] = [
    {
      id: `${options.id}-title`,
      kind: "chapterTitle",
      text: heading,
      sectionId: options.id,
      ...(options.sectionTitle ? { sectionTitle: options.sectionTitle } : {}),
      firstOfSection: true,
      ...(options.pageBreakBefore === true ? { breaksBefore: true } : {}),
      ...(options.startsChapter === true ? { startsChapter: true } : {}),
    },
  ];

  const parameters = options.parameters ?? tocParametersFrom({});
  let chapterNumber = 0;
  entries.forEach((entry, index) => {
    if (parameters.tocTemplate === "toc-compact" && entry.level > 2) return;
    const part = entry.level === 0 && parameters.tocTemplate === "toc-parts";
    if (
      entry.sectionType === "CHAPTER" ||
      (!entry.sectionType && entry.level === 1 && entry.group === "body")
    )
      chapterNumber++;
    const numbered =
      parameters.tocTemplate === "toc-numbered" &&
      (entry.sectionType === "CHAPTER" ||
        (!entry.sectionType && entry.level === 1 && entry.group === "body"));
    const title = numbered ? `${chapterNumber}. ${entry.title}` : entry.title;
    const pageLabel = parameters.tocPageNumbers ? entry.label : null;
    const indent = "\u2003".repeat(
      parameters.tocTemplate !== "toc-minimal"
        ? Math.max(0, entry.level - (parameters.tocTemplate === "toc-parts" ? 0 : 1))
        : 0,
    );

    blocks.push({
      id: `${options.id}-${index + 1}`,
      kind:
        part || (parameters.tocTemplate === "toc-detailed" && entry.level === 1)
          ? "heading2"
          : "body",
      // El texto es solo el título: el folio y los líderes se componen como
      // geometría en el motor. `widthChars` queda como compatibilidad de API.
      text: `${indent}${title}`,
      alignment: part ? "left" : parameters.tocAlignment,
      ...(pageLabel
        ? {
            tocEntry: {
              title: `${indent}${title}`,
              label: pageLabel,
              leaders: parameters.tocLeaders,
              sourceId: entry.sourceId,
              level: entry.level,
            },
          }
        : {}),
      styleOverride: {
        firstLineIndentMm: indent.length * 4,
        ...(parameters.tocTemplate === "toc-compact"
          ? { fontSizePt: 9, lineHeight: 1.1, spaceAfterPt: 1 }
          : {}),
      },
      sectionId: options.id,
      ...(options.sectionTitle ? { sectionTitle: options.sectionTitle } : {}),
    });
  });

  return blocks;
}

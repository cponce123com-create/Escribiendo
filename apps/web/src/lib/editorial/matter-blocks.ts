import type {
  InlineRun,
  LayoutBlock,
  LayoutBlockKind,
  TextAlignment,
} from "@escribiendo/editorial-engine";
import {
  formatTocLine,
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
 * Dos límites deliberados:
 *
 * - Los `spacer` se descartan. El motor compone por altura y todavía no admite
 *   espacio vertical inicial; convertirlos en líneas vacías inventaría renglones
 *   que después aparecerían en el archivo.
 * - Los `logo` se descartan. Son URLs, no imágenes resueltas: incrustarlas
 *   exige el mapa de imágenes de la exportación, que no existe en la vista
 *   previa. La materia se compone sin el logotipo antes que con un hueco falso.
 */

/** Papeles que pueden llegar desde una materia o desde la página legal. */
type MatterRole = MatterBlock["role"] | LegalPageBlock["role"];

interface RoleBlock {
  role: MatterRole;
  text: string;
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

  const push = (kind: LayoutBlockKind, text: string, style: RoleStyle): void => {
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
      firstOfSection: index === 0,
      ...(index === 0 && options.pageBreakBefore === true ? { breaksBefore: true } : {}),
      ...(index === 0 && options.startsChapter === true ? { startsChapter: true } : {}),
    });

    index += 1;
  };

  for (const block of blocks) {
    const style = styleForRole(block.role);

    if (!style) {
      continue;
    }

    if (style.kind === "rule") {
      push("rule", "", style);
      continue;
    }

    const text = normalizedText(block.text);

    if (text.length === 0) {
      continue;
    }

    push(style.kind, text, style);
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
  const widthChars = options.widthChars ?? 60;
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

  entries.forEach((entry, index) => {
    const line = formatTocLine(entry, widthChars);
    const indent = "\u2003".repeat(Math.max(0, entry.level - 1));
    const dots = line.label ? ` ${".".repeat(line.leaderDots)} ` : "";
    const text = `${indent}${line.title}${dots}${line.label ?? ""}`.trimEnd();

    blocks.push({
      id: `${options.id}-${index + 1}`,
      kind: "body",
      text,
      alignment: "left",
      sectionId: options.id,
      ...(options.sectionTitle ? { sectionTitle: options.sectionTitle } : {}),
    });
  });

  return blocks;
}

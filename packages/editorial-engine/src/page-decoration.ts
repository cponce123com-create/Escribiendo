/**
 * Decoración de página: cajas de margen y numeración de folios.
 *
 * Es el subconjunto de CSS Paged Media que necesita una novela: seis cajas de
 * margen (esquinas superiores e inferiores, izquierda, centro y derecha),
 * contenido por tokens y precedencia por página (base, lado, primera, blanca).
 *
 * La resolución es pura: recibe la configuración y el contexto de la página y
 * devuelve las cajas ya compuestas. Así la vista previa y el PDF dibujan
 * exactamente lo mismo sin duplicar reglas.
 */

export const PAGE_MARGIN_BOX_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

export type PageMarginBoxPosition = (typeof PAGE_MARGIN_BOX_POSITIONS)[number];

export type MarginBoxAlign = "left" | "center" | "right";

export type PageNumberingStyle = "arabic" | "roman-lower" | "roman-upper";

/** Contenido de cada caja; una cadena vacía la desactiva. */
export type MarginBoxes = Partial<Record<PageMarginBoxPosition, string>>;

/**
 * Configuración por capas. El orden de aplicación es:
 * `base` → `verso`/`recto` → `first` → `blank`.
 * Una capa posterior sustituye caja a caja, no fusiona el texto.
 */
export interface PageDecorationConfig {
  base?: MarginBoxes;
  verso?: MarginBoxes;
  recto?: MarginBoxes;
  first?: MarginBoxes;
  blank?: MarginBoxes;
}

export interface PageDecorationContext {
  bookTitle: string;
  author: string;
  chapterTitle: string;
  sectionTitle: string;
  /** Folio ya formateado según el estilo de numeración de la página. */
  folioLabel: string;
  /** Total de páginas impresas, para `{paginas}`. */
  pageCount: number;
}

export interface ResolvedMarginBox {
  position: PageMarginBoxPosition;
  text: string;
  align: MarginBoxAlign;
}

const ALIGN: Record<PageMarginBoxPosition, MarginBoxAlign> = {
  "top-left": "left",
  "top-center": "center",
  "top-right": "right",
  "bottom-left": "left",
  "bottom-center": "center",
  "bottom-right": "right",
};

const ROMAN: ReadonlyArray<readonly [number, string]> = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

function toRoman(value: number): string {
  let remaining = Math.trunc(value);
  let text = "";

  for (const [amount, numeral] of ROMAN) {
    while (remaining >= amount) {
      text += numeral;
      remaining -= amount;
    }
  }

  return text;
}

/** Formatea un folio según el estilo de numeración de la página. */
export function formatPageNumber(value: number, style: PageNumberingStyle = "arabic"): string {
  if (style === "arabic" || value <= 0) {
    return String(value);
  }

  const roman = toRoman(value);
  return style === "roman-lower" ? roman.toLowerCase() : roman;
}

function replaceTokens(text: string, context: PageDecorationContext): string {
  return text
    .replaceAll("{libro}", context.bookTitle)
    .replaceAll("{autor}", context.author)
    .replaceAll("{capitulo}", context.chapterTitle)
    .replaceAll("{seccion}", context.sectionTitle)
    .replaceAll("{folio}", context.folioLabel)
    .replaceAll("{paginas}", String(context.pageCount));
}

export interface DecorationPageState {
  side: "recto" | "verso";
  /** Primera página del documento, como `@page :first`. */
  first: boolean;
  blank: boolean;
}

/**
 * Compone las cajas de una página.
 *
 * `{folio}` usa `folioLabel`, que la paginación ya ha formateado con el estilo
 * de numeración elegido (arábigo o romano).
 */
export function resolveMarginBoxes(
  config: PageDecorationConfig | null | undefined,
  context: PageDecorationContext,
  page: DecorationPageState,
): ResolvedMarginBox[] {
  const merged: MarginBoxes = { ...config?.base };

  Object.assign(merged, config?.[page.side]);

  if (page.first) {
    Object.assign(merged, config?.first);
  }

  if (page.blank) {
    Object.assign(merged, config?.blank);
  }

  return PAGE_MARGIN_BOX_POSITIONS.flatMap((position) => {
    const raw = merged[position];

    if (!raw) {
      return [];
    }

    const text = replaceTokens(raw, context).trim();

    return text ? [{ position, text, align: ALIGN[position] }] : [];
  });
}

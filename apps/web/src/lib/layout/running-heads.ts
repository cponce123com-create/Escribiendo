import {
  formatPageNumber,
  resolveMarginBoxes,
  type LaidOutPage,
  type MarginBoxes,
  type PageDecorationConfig,
  type PageMarginBoxPosition,
} from "@escribiendo/editorial-engine";
import type { EditorialTemplateConfig } from "@escribiendo/templates";

/** Plantilla de encabezados que se puede aplicar a una página compuesta. */
export type RunningHeadTemplate = Pick<EditorialTemplateConfig, "runningHead"> &
  Partial<
    Pick<
      EditorialTemplateConfig,
      | "folioPosition"
      | "showPageNumbers"
      | "pageNumbering"
      | "marginBoxes"
      | "pageMasters"
      | "sectionMasters"
    >
  >;

export interface PageDecorationOptions {
  bookTitle: string;
  author?: string;
  /** Total de páginas impresas, para el token `{paginas}`. */
  pageCount?: number;
  /** Sustituye a `template.showPageNumbers` cuando el perfil manda. */
  showPageNumbers?: boolean;
}

function chapterTitleOf(page: LaidOutPage): string {
  return page.blocks.find((block) => block.sectionTitle)?.sectionTitle ?? "";
}

function opensChapter(page: LaidOutPage): boolean {
  return (
    page.blocks[0]?.startsChapter === true ||
    page.blocks.some((block) => block.kind === "chapterTitle" && block.firstOfSection === true)
  );
}

function folioBoxFor(
  position: RunningHeadTemplate["folioPosition"] | undefined,
  side: LaidOutPage["side"],
): PageMarginBoxPosition {
  if (position === "bottomOuter") {
    return side === "recto" ? "bottom-right" : "bottom-left";
  }

  if (position === "topOuter") {
    return side === "recto" ? "top-right" : "top-left";
  }

  return "bottom-center";
}

/**
 * Cajas derivadas de la configuración histórica: cabecera centrada y folio en
 * la posición elegida. Es el comportamiento por defecto cuando la plantilla no
 * define `marginBoxes`.
 */
function derivedConfig(
  template: RunningHeadTemplate | null | undefined,
  page: LaidOutPage,
  showNumbers: boolean,
): PageDecorationConfig {
  const boxes: MarginBoxes = {};
  const head = template?.runningHead[page.side]?.trim();

  if (!page.blank && !opensChapter(page)) {
    boxes["top-center"] = head || "{capitulo}";
  }

  if (showNumbers) {
    boxes[folioBoxFor(template?.folioPosition, page.side)] = "{folio}";
  }

  return { base: boxes };
}

/**
 * Resuelve cabeceras y folios con el modelo de cajas de margen.
 *
 * Devuelve las páginas con `marginBoxes` (lo que dibujan la vista previa y el
 * PDF), `folioLabel` y `runningHead` —este último se conserva para los
 * consumidores que aún leen un único encabezado—.
 */
export function resolvePageDecorations(
  pages: readonly LaidOutPage[],
  template: RunningHeadTemplate | null | undefined,
  options: PageDecorationOptions,
): LaidOutPage[] {
  const pageCount = options.pageCount ?? pages.length;
  const showNumbers = options.showPageNumbers ?? template?.showPageNumbers ?? true;
  const numbering = template?.pageNumbering ?? "arabic";

  return pages.map((page, index) => {
    const chapterTitle = chapterTitleOf(page);
    const folioLabel = page.folioLabel ?? formatPageNumber(page.folio, numbering);
    const config = template?.marginBoxes ?? derivedConfig(template, page, showNumbers);

    const marginBoxes = resolveMarginBoxes(
      config,
      {
        bookTitle: options.bookTitle,
        author: options.author ?? "",
        chapterTitle,
        sectionTitle: chapterTitle,
        folioLabel,
        pageCount,
      },
      { side: page.side, first: index === 0, blank: page.blank },
    );

    return {
      ...page,
      folioLabel,
      marginBoxes,
      runningHead: marginBoxes.find((box) => box.position === "top-center")?.text ?? null,
    };
  });
}

/**
 * Resuelve el encabezado de cada página para la vista previa y el PDF.
 * Las páginas en blanco y las que abren capítulo quedan sin encabezado.
 */
export function resolveRunningHeads(
  pages: readonly LaidOutPage[],
  template: RunningHeadTemplate | null | undefined,
  bookTitle: string,
): LaidOutPage[] {
  return pages.map((page) => {
    if (page.blank || opensChapter(page)) {
      return { ...page, runningHead: null };
    }

    const chapterTitle = chapterTitleOf(page);
    const templateText = template?.runningHead[page.side] ?? "";
    const text = templateText.trim()
      ? templateText.replaceAll("{libro}", bookTitle).replaceAll("{capitulo}", chapterTitle).trim()
      : chapterTitle.trim();

    return { ...page, runningHead: text || null };
  });
}

import {
  paginate,
  type LayoutBlock,
  type LayoutDiagnostic,
  type LaidOutPage,
  type MeasureText,
  type PageGeometry,
  type PageMasterMap,
  type PaginationResult,
  type TypographyConfig,
} from "@escribiendo/editorial-engine";
import type { MatterLayout } from "@/lib/layout/blocks";
import {
  composeMatter,
  EMPTY_MATTER,
  pageFolioBySection,
  type BookMatter,
  type ComposedMatter,
} from "./book-matter";

/** Tope de pasadas para estabilizar el índice. */
export const MAX_TOC_PASSES = 5;

/** Folio anunciado por el índice que no coincide con la página real. */
export interface TocMismatch {
  sectionId: string;
  expected: string;
  actual: string;
}

/** Resultado de estabilizar el índice y cotejarlo con la composición final. */
export interface TocStability {
  converged: boolean;
  passes: number;
  maxPasses: number;
  mismatches: TocMismatch[];
}

export interface StabilizeCompositionInput {
  matter: BookMatter | null;
  geometry: PageGeometry;
  typography: TypographyConfig;
  measure?: MeasureText;
  /** Páginas maestras por nombre, para que el índice cuente las mismas páginas. */
  masters?: PageMasterMap;
  /**
   * Folios de las referencias cruzadas. El mapa se actualiza en cada pasada y
   * la composición continúa hasta que deja de moverse.
   */
  references?: {
    pageMap: Map<string, number>;
    titles: Map<string, string | null>;
  };
  compose: (front: readonly MatterLayout[], back: readonly MatterLayout[]) => LayoutBlock[];
  maxPasses?: number;
}

export interface StabilizedComposition {
  composedMatter: ComposedMatter;
  composition: PaginationResult;
  stability: TocStability;
}

/**
 * Error de exportación: el índice no es fiable y publicar el archivo dejaría
 * folios incorrectos impresos en papel.
 */
export class TocNotConvergedError extends Error {
  constructor(readonly stability: TocStability) {
    super(describeTocFailure(stability));
    this.name = "TocNotConvergedError";
  }
}

/** Detiene la exportación cuando el índice no es fiable. */
export function assertTocReliable(stability: TocStability): void {
  if (!stability.converged || stability.mismatches.length > 0) {
    throw new TocNotConvergedError(stability);
  }
}

function digits(value: string): string {
  return value.replace(/\D/gu, "");
}

/** Coteja cada folio anunciado con la página en la que empieza su sección. */
export function tocMismatches(
  composed: ComposedMatter,
  pages: readonly LaidOutPage[],
): TocMismatch[] {
  const folios = pageFolioBySection(pages);
  const mismatches: TocMismatch[] = [];

  for (const block of [...composed.front, ...composed.back].flatMap((item) => item.blocks)) {
    const entry = block.tocEntry;

    if (!entry?.sourceId) {
      continue;
    }

    const folio = folios.get(entry.sourceId);
    const actual = folio === undefined ? "—" : String(folio);

    if (folio === undefined || digits(entry.label) !== digits(actual)) {
      mismatches.push({ sectionId: entry.sourceId, expected: entry.label, actual });
    }
  }

  return mismatches;
}

/**
 * Compone las materias y el cuerpo hasta que el índice deja de moverse.
 *
 * A diferencia del bucle anterior, informa de la no convergencia y del cotejo
 * final: la exportación puede negarse a emitir un archivo con folios dudosos.
 */
export function stabilizeComposition(input: StabilizeCompositionInput): StabilizedComposition {
  const maxPasses = Math.max(1, input.maxPasses ?? MAX_TOC_PASSES);
  let composed = input.matter ? composeMatter(input.matter, new Map()) : EMPTY_MATTER;
  const build = (matter: ComposedMatter): PaginationResult =>
    paginate(
      input.compose(matter.front, matter.back),
      input.geometry,
      input.typography,
      input.measure,
      input.masters,
    );
  let composition = build(composed);

  const updateReferences = (pages: readonly LaidOutPage[]): boolean => {
    if (!input.references) {
      return false;
    }

    const next = pageFolioBySection(pages);
    let changed = next.size !== input.references.pageMap.size;

    for (const [id, folio] of next) {
      if (input.references.pageMap.get(id) !== folio) {
        changed = true;
      }
    }

    input.references.pageMap.clear();

    for (const [id, folio] of next) {
      input.references.pageMap.set(id, folio);
    }

    return changed;
  };

  const referencesChanged = updateReferences(composition.pages);

  if (!input.matter && (!input.references || !referencesChanged)) {
    return {
      composedMatter: composed,
      composition,
      stability: { converged: true, passes: 0, maxPasses, mismatches: [] },
    };
  }

  const seen = new Set<string>([composed.signature]);
  let converged = false;
  let passes = 0;

  while (passes < maxPasses) {
    passes += 1;

    const next = input.matter
      ? composeMatter(input.matter, pageFolioBySection(composition.pages))
      : composed;
    const nextComposition = build(next);
    const stable = next.signature === composed.signature;
    const refsChanged = updateReferences(nextComposition.pages);

    composed = next;
    composition = nextComposition;

    if (stable && !refsChanged) {
      converged = true;
      break;
    }

    // El índice puede repetir su firma mientras los folios de las referencias
    // todavía se mueven: en ese caso hay que seguir, no rendirse.
    if (stable && refsChanged) {
      continue;
    }

    // Una firma repetida significa que el índice oscila entre dos estados:
    // seguir iterando no lo va a estabilizar.
    if (seen.has(next.signature)) {
      break;
    }

    seen.add(next.signature);
  }

  return {
    composedMatter: composed,
    composition,
    stability: {
      converged,
      passes,
      maxPasses,
      mismatches: tocMismatches(composed, composition.pages),
    },
  };
}

/** Diagnósticos legibles para la vista previa y el panel de exportación. */
export function tocDiagnostics(stability: TocStability): LayoutDiagnostic[] {
  const diagnostics: LayoutDiagnostic[] = [];

  if (!stability.converged) {
    diagnostics.push({
      code: "TOC_NOT_CONVERGED",
      severity: "error",
      message: `El índice no se estabilizó tras ${stability.passes} de ${stability.maxPasses} pasadas. Revisa los títulos duplicados o los saltos de página antes de exportar.`,
    });
  }

  for (const mismatch of stability.mismatches) {
    diagnostics.push({
      code: "TOC_FOLIO_MISMATCH",
      severity: "error",
      message: `El índice anuncia ${mismatch.expected} para «${mismatch.sectionId}», pero la sección empieza en ${mismatch.actual}.`,
      sectionId: mismatch.sectionId,
    });
  }

  return diagnostics;
}

/** Mensaje accionable del bloqueo de exportación. */
export function describeTocFailure(stability: TocStability): string {
  const parts: string[] = [];

  if (!stability.converged) {
    parts.push(`el índice no convergió tras ${stability.passes} de ${stability.maxPasses} pasadas`);
  }

  if (stability.mismatches.length > 0) {
    const shown = stability.mismatches
      .slice(0, 3)
      .map((item) => `«${item.sectionId}» anuncia ${item.expected} y empieza en ${item.actual}`)
      .join("; ");
    const rest = stability.mismatches.length - 3;
    parts.push(
      `${stability.mismatches.length} folios no coinciden: ${shown}${rest > 0 ? ` y ${rest} más` : ""}`,
    );
  }

  return `No se ha generado el archivo porque ${parts.join(" y ")}. Corrige el índice y vuelve a intentarlo.`;
}

/**
 * Geometría de portadas.
 *
 * Este módulo es puro: lo usan el navegador, el servidor y las pruebas. No
 * importa Prisma ni Cloudinary. Las medidas se expresan en milímetros y los
 * recortes en píxeles de la imagen original.
 */

export const MM_PER_INCH = 25.4;

export const DIGITAL_COVER = {
  width: 1600,
  height: 2560,
  aspect: 1600 / 2560,
  highResolutionWidth: 2560,
  highResolutionHeight: 4096,
  colorSpace: "sRGB",
} as const;

export interface TrimSize {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

/** Formatos habituales de libro. La imprenta puede confirmar otras medidas. */
export const TRIM_SIZES: readonly TrimSize[] = [
  { id: "A5", label: "A5 · 148 × 210 mm", widthMm: 148, heightMm: 210 },
  {
    id: "SIX_BY_NINE",
    label: "6 × 9 pulgadas · 152,4 × 228,6 mm",
    widthMm: 152.4,
    heightMm: 228.6,
  },
  {
    id: "FIVE_FIVE_BY_EIGHT_FIVE",
    label: "5,5 × 8,5 pulgadas · 139,7 × 215,9 mm",
    widthMm: 139.7,
    heightMm: 215.9,
  },
  { id: "FIVE_BY_EIGHT", label: "5 × 8 pulgadas · 127 × 203,2 mm", widthMm: 127, heightMm: 203.2 },
  { id: "A6", label: "A6 · 105 × 148 mm", widthMm: 105, heightMm: 148 },
];

export interface PaperStock {
  id: string;
  label: string;
  gsm: number;
  /** Grosor orientativo de una hoja (dos páginas). Confirma con tu imprenta. */
  caliperMm: number;
}

/**
 * Valores orientativos de grosor. No son una verdad universal: la misma
 * gramatura puede variar entre proveedores. La interfaz permite introducir el
 * grosor real que indique la imprenta.
 */
export const PAPER_STOCKS: readonly PaperStock[] = [
  { id: "OFFSET_70", label: "Offset 70 g/m²", gsm: 70, caliperMm: 0.08 },
  { id: "OFFSET_80", label: "Offset 80 g/m²", gsm: 80, caliperMm: 0.1 },
  { id: "OFFSET_90", label: "Offset 90 g/m²", gsm: 90, caliperMm: 0.11 },
  { id: "OFFSET_100", label: "Offset 100 g/m²", gsm: 100, caliperMm: 0.12 },
  { id: "OFFSET_115", label: "Offset 115 g/m²", gsm: 115, caliperMm: 0.14 },
  { id: "CREAM_80", label: "Novela 80 g/m² (crema)", gsm: 80, caliperMm: 0.1 },
  { id: "COATED_90", label: "Estucado 90 g/m²", gsm: 90, caliperMm: 0.09 },
];

export interface PrintCoverSpec {
  trimWidthMm: number;
  trimHeightMm: number;
  pageCount: number;
  /** Grosor de una hoja del interior. */
  paperCaliperMm: number;
  /** Sangrado por cada borde exterior. */
  bleedMm: number;
  /** Margen de seguridad dentro de cada panel. */
  safetyMm: number;
  dpi: number;
  withBleed: boolean;
}

export interface PrintCoverLayout {
  pageCount: number;
  sheets: number;
  spineWidthMm: number;
  totalWidthMm: number;
  totalHeightMm: number;
  frontWidthMm: number;
  frontHeightMm: number;
  bleedMm: number;
  safetyMm: number;
  dpi: number;
  pixels: {
    totalWidth: number;
    totalHeight: number;
    frontWidth: number;
    frontHeight: number;
    spineWidth: number;
    bleed: number;
    safety: number;
  };
  safeArea: {
    frontWidthMm: number;
    frontHeightMm: number;
  };
  warnings: string[];
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const mmToPixels = (mm: number, dpi: number): number =>
  Math.max(1, Math.round((mm / MM_PER_INCH) * dpi));

export function parsePositiveNumber(value: string | number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value.replace(",", "."));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Calcula la cubierta completa: contraportada + lomo + portada.
 *
 * No asume un lomo fijo: lo deriva del número de hojas y del grosor real de la
 * hoja. Si el número de páginas es impar, se redondea a la hoja completa.
 */
export function computePrintCoverLayout(spec: PrintCoverSpec): PrintCoverLayout {
  const trimWidthMm = clamp(spec.trimWidthMm, 50, 500);
  const trimHeightMm = clamp(spec.trimHeightMm, 50, 700);
  const pageCount = clamp(Math.round(spec.pageCount), 1, 10_000);
  const sheets = Math.ceil(pageCount / 2);
  const paperCaliperMm = clamp(spec.paperCaliperMm, 0.01, 2);
  const bleedMm = spec.withBleed ? clamp(spec.bleedMm, 0, 20) : 0;
  const safetyMm = clamp(spec.safetyMm, 0, Math.min(trimWidthMm, trimHeightMm) / 3);
  const dpi = clamp(Math.round(spec.dpi), 72, 1_200);
  const spineWidthMm = sheets * paperCaliperMm;
  const totalWidthMm = trimWidthMm * 2 + spineWidthMm + bleedMm * 2;
  const totalHeightMm = trimHeightMm + bleedMm * 2;
  const frontWidthMm = trimWidthMm;
  const frontHeightMm = trimHeightMm;

  const warnings: string[] = [];

  if (pageCount % 2 !== 0) {
    warnings.push("El número de páginas es impar: el lomo se ha calculado con la hoja completa.");
  }

  if (pageCount < 24) {
    warnings.push(
      "Con tan pocas páginas el lomo puede ser demasiado estrecho para imprimir texto.",
    );
  }

  if (!spec.withBleed) {
    warnings.push(
      "Sin sangrado, cualquier fondo que llegue al borde puede dejar una línea blanca al recortar.",
    );
  }

  if (spineWidthMm < 3) {
    warnings.push("El lomo calculado mide menos de 3 mm; muchas imprentas no imprimen texto ahí.");
  }

  return {
    pageCount,
    sheets,
    spineWidthMm,
    totalWidthMm,
    totalHeightMm,
    frontWidthMm,
    frontHeightMm,
    bleedMm,
    safetyMm,
    dpi,
    pixels: {
      totalWidth: mmToPixels(totalWidthMm, dpi),
      totalHeight: mmToPixels(totalHeightMm, dpi),
      frontWidth: mmToPixels(frontWidthMm, dpi),
      frontHeight: mmToPixels(frontHeightMm, dpi),
      spineWidth: mmToPixels(spineWidthMm, dpi),
      bleed: mmToPixels(bleedMm, dpi),
      safety: mmToPixels(safetyMm, dpi),
    },
    safeArea: {
      frontWidthMm: Math.max(0, frontWidthMm - safetyMm * 2),
      frontHeightMm: Math.max(0, frontHeightMm - safetyMm * 2),
    },
    warnings,
  };
}

/** Cifras de referencia para la portada frontal de 6 × 9 pulgadas. */
export const SIX_BY_NINE_REFERENCE = {
  widthMm: 152.4,
  heightMm: 228.6,
  dpi: 300,
  widthPx: 1800,
  heightPx: 2700,
} as const;

export function findTrimSize(id: string): TrimSize | undefined {
  return TRIM_SIZES.find((size) => size.id === id);
}

export function findPaperStock(id: string): PaperStock | undefined {
  return PAPER_STOCKS.find((paper) => paper.id === id);
}

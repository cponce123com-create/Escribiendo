export type PageFormatId =
  "A4" | "A5" | "B5" | "INCH_5X8" | "INCH_5_5X8_5" | "INCH_6X9" | "POCKET" | "CUSTOM";

export interface PageFormatPreset {
  id: Exclude<PageFormatId, "CUSTOM">;
  label: string;
  widthMm: number;
  heightMm: number;
  note?: string;
}

export const MM_PER_INCH = 25.4;
export const POINTS_PER_INCH = 72;

export function inchesToMm(inches: number): number {
  return inches * MM_PER_INCH;
}

export function mmToPoints(mm: number): number {
  return (mm / MM_PER_INCH) * POINTS_PER_INCH;
}

/**
 * Medidas de referencia de la aplicación. No son una garantía de impresión:
 * cada imprenta puede exigir sangrado, margen de seguridad y papeles
 * distintos. "POCKET" es un formato de bolsillo editable, no un estándar
 * universal.
 */
export const PAGE_FORMAT_PRESETS: Readonly<
  Record<Exclude<PageFormatId, "CUSTOM">, PageFormatPreset>
> = {
  A4: { id: "A4", label: "A4", widthMm: 210, heightMm: 297 },
  A5: { id: "A5", label: "A5", widthMm: 148, heightMm: 210 },
  B5: { id: "B5", label: "B5", widthMm: 176, heightMm: 250 },
  INCH_5X8: { id: "INCH_5X8", label: "5 × 8 pulgadas", widthMm: 127, heightMm: 203.2 },
  INCH_5_5X8_5: {
    id: "INCH_5_5X8_5",
    label: "5,5 × 8,5 pulgadas",
    widthMm: 139.7,
    heightMm: 215.9,
  },
  INCH_6X9: { id: "INCH_6X9", label: "6 × 9 pulgadas", widthMm: 152.4, heightMm: 228.6 },
  POCKET: {
    id: "POCKET",
    label: "Bolsillo (referencia)",
    widthMm: 107.95,
    heightMm: 174.5,
    note: "Medida editable. Confirma siempre el formato con la imprenta.",
  },
};

export function getPageFormatPreset(id: Exclude<PageFormatId, "CUSTOM">): PageFormatPreset {
  return PAGE_FORMAT_PRESETS[id];
}

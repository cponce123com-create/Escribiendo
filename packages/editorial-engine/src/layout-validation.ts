export interface LayoutGeometryInput {
  pageWidthMm: number;
  pageHeightMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginInnerMm: number;
  marginOuterMm: number;
  gutterMm?: number;
  bleedMm?: number;
  headerDistanceMm?: number;
  footerDistanceMm?: number;
}

export type LayoutIssueSeverity = "error" | "warning";

export interface LayoutIssue {
  code: string;
  severity: LayoutIssueSeverity;
  message: string;
  field?: keyof LayoutGeometryInput;
}

export interface LayoutValidationResult {
  valid: boolean;
  issues: LayoutIssue[];
}

const MIN_PAGE_MM = 50;
const MAX_PAGE_MM = 600;
const MAX_MARGIN_MM = 200;
const MIN_TEXT_BLOCK_WIDTH_MM = 60;
const MIN_TEXT_BLOCK_HEIGHT_MM = 80;

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function validateLayoutGeometry(input: LayoutGeometryInput): LayoutValidationResult {
  const issues: LayoutIssue[] = [];
  const gutter = input.gutterMm ?? 0;
  const bleed = input.bleedMm ?? 0;

  const positiveDimensions: Array<[number, keyof LayoutGeometryInput]> = [
    [input.pageWidthMm, "pageWidthMm"],
    [input.pageHeightMm, "pageHeightMm"],
  ];

  for (const [value, field] of positiveDimensions) {
    if (!Number.isFinite(value) || value < MIN_PAGE_MM || value > MAX_PAGE_MM) {
      issues.push({
        code: "PAGE_DIMENSION_OUT_OF_RANGE",
        severity: "error",
        field,
        message: `La dimensión debe estar entre ${MIN_PAGE_MM} y ${MAX_PAGE_MM} mm.`,
      });
    }
  }

  const margins: Array<[number, keyof LayoutGeometryInput]> = [
    [input.marginTopMm, "marginTopMm"],
    [input.marginBottomMm, "marginBottomMm"],
    [input.marginInnerMm, "marginInnerMm"],
    [input.marginOuterMm, "marginOuterMm"],
    [gutter, "gutterMm"],
    [bleed, "bleedMm"],
  ];

  for (const [value, field] of margins) {
    if (!isFiniteNonNegative(value) || value > MAX_MARGIN_MM) {
      issues.push({
        code: "MARGIN_OUT_OF_RANGE",
        severity: "error",
        field,
        message: `El margen debe ser un valor entre 0 y ${MAX_MARGIN_MM} mm.`,
      });
    }
  }

  if (bleed > 20) {
    issues.push({
      code: "BLEED_TOO_LARGE",
      severity: "warning",
      field: "bleedMm",
      message: "Un sangrado superior a 20 mm es poco habitual. Confírmalo con la imprenta.",
    });
  }

  const textWidth = input.pageWidthMm - input.marginInnerMm - input.marginOuterMm - gutter;
  const textHeight = input.pageHeightMm - input.marginTopMm - input.marginBottomMm;

  if (textWidth <= 0) {
    issues.push({
      code: "TEXT_BLOCK_WIDTH_INVALID",
      severity: "error",
      message: "Los márgenes laterales y el medianil consumen todo el ancho de la página.",
    });
  } else if (textWidth < MIN_TEXT_BLOCK_WIDTH_MM) {
    issues.push({
      code: "TEXT_BLOCK_TOO_NARROW",
      severity: "warning",
      message: `El área de texto mide ${textWidth.toFixed(1)} mm. Revisa si es suficiente para una lectura cómoda.`,
    });
  }

  if (textHeight <= 0) {
    issues.push({
      code: "TEXT_BLOCK_HEIGHT_INVALID",
      severity: "error",
      message: "Los márgenes superior e inferior consumen todo el alto de la página.",
    });
  } else if (textHeight < MIN_TEXT_BLOCK_HEIGHT_MM) {
    issues.push({
      code: "TEXT_BLOCK_TOO_SHORT",
      severity: "warning",
      message: `El área de texto mide ${textHeight.toFixed(1)} mm. Revisa la maqueta antes de imprimir.`,
    });
  }

  if (input.headerDistanceMm !== undefined) {
    if (
      !isFiniteNonNegative(input.headerDistanceMm) ||
      input.headerDistanceMm >= input.marginTopMm
    ) {
      issues.push({
        code: "HEADER_DISTANCE_INVALID",
        severity: "error",
        field: "headerDistanceMm",
        message: "La distancia del encabezado debe ser menor que el margen superior.",
      });
    }
  }

  if (input.footerDistanceMm !== undefined) {
    if (
      !isFiniteNonNegative(input.footerDistanceMm) ||
      input.footerDistanceMm >= input.marginBottomMm
    ) {
      issues.push({
        code: "FOOTER_DISTANCE_INVALID",
        severity: "error",
        field: "footerDistanceMm",
        message: "La distancia del pie de página debe ser menor que el margen inferior.",
      });
    }
  }

  if (input.marginInnerMm <= 8) {
    issues.push({
      code: "INNER_MARGIN_TIGHT",
      severity: "warning",
      field: "marginInnerMm",
      message: "Un margen interior de 8 mm o menos puede dificultar la lectura junto al lomo.",
    });
  }

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

import { DIGITAL_COVER, MM_PER_INCH, mmToPixels } from "./print-layout";

export const COVER_MAX_BYTES = 10 * 1024 * 1024;
export const COVER_ALLOWED_FORMATS = ["jpg", "jpeg", "png", "webp"] as const;

export type CoverFormat = (typeof COVER_ALLOWED_FORMATS)[number];

export type CoverQuality = "OPTIMAL" | "ACCEPTABLE" | "INSUFFICIENT";

export type CoverIssueSeverity = "info" | "warning" | "error";

export interface CoverIssue {
  code: string;
  severity: CoverIssueSeverity;
  message: string;
}

export interface CoverImageInfo {
  width: number;
  height: number;
  format: string;
  bytes: number;
  /** Cloudinary puede informar si la imagen tiene canal alfa. */
  hasAlpha?: boolean;
}

export interface DigitalCoverTarget {
  kind: "DIGITAL";
}

export interface PrintCoverTarget {
  kind: "PRINT";
  widthMm: number;
  heightMm: number;
  dpi: number;
  /** Etiqueta para la interfaz, por ejemplo «6 × 9 con sangrado». */
  label?: string;
}

export type CoverValidationTarget = DigitalCoverTarget | PrintCoverTarget;

export interface CoverValidationResult {
  quality: CoverQuality;
  issues: CoverIssue[];
  aspectRatio: number;
  megapixels: number;
  effectiveDpi?: number;
  requiredDpi?: number;
  requiredWidthPx: number;
  requiredHeightPx: number;
  targetAspectRatio: number;
  format: string;
}

const round = (value: number, decimals = 1): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const isAllowedFormat = (format: string): format is CoverFormat =>
  (COVER_ALLOWED_FORMATS as readonly string[]).includes(format.toLowerCase());

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "desconocido";
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1 ? `${round(megabytes, 1)} MB` : `${Math.round(bytes / 1024)} KB`;
};

const aspectDeviation = (actual: number, expected: number): number =>
  Math.abs(actual - expected) / expected;

/**
 * Analiza una imagen contra el destino elegido.
 *
 * Nunca considera que una imagen pequeña se ha «recuperado»: si no llega a la
 * resolución mínima, el resultado es INSUFFICIENT y se dice explícitamente que
 * no se ampliará de forma silenciosa.
 */
export function validateCoverImage(
  image: CoverImageInfo,
  target: CoverValidationTarget = { kind: "DIGITAL" },
): CoverValidationResult {
  const issues: CoverIssue[] = [];
  const format = (image.format || "").toLowerCase().replace("jpeg", "jpg");
  const width = Math.max(0, Math.round(image.width));
  const height = Math.max(0, Math.round(image.height));
  const aspectRatio = height > 0 ? width / height : 0;
  const megapixels = (width * height) / 1_000_000;

  const isDigital = target.kind === "DIGITAL";
  const requiredWidthPx = isDigital ? DIGITAL_COVER.width : mmToPixels(target.widthMm, target.dpi);
  const requiredHeightPx = isDigital
    ? DIGITAL_COVER.height
    : mmToPixels(target.heightMm, target.dpi);
  const targetAspectRatio = requiredWidthPx / requiredHeightPx;
  const deviation = aspectRatio > 0 ? aspectDeviation(aspectRatio, targetAspectRatio) : 1;
  const effectiveDpi =
    isDigital || width === 0 || height === 0
      ? undefined
      : Math.min(width / (target.widthMm / MM_PER_INCH), height / (target.heightMm / MM_PER_INCH));

  if (!isAllowedFormat(format)) {
    issues.push({
      code: "FORMAT",
      severity: "error",
      message: "Formato no compatible. Usa JPG, PNG o WebP.",
    });
  }

  if (!Number.isFinite(image.bytes) || image.bytes <= 0) {
    issues.push({
      code: "BYTES",
      severity: "error",
      message: "No se ha podido comprobar el peso del archivo.",
    });
  } else if (image.bytes > COVER_MAX_BYTES) {
    issues.push({
      code: "BYTES",
      severity: "error",
      message: `El archivo pesa ${formatBytes(image.bytes)}. El máximo permitido es ${formatBytes(COVER_MAX_BYTES)}.`,
    });
  }

  if (width < 1 || height < 1) {
    issues.push({
      code: "DIMENSIONS",
      severity: "error",
      message: "No se han podido leer las dimensiones de la imagen.",
    });
  } else if (width >= height) {
    issues.push({
      code: "ORIENTATION",
      severity: "error",
      message: "La portada debe ser vertical. Esta imagen es horizontal o cuadrada.",
    });
  }

  if (image.hasAlpha) {
    issues.push({
      code: "TRANSPARENCY",
      severity: "warning",
      message:
        "La imagen contiene transparencia. Al exportar a JPG o PDF se rellenará con blanco; revisa el resultado.",
    });
  }

  if (isDigital) {
    if (width > 0 && height > 0) {
      if (width < 1000 || height < 1600) {
        issues.push({
          code: "RESOLUTION",
          severity: "error",
          message: `La imagen mide ${width} × ${height} px. Para lectura digital se recomiendan ${DIGITAL_COVER.width} × ${DIGITAL_COVER.height} px; no se ampliará automáticamente.`,
        });
      } else if (width < DIGITAL_COVER.width || height < DIGITAL_COVER.height) {
        issues.push({
          code: "RESOLUTION",
          severity: "warning",
          message: `La imagen mide ${width} × ${height} px. Se recomiendan ${DIGITAL_COVER.width} × ${DIGITAL_COVER.height} px para una portada nítida.`,
        });
      }

      if (deviation > 0.1) {
        issues.push({
          code: "ASPECT",
          severity: "warning",
          message: `La proporción es ${round(aspectRatio, 2)}:1; la editorial recomendada es 1:1,6. Deberás recortar el encuadre.`,
        });
      } else if (deviation > 0.02) {
        issues.push({
          code: "ASPECT",
          severity: "info",
          message:
            "La proporción se aleja ligeramente de 1:1,6. El recorte ajustará el encuadre sin deformar la imagen.",
        });
      }

      if (
        width >= DIGITAL_COVER.highResolutionWidth &&
        height >= DIGITAL_COVER.highResolutionHeight
      ) {
        issues.push({
          code: "HIGH_RES",
          severity: "info",
          message: "Resolución de alta calidad: también sirve para impresión digital exigente.",
        });
      }
    }
  } else {
    const label = target.label ? `«${target.label}»` : "el formato impreso";
    if (width > 0 && height > 0) {
      const effective = effectiveDpi ?? 0;
      const tolerance = 0.5;

      if (effective < 200 - tolerance) {
        issues.push({
          code: "PRINT_RESOLUTION",
          severity: "error",
          message: `Para ${label} se necesitan ${requiredWidthPx} × ${requiredHeightPx} px a ${target.dpi} ppp (resolución efectiva: ${round(effective)} ppp). No se ampliará automáticamente.`,
        });
      } else if (effective < target.dpi - tolerance) {
        issues.push({
          code: "PRINT_RESOLUTION",
          severity: "warning",
          message: `Resolución efectiva: ${round(effective)} ppp. La imprenta recomienda ${target.dpi} ppp para ${label}.`,
        });
      }

      if (deviation > 0.05) {
        issues.push({
          code: "PRINT_ASPECT",
          severity: "warning",
          message: `La imagen no tiene la proporción del formato ${label}; el recorte eliminará parte de la imagen.`,
        });
      }
    }
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  const hasWarning = issues.some((issue) => issue.severity === "warning");

  return {
    quality: hasError ? "INSUFFICIENT" : hasWarning ? "ACCEPTABLE" : "OPTIMAL",
    issues,
    aspectRatio: round(aspectRatio, 3),
    megapixels: round(megapixels, 1),
    effectiveDpi: effectiveDpi === undefined ? undefined : Math.round(effectiveDpi),
    requiredDpi: isDigital ? undefined : target.dpi,
    requiredWidthPx,
    requiredHeightPx,
    targetAspectRatio: round(targetAspectRatio, 3),
    format,
  };
}

export function coverQualityLabel(quality: CoverQuality): string {
  switch (quality) {
    case "OPTIMAL":
      return "Óptima";
    case "ACCEPTABLE":
      return "Aceptable";
    case "INSUFFICIENT":
      return "Insuficiente";
  }
}

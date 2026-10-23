import { z } from "zod";
import { tieneControlesIlegales } from "@escribiendo/shared";

export const LEGAL_CLAUSES_MAX_CHARS = 4000;
export const legalClausesSchema = z
  .string()
  .max(LEGAL_CLAUSES_MAX_CHARS, "Las cláusulas admiten hasta 4000 caracteres.")
  .refine(
    (value) => !tieneControlesIlegales(value),
    "El texto contiene caracteres de control no admitidos.",
  )
  .transform((value) =>
    value
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean),
  );

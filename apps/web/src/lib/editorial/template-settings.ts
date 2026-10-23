import { z } from "zod";
import { tieneControlesIlegales } from "@escribiendo/shared";
const text = z
  .string()
  .max(500)
  .refine((value) => !tieneControlesIlegales(value), "El texto contiene caracteres de control.");
export const legalFieldsSchema = z
  .object({
    rightsHolder: text.optional(),
    copyrightYear: z.number().int().min(1000).max(9999).nullable().optional(),
    publicationDate: text.optional(),
    publicationCity: text.optional(),
    publicationCountry: text.optional(),
    publisherName: text.optional(),
    legalPublisher: text.optional(),
    address: text.optional(),
    isbn: text.optional(),
    legalDeposit: text.optional(),
    printer: text.optional(),
    editionLabel: text.optional(),
  })
  .strict();
export const LEGAL_FIELD_LABELS: Record<string, string> = {
  rightsHolder: "Titular de derechos",
  copyrightYear: "Año de copyright",
  publicationDate: "Fecha de publicación (AAAA-MM-DD, AAAA-MM o AAAA)",
  publicationCity: "Ciudad",
  publicationCountry: "País (código PE para Perú)",
  publisherName: "Sello editorial",
  legalPublisher: "Responsable de publicación",
  address: "Dirección editorial",
  isbn: "ISBN",
  legalDeposit: "Número de depósito legal",
  printer: "Imprenta",
  editionLabel: "Nombre de la edición",
};
export function settingsRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

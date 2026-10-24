import { z } from "zod";
import { dedicationTemplates } from "@escribiendo/templates";
import { tieneControlesIlegales } from "@escribiendo/shared";
const text = z
  .string()
  .max(500)
  .refine((value) => !tieneControlesIlegales(value), "El texto contiene caracteres de control.");
export const legalFieldsSchema = z
  .object({
    rightsHolder: text.optional(),
    printRun: z.number().int().min(1).max(100000000).nullable().optional(),
    copyrightYear: z.number().int().min(1000).max(9999).nullable().optional(),
    publicationDate: text.optional(),
    publicationCity: text.optional(),
    publicationCountry: text.optional(),
    publisherName: text.optional(),
    imprint: text.optional(),
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
  publisherName: "Editorial",
  imprint: "Sello editorial",
  legalPublisher: "Responsable de publicación",
  address: "Dirección editorial",
  isbn: "ISBN",
  legalDeposit: "Número de depósito legal",
  printer: "Imprenta",
  printRun: "Tiraje (ejemplares)",
  editionLabel: "Nombre de la edición",
};
/**
 * Composición de la dedicatoria por edición.
 *
 * El texto sigue viviendo en la sección `DEDICATION` del manuscrito: aquí solo
 * se guarda cómo se compone. Una edición sin esta clave conserva exactamente
 * la composición anterior, de modo que activar el preset es reversible.
 */
export const dedicationSettingsSchema = z
  .object({
    template: z.enum(dedicationTemplates).default("minimal"),
    alignment: z.enum(["left", "center", "right"]).default("right"),
    verticalPosition: z.enum(["upper", "center", "lower"]).default("upper"),
    signature: text.optional().default(""),
  })
  .strict();
export type DedicationSettings = z.infer<typeof dedicationSettingsSchema>;
export const DEFAULT_DEDICATION_SETTINGS: DedicationSettings = {
  template: "minimal",
  alignment: "right",
  verticalPosition: "upper",
  signature: "",
};
/** Devuelve `null` cuando la edición nunca guardó una dedicatoria configurada. */
export function dedicationSettingsFrom(value: unknown): DedicationSettings | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = dedicationSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
/**
 * Letra capital de la edición.
 *
 * La geometría (cuerpo, sangría y corrección) la calcula el motor con
 * `dropCapMetrics`; aquí solo se decide si se compone y cuántas líneas ocupa,
 * para que vista previa y PDF no puedan mostrar estados distintos.
 */
export const dropCapSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
    lines: z.union([z.literal(2), z.literal(3)]).default(3),
  })
  .strict();
export type DropCapSettings = z.infer<typeof dropCapSettingsSchema>;
export const DEFAULT_DROP_CAP_SETTINGS: DropCapSettings = { enabled: false, lines: 3 };
export function dropCapSettingsFrom(value: unknown): DropCapSettings {
  if (value === null || value === undefined) {
    return DEFAULT_DROP_CAP_SETTINGS;
  }
  const parsed = dropCapSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_DROP_CAP_SETTINGS;
}
export function settingsRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

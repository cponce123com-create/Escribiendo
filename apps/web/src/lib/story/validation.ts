import { z } from "zod";
import {
  CHARACTER_ROLE_VALUES,
  PLAN_KIND_VALUES,
  PLAN_STATUS_VALUES,
  WORLD_KIND_VALUES,
} from "./labels";

/** Esquemas compartidos por las acciones de las herramientas de historia. */

export const storyIdSchema = z.string().uuid("El identificador no es válido.");

const optionalBookId = z
  .union([z.literal(""), z.string().uuid("El libro no es válido.")])
  .transform((value) => (value === "" ? null : value));

function optionalText(max: number, message: string) {
  return z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value.length > 0 ? value : null));
}

/** Número máximo de alias por ficha: acota el coste de la detección de menciones. */
export const MAX_ALIASES = 12;

/** Longitud máxima de un alias, alineada con la columna del nombre. */
export const MAX_ALIAS_LENGTH = 160;

/** Clave de comparación: sin tildes, sin mayúsculas y con espacios simples. */
function aliasKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("es");
}

/**
 * Alias escritos como una lista separada por comas.
 *
 * El formulario envía una cadena porque un `<input>` no puede enviar un array:
 * aquí se recorta, se deduplica sin distinguir tildes ni mayúsculas y se acota
 * el número, para que la detección no crezca sin control.
 */
export const aliasListSchema = z
  .string()
  .trim()
  .max(600, "La lista de alias es demasiado larga.")
  .transform((value) => {
    const seen = new Set<string>();
    const aliases: string[] = [];

    for (const raw of value.split(",")) {
      const alias = raw.trim().replace(/\s+/gu, " ");
      if (alias.length === 0) continue;

      const key = aliasKey(alias);
      if (seen.has(key)) continue;

      seen.add(key);
      aliases.push(alias);
    }

    return aliases;
  })
  .pipe(
    z
      .array(z.string().max(MAX_ALIAS_LENGTH, "Un alias es demasiado largo."))
      .max(MAX_ALIASES, `Puedes guardar hasta ${MAX_ALIASES} alias.`),
  );

/** El nombre canónico no se repite como alias: ya se detecta por sí solo. */
function rejectNameAsAlias(value: { name: string; aliases: string[] }, ctx: z.RefinementCtx): void {
  const name = aliasKey(value.name);

  if (value.aliases.some((alias) => aliasKey(alias) === name)) {
    ctx.addIssue({
      code: "custom",
      path: ["aliases"],
      message: "Un alias no puede repetir el nombre de la ficha.",
    });
  }
}

export const planItemFormSchema = z.object({
  bookId: optionalBookId,
  title: z
    .string()
    .trim()
    .min(1, "El título es obligatorio.")
    .max(200, "El título es demasiado largo."),
  kind: z.enum(PLAN_KIND_VALUES),
  status: z.enum(PLAN_STATUS_VALUES),
  summary: optionalText(20_000, "El resumen es demasiado largo."),
});

export const planStatusFormSchema = z.object({
  status: z.enum(PLAN_STATUS_VALUES),
});

export const characterFormSchema = z
  .object({
    bookId: optionalBookId,
    name: z
      .string()
      .trim()
      .min(1, "El nombre es obligatorio.")
      .max(160, "El nombre es demasiado largo."),
    aliases: aliasListSchema,
    role: z.enum(CHARACTER_ROLE_VALUES),
    age: optionalText(40, "La edad es demasiado larga."),
    occupation: optionalText(120, "La ocupación es demasiado larga."),
    summary: optionalText(300, "La descripción breve es demasiado larga."),
    description: optionalText(20_000, "La descripción es demasiado larga."),
    personality: optionalText(20_000, "La personalidad es demasiado larga."),
    motivation: optionalText(20_000, "La motivación es demasiado larga."),
    conflict: optionalText(20_000, "El conflicto es demasiado largo."),
    arc: optionalText(20_000, "El arco es demasiado largo."),
    notes: optionalText(20_000, "Las notas son demasiado largas."),
  })
  .superRefine(rejectNameAsAlias);

export const worldFormSchema = z
  .object({
    bookId: optionalBookId,
    name: z
      .string()
      .trim()
      .min(1, "El nombre es obligatorio.")
      .max(160, "El nombre es demasiado largo."),
    aliases: aliasListSchema,
    kind: z.enum(WORLD_KIND_VALUES),
    summary: optionalText(300, "La descripción breve es demasiado larga."),
    description: optionalText(20_000, "La descripción es demasiado larga."),
    rules: optionalText(20_000, "Las reglas son demasiado largas."),
    notes: optionalText(20_000, "Las notas son demasiado largas."),
  })
  .superRefine(rejectNameAsAlias);

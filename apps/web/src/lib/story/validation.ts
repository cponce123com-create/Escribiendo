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

export const characterFormSchema = z.object({
  bookId: optionalBookId,
  name: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio.")
    .max(160, "El nombre es demasiado largo."),
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
});

export const worldFormSchema = z.object({
  bookId: optionalBookId,
  name: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio.")
    .max(160, "El nombre es demasiado largo."),
  kind: z.enum(WORLD_KIND_VALUES),
  summary: optionalText(300, "La descripción breve es demasiado larga."),
  description: optionalText(20_000, "La descripción es demasiado larga."),
  rules: optionalText(20_000, "Las reglas son demasiado largas."),
  notes: optionalText(20_000, "Las notas son demasiado largas."),
});

import { z } from "zod";

const COMMON_PASSWORDS = new Set([
  "123456789012",
  "1234567890123",
  "12345678901234",
  "administrador",
  "administrator",
  "contraseña123",
  "escribiendo",
  "password1234",
  "qwertyuiop12",
]);

export const emailSchema = z
  .string()
  .trim()
  .min(3, "Introduce un correo electrónico.")
  .max(320, "El correo electrónico es demasiado largo.")
  .email("El correo electrónico no es válido.")
  .transform((value) => value.toLowerCase());

export const personNameSchema = z
  .string()
  .trim()
  .min(2, "Introduce un nombre de al menos 2 caracteres.")
  .max(120, "El nombre no puede superar los 120 caracteres.");

export const passwordSchema = z
  .string()
  .min(12, "La contraseña debe tener al menos 12 caracteres.")
  .max(128, "La contraseña no puede superar los 128 caracteres.")
  .refine((value) => value.trim().length > 0, "La contraseña no puede estar vacía.")
  .refine(
    (value) => !COMMON_PASSWORDS.has(value.toLocaleLowerCase("es")),
    "Esa contraseña es demasiado común. Elige otra.",
  )
  .refine(
    (value) => !/^(.)\1{8,}$/u.test(value),
    "La contraseña no puede ser un único carácter repetido.",
  );

export const setupTokenSchema = z
  .string()
  .trim()
  .min(32, "El token de instalación no es válido.")
  .max(256, "El token de instalación no es válido.");

export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Los datos introducidos no son válidos.";
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!errors[key]) {
      errors[key] = issue.message;
    }
  }

  return errors;
}

export const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

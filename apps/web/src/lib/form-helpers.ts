import type { ActionState } from "@/lib/action-state";

/** Utilidades compartidas por las Server Actions con formulario. */

/** Lee un campo de texto de un `FormData`. */
export function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Estado de error con errores por campo opcionales. */
export function errorState(message: string, fieldErrors?: Record<string, string>): ActionState {
  return { status: "error", message, ...(fieldErrors ? { fieldErrors } : {}) };
}

/** Estado de éxito. */
export function successState(message: string): ActionState {
  return { status: "success", message };
}

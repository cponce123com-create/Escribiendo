/**
 * Estado devuelto por las Server Actions al formulario.
 *
 * Es el mismo para toda la aplicación: la interfaz lo lee igual sea un
 * acceso, un libro o una nota.
 */
export interface ActionState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

export const initialActionState: ActionState = { status: "idle" };

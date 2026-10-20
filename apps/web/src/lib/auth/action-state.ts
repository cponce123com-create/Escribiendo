export interface AuthActionState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

export const initialAuthActionState: AuthActionState = { status: "idle" };

export const initialPasswordActionState: AuthActionState = { status: "idle" };

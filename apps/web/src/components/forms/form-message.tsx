import { AlertIcon, CheckIcon } from "@/components/icons";
import type { AuthActionState } from "@/lib/auth/action-state";

interface FormMessageProps {
  state: AuthActionState;
}

export function FormMessage({ state }: FormMessageProps) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  const isError = state.status === "error";

  return (
    <div
      className={`alert ${isError ? "alert-error" : "alert-success"}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      {isError ? <AlertIcon /> : <CheckIcon />}
      <span>{state.message}</span>
    </div>
  );
}

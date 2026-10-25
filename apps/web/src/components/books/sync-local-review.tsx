"use client";
import { useState, useTransition } from "react";
import { saveLaboratoryReviewAction } from "@/lib/books/laboratory-review-actions";
import { FormMessage } from "@/components/forms/form-message";
import type { ActionState } from "@/lib/action-state";
export function SyncLocalReview({ bookId, userId }: { bookId: string; userId: string }) {
  const [state, setState] = useState<ActionState>({ status: "idle" }),
    [pending, start] = useTransition();
  return (
    <details className="mt-3 text-sm text-ink-soft">
      <summary className="cursor-pointer">Decisiones de la versión anterior</summary>
      <p className="my-2 text-xs text-ink-muted">
        Si marcaste observaciones antes de la sincronización por cuenta, puedes copiar las de este
        navegador. No se sustituyen decisiones ya guardadas en el servidor.
      </p>
      <button
        className="btn btn-ghost btn-sm"
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const prefix = `escribiendo:analysis-ignore:${userId}:${bookId}:`;
              const legacy: { key: string; status: "ignored" | "intentional" | "resolved" }[] = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key?.startsWith(prefix)) continue;
                const status = localStorage.getItem(key);
                if (status === "ignored" || status === "intentional" || status === "resolved")
                  legacy.push({ key, status });
              }
              if (legacy.length > 5000) {
                setState({
                  status: "error",
                  message: "Hay más de 5.000 decisiones locales; solicita una migración asistida.",
                });
                return;
              }
              for (let i = 0; i < legacy.length; i += 100) {
                const result = await saveLaboratoryReviewAction({
                  bookId,
                  legacy: legacy.slice(i, i + 100),
                });
                if (result.status === "error") {
                  setState(result);
                  return;
                }
              }
              setState({
                status: "success",
                message: legacy.length
                  ? "Decisiones locales copiadas. Recarga para verlas."
                  : "No hay decisiones anteriores en este navegador.",
              });
            } catch {
              setState({
                status: "error",
                message: "El navegador no permite leer las decisiones locales.",
              });
            }
          })
        }
      >
        {pending ? "Sincronizando…" : "Copiar decisiones locales a mi cuenta"}
      </button>
      <FormMessage state={state} />
    </details>
  );
}

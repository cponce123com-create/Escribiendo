"use client";

import { useState } from "react";
import { exportStoryBibleMarkdown } from "@/lib/story/bible-markdown-actions";

/**
 * Descarga la biblia del libro como Markdown.
 *
 * La acción devuelve el texto y el navegador lo guarda como archivo: no se
 * crea ningún trabajo de exportación ni se ocupa almacenamiento del servidor.
 */
export function BibleExportButton({ bookId }: { bookId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    setLoading(true);
    setError("");

    try {
      const result = await exportStoryBibleMarkdown(bookId);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      const blob = new Blob([result.content], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = result.filename;
      document.body.append(link);
      link.click();
      link.remove();
      // Liberar en el siguiente turno: algunos navegadores cancelan la descarga
      // si la URL se revoca en el mismo instante del clic.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setError("No se pudo generar el archivo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => void handleClick()}
        disabled={loading}
      >
        {loading ? "Generando…" : "Exportar biblia (.md)"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

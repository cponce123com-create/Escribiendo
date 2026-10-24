"use client";
import type { MatterPreview } from "@/lib/layout/preview";
import { PaginatedPreview } from "./paginated-preview";

/** Escala solo la hoja ya compuesta; no vuelve a medir ni a maquetar. */
export function MatterSheet({
  preview,
  mini = false,
}: {
  preview: MatterPreview | null;
  mini?: boolean;
}) {
  if (!preview) {
    if (mini) {
      // Miniatura de catálogo: no compone nada. La hoja real aparece cuando el
      // editor selecciona la plantilla.
      return (
        <div
          className="mx-auto w-40 rounded-sm border border-ink/10 bg-white p-3 shadow-sm"
          role="img"
          aria-label="Miniatura de catálogo sin componer"
        >
          <div className="aspect-[152/229] space-y-1.5">
            {[70, 100, 92, 100, 84, 96, 60].map((width, index) => (
              <div key={index} className="h-1 rounded bg-ink/10" style={{ width: `${width}%` }} />
            ))}
          </div>
        </div>
      );
    }

    return (
      <p className="text-sm text-ink-muted">
        Aplica una maqueta y completa los datos del libro para ver la hoja.
      </p>
    );
  }

  const width = (preview.profile.pageWidthMm * 96) / 25.4;
  const height = (preview.profile.pageHeightMm * 96) / 25.4;
  return (
    <div
      className={mini ? "mx-auto w-40 pointer-events-none" : "w-full"}
      aria-hidden={mini || undefined}
    >
      {preview.pages.slice(0, mini ? 1 : undefined).map((page) => (
        <svg
          key={page.index}
          viewBox={`0 0 ${width} ${height}`}
          className="block w-full shadow-sm"
          role="img"
          aria-label={`Hoja compuesta, folio ${page.folio}`}
        >
          <foreignObject width={width} height={height}>
            <div>
              <PaginatedPreview
                eager
                pages={[page]}
                profile={preview.profile}
                typography={preview.typography}
              />
            </div>
          </foreignObject>
        </svg>
      ))}
    </div>
  );
}

"use client";
import type { PreviewResult } from "@/lib/layout/preview";
import { PaginatedPreview } from "./paginated-preview";
/** Escala solo la hoja ya compuesta; no vuelve a medir ni a maquetar. */
export function MatterSheet({
  preview,
  mini = false,
}: {
  preview: PreviewResult | null;
  mini?: boolean;
}) {
  if (!preview)
    return (
      <p className="text-sm text-ink-muted">
        Aplica una maqueta y completa los datos del libro para ver la hoja.
      </p>
    );
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

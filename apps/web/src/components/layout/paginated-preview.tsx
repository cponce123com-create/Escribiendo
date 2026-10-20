import type { LayoutProfileSummary } from "@/lib/layout/profiles";
import type { PreviewPage } from "@/lib/layout/preview";
import type { LaidOutBlock, TypographyConfig } from "@escribiendo/editorial-engine";

/**
 * Vista previa paginada.
 *
 * Las páginas se dibujan a escala real: un milímetro del perfil es un
 * milímetro en pantalla, de modo que lo que se ve aquí es lo que saldrá en
 * papel. La composición no se recalcula en el navegador: se usan las líneas
 * que ya decidió el motor, para que la vista previa y el diagnóstico
 * hablen siempre de lo mismo.
 */

/** Píxeles por milímetro a 96 dpi, la resolución de referencia del CSS. */
const PX_PER_MM = 96 / 25.4;

const FAMILIAS: Record<string, string> = {
  serif: "var(--font-serif)",
  "sans-serif": "var(--font-ui)",
  monospace: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

interface PaginatedPreviewProps {
  pages: PreviewPage[];
  profile: LayoutProfileSummary;
  typography: TypographyConfig;
}

export function PaginatedPreview({ pages, profile }: PaginatedPreviewProps) {
  const pageWidth = profile.pageWidthMm * PX_PER_MM;
  const pageHeight = profile.pageHeightMm * PX_PER_MM;

  return (
    <div className="space-y-10">
      {pages.map((page) => (
        <figure key={page.index} className="space-y-2">
          <PageSheet page={page} profile={profile} pageWidth={pageWidth} pageHeight={pageHeight} />
          <figcaption className="text-xs text-ink-muted">
            Página {page.index} · folio {page.folio} · {page.side === "recto" ? "par" : "impar"}
            {page.blank ? " · en blanco" : ""}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

interface PageSheetProps {
  page: PreviewPage;
  profile: LayoutProfileSummary;
  pageWidth: number;
  pageHeight: number;
}

function PageSheet({ page, profile, pageWidth, pageHeight }: PageSheetProps) {
  const mirror = profile.mirrorMargins;
  // En una página par (la derecha) el margen interior queda a la izquierda;
  // en una impar, a la derecha.
  const innerOnLeft = mirror ? page.side === "recto" : true;

  const leftMarginMm = innerOnLeft
    ? profile.marginInnerMm + profile.gutterMm
    : profile.marginOuterMm;
  const rightMarginMm = innerOnLeft
    ? profile.marginOuterMm
    : profile.marginInnerMm + profile.gutterMm;

  const textWidthMm = profile.pageWidthMm - leftMarginMm - rightMarginMm;

  return (
    <div
      className="relative overflow-hidden border border-ink/15 bg-white shadow-sm dark:bg-neutral-50"
      style={{ width: `${pageWidth}px`, height: `${pageHeight}px` }}
      aria-label={`Página ${page.index}`}
    >
      {page.runningHead ? (
        <div
          className="absolute text-center text-ink-muted"
          style={{
            top: `${profile.headerDistanceMm * PX_PER_MM}px`,
            left: `${leftMarginMm * PX_PER_MM}px`,
            width: `${textWidthMm * PX_PER_MM}px`,
            fontSize: "8pt",
          }}
        >
          {page.runningHead}
        </div>
      ) : null}

      {page.blank ? null : (
        <div
          className="absolute"
          style={{
            top: `${profile.marginTopMm * PX_PER_MM}px`,
            left: `${leftMarginMm * PX_PER_MM}px`,
            width: `${textWidthMm * PX_PER_MM}px`,
          }}
        >
          {page.blocks.map((block) => (
            <PreviewBlock key={`${block.id}-${page.index}`} block={block} />
          ))}
        </div>
      )}

      {profile.showPageNumbers ? (
        <div
          className="absolute text-center tabular-nums text-ink-muted"
          style={{
            bottom: `${profile.footerDistanceMm * PX_PER_MM}px`,
            left: `${leftMarginMm * PX_PER_MM}px`,
            width: `${textWidthMm * PX_PER_MM}px`,
            fontSize: "9pt",
          }}
        >
          {page.folio}
        </div>
      ) : null}
    </div>
  );
}

function PreviewBlock({ block }: { block: LaidOutBlock }) {
  const { style } = block;
  const lineHeight = style.fontSizePt * style.lineHeight;
  const alignment =
    style.alignment === "justify"
      ? "justify"
      : style.alignment === "center"
        ? "center"
        : style.alignment === "right"
          ? "right"
          : "left";

  return (
    <div
      style={{
        fontFamily: FAMILIAS[style.fontFamily] ?? FAMILIAS.serif,
        fontSize: `${style.fontSizePt}pt`,
        lineHeight: `${lineHeight}pt`,
        letterSpacing: `${style.letterSpacingPt}pt`,
        textAlign: alignment,
        textTransform: style.uppercase ? "uppercase" : undefined,
        fontVariantCaps: style.smallCaps ? "small-caps" : undefined,
        marginTop: `${block.spaceBeforeMm * PX_PER_MM}px`,
        marginBottom: `${block.spaceAfterMm * PX_PER_MM}px`,
        marginLeft: block.kind === "blockquote" ? "1.5em" : undefined,
        fontStyle: block.kind === "blockquote" ? "italic" : undefined,
      }}
    >
      {block.lines.map((line, index) => {
        const esUltima = index === block.lines.length - 1;

        return (
          <div
            key={`${block.id}-${index}`}
            style={{
              minHeight: `${lineHeight}pt`,
              // Cada línea es un bloque propio, así que el justificado del
              // navegador no se aplica: hay que pedirlo explícitamente. La
              // última línea del párrafo se deja suelta, como en un libro.
              textAlignLast: style.alignment === "justify" && !esUltima ? "justify" : alignment,
              ...(line.overflow ? { color: "var(--color-danger, #b3261e)" } : {}),
            }}
          >
            {line.text}
            {line.hyphenated ? "‑" : ""}
          </div>
        );
      })}
    </div>
  );
}

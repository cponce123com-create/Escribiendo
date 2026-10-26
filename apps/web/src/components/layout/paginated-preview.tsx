import type { LayoutProfileSummary } from "@/lib/layout/profiles";
import type { PreviewCover, PreviewPage } from "@/lib/layout/preview";
import {
  baselineCorrectionPt,
  dropCapCorrectionPt,
  extractDropCapGrapheme,
  isHeadingKind,
  type InlineRun,
  type LaidOutBlock,
  type TypographyConfig,
} from "@escribiendo/editorial-engine";

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
  serif: '"Liberation Serif"',
  "sans-serif": '"Liberation Sans"',
  monospace: '"Liberation Mono"',
};

interface PaginatedPreviewProps {
  pages: PreviewPage[];
  profile: LayoutProfileSummary;
  typography: TypographyConfig;
  /** Portada que abre el archivo, si el libro tiene una. */
  cover?: PreviewCover | null;
  eager?: boolean;
}

export function PaginatedPreview({
  pages,
  profile,
  typography,
  cover = null,
  eager = false,
}: PaginatedPreviewProps) {
  const pageWidth = profile.pageWidthMm * PX_PER_MM;
  const pageHeight = profile.pageHeightMm * PX_PER_MM;
  // La portada es la página 1 del archivo: las páginas compuestas se numeran
  // a continuación, igual que en el PDF.
  const pageOffset = cover ? 1 : 0;

  return (
    <div className="space-y-10">
      {cover ? (
        <figure className="space-y-2">
          <CoverSheet cover={cover} pageWidth={pageWidth} pageHeight={pageHeight} />
          <figcaption className="text-xs text-ink-muted">Portada</figcaption>
        </figure>
      ) : null}
      {pages.map((page) => (
        <figure key={page.index} className="space-y-2">
          <PageSheet
            page={page}
            profile={profile}
            typography={typography}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            eager={eager}
            displayIndex={page.index + pageOffset}
          />
          <figcaption className="text-xs text-ink-muted">
            Página {page.index + pageOffset} · folio {page.folio} ·{" "}
            {page.side === "recto" ? "par" : "impar"}
            {page.blank ? " · en blanco" : ""}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/**
 * Página de cubierta.
 *
 * Usa la misma geometría que `coverPlacement` en el PDF: la imagen cubre la
 * hoja, el punto focal elige el encuadre y el zoom amplía alrededor de ese
 * punto. Así el recorte de la portada no se pierde al exportar.
 */
function CoverSheet({
  cover,
  pageWidth,
  pageHeight,
}: {
  cover: PreviewCover;
  pageWidth: number;
  pageHeight: number;
}) {
  return (
    <div
      className="relative overflow-hidden border border-ink/15 bg-white text-black shadow-sm dark:bg-white"
      style={{ width: `${pageWidth}px`, height: `${pageHeight}px` }}
      aria-label="Portada"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover.url}
        alt={cover.alt}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: `${cover.crop.x}% ${cover.crop.y}%`,
          transform: `scale(${cover.crop.zoom})`,
          transformOrigin: `${cover.crop.x}% ${cover.crop.y}%`,
        }}
      />
    </div>
  );
}

interface PageSheetProps {
  eager?: boolean;
  page: PreviewPage;
  profile: LayoutProfileSummary;
  typography: TypographyConfig;
  pageWidth: number;
  pageHeight: number;
  /** Número de página física, contando la portada. */
  displayIndex?: number;
}

function PageSheet({
  page,
  profile,
  typography,
  pageWidth,
  pageHeight,
  displayIndex = page.index,
  eager = false,
}: PageSheetProps) {
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
      className="relative overflow-hidden border border-ink/15 bg-white text-black shadow-sm dark:bg-white"
      style={{
        width: `${pageWidth}px`,
        height: `${pageHeight}px`,
        // En un libro largo, el navegador no dibuja las páginas que no se
        // ven: el tamaño se reserva para que el salto de página siga siendo
        // exacto.
        contentVisibility: eager ? "visible" : "auto",
        containIntrinsicSize: `${pageHeight}px`,
        color: "#000000",
        fontKerning: "none",
        fontVariantLigatures: "none",
        fontSynthesis: "none",
      }}
      aria-label={`Página ${displayIndex}`}
    >
      {(page.marginBoxes ?? []).map((box) => {
        const isTop = box.position.startsWith("top");
        const fontSizePt = isTop ? 8 : 9;
        const lineMm = (fontSizePt * 25.4) / 72;

        return (
          <div
            key={box.position}
            data-page-margin-box={box.position}
            data-page-running-head={box.position === "top-center" ? "" : undefined}
            className="absolute tabular-nums"
            style={{
              top: `${
                (isTop
                  ? profile.headerDistanceMm + 2.5 - lineMm * 0.8
                  : profile.pageHeightMm - Math.max(profile.footerDistanceMm, 4) - lineMm * 0.8) *
                PX_PER_MM
              }px`,
              left: `${leftMarginMm * PX_PER_MM}px`,
              width: `${textWidthMm * PX_PER_MM}px`,
              textAlign: box.align,
              fontSize: `${fontSizePt}pt`,
              lineHeight: `${fontSizePt}pt`,
              fontFamily: FAMILIAS[typography.body.fontFamily],
              color: "#000000",
              fontKerning: "none",
              fontVariantLigatures: "none",
              fontSynthesis: "none",
            }}
          >
            <span
              style={{
                position: "relative",
                top: `${baselineCorrectionPt(
                  typography.body.fontFamily,
                  fontSizePt,
                  fontSizePt,
                )}pt`,
              }}
            >
              {box.text}
            </span>
          </div>
        );
      })}

      {page.blank ? null : (
        <div
          data-page-text
          className="absolute"
          style={{
            top: `${profile.marginTopMm * PX_PER_MM}px`,
            left: `${leftMarginMm * PX_PER_MM}px`,
            width: `${textWidthMm * PX_PER_MM}px`,
          }}
        >
          {page.blocks.map((block, blockIndex) => (
            <PreviewBlock
              key={`${block.id}-${page.index}`}
              block={block}
              drawnLines={page.drawnLines.filter((drawing) => drawing.blockIndex === blockIndex)}
            />
          ))}
        </div>
      )}

      {page.footnotes.length > 0 ? (
        <FootnoteArea
          page={page}
          typography={typography}
          topMm={profile.pageHeightMm - profile.marginBottomMm - page.footnotesHeightMm}
          leftMm={leftMarginMm}
          widthMm={textWidthMm}
        />
      ) : null}
    </div>
  );
}

interface FootnoteAreaProps {
  page: PreviewPage;
  typography: TypographyConfig;
  topMm: number;
  leftMm: number;
  widthMm: number;
}

function FootnoteArea({ page, typography, topMm, leftMm, widthMm }: FootnoteAreaProps) {
  const fontSizePt = typography.body.fontSizePt * 0.78;
  const lineHeightPt = fontSizePt * 1.3;
  const family = typography.body.fontFamily;

  return (
    <div
      className="absolute text-ink"
      aria-label="Notas al pie"
      style={{
        top: `${topMm * PX_PER_MM}px`,
        left: `${leftMm * PX_PER_MM}px`,
        width: `${widthMm * PX_PER_MM}px`,
        paddingTop: `${3 * PX_PER_MM}px`,
        fontFamily: FAMILIAS[typography.body.fontFamily] ?? FAMILIAS.serif,
        fontSize: `${fontSizePt}pt`,
        lineHeight: `${lineHeightPt}pt`,
        color: "#000000",
        fontKerning: "none",
        fontVariantLigatures: "none",
        fontSynthesis: "none",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: "35%",
          borderTop: "0.5px solid #777",
          position: "absolute",
          top: `${1 * PX_PER_MM}px`,
        }}
      />
      {page.footnotes.map((note) => (
        <div key={note.id} style={{ marginBottom: `${1.5 * PX_PER_MM}px` }}>
          {note.lines.map((line, index) => (
            <div
              key={`${note.id}-${index}`}
              style={{ height: `${lineHeightPt}pt`, whiteSpace: "nowrap" }}
            >
              <span
                style={{
                  position: "relative",
                  top: `${baselineCorrectionPt(family, fontSizePt, lineHeightPt)}pt`,
                }}
              >
                {line}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PreviewBlock({
  block,
  drawnLines,
}: {
  block: LaidOutBlock;
  drawnLines: Array<{ lineIndex: number; leftMm: number; widthMm: number; wordSpacingPt: number }>;
}) {
  const { style } = block;
  const lineHeight = style.fontSizePt * style.lineHeight;
  const firstLine = block.lines[0];
  const firstLineSegments: InlineRun[] = firstLine
    ? firstLine.segments && firstLine.segments.length > 0
      ? firstLine.segments
      : [{ text: firstLine.text }]
    : [];
  const dropCap =
    block.dropCapCharacter && firstLineSegments.length > 0
      ? extractDropCapGrapheme(firstLineSegments, block.dropCapCharacter)
      : null;

  return (
    <div
      data-block-kind={block.kind}
      style={{
        position: "relative",
        fontFamily: FAMILIAS[style.fontFamily] ?? FAMILIAS.serif,
        fontSize: `${style.fontSizePt}pt`,
        lineHeight: `${lineHeight}pt`,
        letterSpacing: `${style.letterSpacingPt}pt`,
        textAlign: "left",
        textTransform: style.uppercase ? "uppercase" : undefined,
        fontVariantCaps: style.smallCaps ? "small-caps" : undefined,
        paddingTop: `${block.spaceBeforeMm * PX_PER_MM}px`,
        paddingBottom: `${block.spaceAfterMm * PX_PER_MM}px`,
        color: "#000000",
        fontWeight: isHeadingKind(block.kind) ? 700 : undefined,
        fontKerning: "none",
        fontVariantLigatures: "none",
        fontSynthesis: "none",
        fontStyle: block.kind === "blockquote" ? "italic" : undefined,
      }}
    >
      {dropCap?.removed ? (
        // La inicial se dibuja aparte, como en el PDF: el texto de la primera
        // línea ya no la contiene y las tres primeras líneas están sangradas
        // por el motor para dejarle el hueco.
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            top: `calc(${dropCapCorrectionPt(style.fontFamily, style.fontSizePt, lineHeight, block.dropCapLines ?? 3)}pt + ${block.spaceBeforeMm * PX_PER_MM}px)`,
            fontSize: `${block.dropCapSizePt ?? style.fontSizePt * 3}pt`,
            lineHeight: `${lineHeight}pt`,
            fontFamily: FAMILIAS[style.fontFamily] ?? FAMILIAS.serif,
            fontWeight: isHeadingKind(block.kind) ? 700 : undefined,
            textTransform: style.uppercase ? "uppercase" : undefined,
            fontVariantCaps: style.smallCaps ? "small-caps" : undefined,
            color: "#000000",
            fontKerning: "none",
            fontVariantLigatures: "none",
            fontSynthesis: "none",
          }}
        >
          {block.dropCapCharacter}
        </span>
      ) : null}
      {block.kind === "rule" ? (
        <div style={{ textAlign: "center", letterSpacing: "0.4em" }}>* * *</div>
      ) : block.kind === "image" ? (
        <figure
          style={{
            margin: 0,
            textAlign:
              block.image?.alignment === "left"
                ? "left"
                : block.image?.alignment === "right"
                  ? "right"
                  : "center",
          }}
        >
          {block.image?.src ? (
            /*
             * La vista previa es un lienzo de impresión: la imagen se dibuja
             * con su tamaño exacto en milímetros y con su alineación, como en
             * el PDF. El optimizador de imágenes de Next redimensionaría y
             * recortaría, que aquí no es lo que se quiere.
             */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.image.src}
              alt={block.image.alt ?? ""}
              style={{
                width: block.imageLayout ? `${block.imageLayout.widthMm * PX_PER_MM}px` : "100%",
                height: block.imageLayout ? `${block.imageLayout.heightMm * PX_PER_MM}px` : "auto",
                objectFit: "contain",
              }}
            />
          ) : (
            <div
              style={{
                width: block.imageLayout ? `${block.imageLayout.widthMm * PX_PER_MM}px` : "100%",
                height: block.imageLayout ? `${block.imageLayout.heightMm * PX_PER_MM}px` : "auto",
                border: "1px dashed var(--color-ink-muted, #888)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontStyle: "italic",
                opacity: 0.7,
              }}
            >
              {block.image?.alt ?? "Imagen"}
            </div>
          )}
          {block.imageLayout && block.imageLayout.captionLines.length > 0 ? (
            <figcaption
              style={{
                fontSize: `${block.imageLayout.captionFontSizePt}pt`,
                lineHeight: `${block.imageLayout.captionLineHeightMm * PX_PER_MM}px`,
                marginTop: `${block.imageLayout.captionGapMm * PX_PER_MM}px`,
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              {block.imageLayout.captionLines.join(" ")}
            </figcaption>
          ) : null}
        </figure>
      ) : (
        block.lines.map((line, index) => {
          const placement = drawnLines[index];
          // El motor reserva el hueco de la inicial pero deja la letra en el
          // texto; aquí se quita exactamente el grafema que se dibuja aparte,
          // conservando comillas, rayas y signos de apertura.
          const segments: InlineRun[] =
            index === 0 && dropCap
              ? dropCap.segments
              : line.segments && line.segments.length > 0
                ? line.segments
                : [{ text: line.text }];

          return (
            <div
              key={`${block.id}-${index}`}
              style={{
                height: `${lineHeight}pt`,
                lineHeight: `${lineHeight}pt`,
                whiteSpace: "nowrap",
                textAlign: "left",
                position: "relative",
                left: `${(placement?.leftMm ?? 0) * PX_PER_MM}px`,
                width: `${(placement?.widthMm ?? 0) * PX_PER_MM}px`,
                wordSpacing: `${placement?.wordSpacingPt ?? 0}pt`,
              }}
            >
              <span
                style={{
                  position: "relative",
                  top: `${baselineCorrectionPt(style.fontFamily, style.fontSizePt, lineHeight)}pt`,
                }}
              >
                {segments.map((segment, segmentIndex) => {
                  const text = segment.text;

                  if (text.length === 0) {
                    return null;
                  }

                  const marks = segment.marks;

                  if (!marks) {
                    return <span key={segmentIndex}>{text}</span>;
                  }

                  const decorations = [
                    marks.underline ? "underline" : null,
                    marks.strike ? "line-through" : null,
                  ].filter(Boolean);

                  return (
                    <span
                      key={segmentIndex}
                      title={
                        segment.footnote
                          ? `Nota ${segment.footnote.number}: ${segment.footnote.note}`
                          : undefined
                      }
                      style={{
                        fontWeight: marks.bold ? 700 : undefined,
                        fontStyle: marks.italic ? "italic" : undefined,
                        textDecoration: decorations.length > 0 ? decorations.join(" ") : undefined,
                        position: marks.superscript || marks.subscript ? "relative" : undefined,
                        top: marks.superscript
                          ? `${-style.fontSizePt * 0.38}pt`
                          : marks.subscript
                            ? `${style.fontSizePt * 0.18}pt`
                            : undefined,
                        lineHeight: marks.superscript || marks.subscript ? 0 : undefined,
                        fontSize: marks.superscript || marks.subscript ? "0.72em" : undefined,
                        fontFamily: marks.code ? FAMILIAS.monospace : undefined,
                        ...(marks.link ? { textDecoration: "underline" } : {}),
                      }}
                    >
                      {text}
                    </span>
                  );
                })}
              </span>
              {line.toc ? (
                <>
                  {line.toc.leaderStartMm !== null && line.toc.leaderEndMm !== null ? (
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        left: `${line.toc.leaderStartMm * PX_PER_MM}px`,
                        width: `${(line.toc.leaderEndMm - line.toc.leaderStartMm) * PX_PER_MM}px`,
                        top: "0.62em",
                        borderTop: `0.25pt ${line.toc.dotted ? "dotted" : "solid"} #000000`,
                      }}
                    />
                  ) : null}
                  <span
                    style={{
                      position: "absolute",
                      left: `${line.toc.xMm * PX_PER_MM}px`,
                      top: 0,
                    }}
                  >
                    {line.toc.text}
                  </span>
                </>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

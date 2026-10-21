import { describe, expect, it } from "vitest";
import { measureTextMm } from "./measure";
import {
  lineHeightMm,
  paginate,
  textBlockSize,
  type LayoutBlock,
  type PageGeometry,
} from "./pagination";
import type { TypographyConfig } from "./typography";

/**
 * Geometría de laboratorio: 100 × 100 mm con márgenes de 10 mm, de modo que
 * el área de texto mide 80 × 80 mm. Con un cuerpo de 10 pt e interlineado 1
 * caben 22 líneas por página.
 */
const GEOMETRY: PageGeometry = {
  pageWidthMm: 100,
  pageHeightMm: 100,
  marginTopMm: 10,
  marginBottomMm: 10,
  marginInnerMm: 10,
  marginOuterMm: 10,
  chapterStartsRecto: true,
};

const ESTILO: TypographyConfig["body"] = {
  fontFamily: "serif",
  fontSizePt: 10,
  lineHeight: 1,
  spaceBeforePt: 0,
  spaceAfterPt: 0,
  alignment: "justify",
  firstLineIndentMm: 0,
  letterSpacingPt: 0,
  uppercase: false,
  smallCaps: false,
  hyphenation: false,
  keepWithNext: false,
};

const TIPOGRAFIA: TypographyConfig = {
  body: ESTILO,
  heading1: { ...ESTILO, alignment: "left", keepWithNext: true },
  heading2: ESTILO,
  heading3: ESTILO,
  heading4: ESTILO,
  blockquote: ESTILO,
  code: ESTILO,
  list: ESTILO,
  firstParagraph: ESTILO,
  widowOrphan: { minLinesAtBottom: 2, minLinesAtTop: 2 },
  firstParagraphNoIndent: true,
  bodyFirstLineIndentMm: 0,
};

/** Texto de N palabras. */
function palabras(count: number): string {
  return Array.from({ length: count }, (_, index) => `palabra${index}`).join(" ");
}

/**
 * Texto de N palabras de la misma longitud, para que la medida sea exacta.
 */
function palabrasiguales(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => `palabra${index.toString().padStart(4, "0")}`,
  ).join(" ");
}

/** Palabras que caben en una línea con la geometría del laboratorio. */
const PALABRAS_POR_LINEA = Math.floor(
  (80 + measureTextMm(" ", ESTILO)) /
    (measureTextMm("palabra0000", ESTILO) + measureTextMm(" ", ESTILO)),
);

/** Líneas que caben en una página. */
const LINEAS_POR_PAGINA = Math.floor(80 / lineHeightMm(ESTILO));

function bloque(id: string, text: string, extra: Partial<LayoutBlock> = {}): LayoutBlock {
  return { id, kind: "body", text, ...extra };
}

describe("textBlockSize", () => {
  it("descuenta los márgenes y el medianil del área de texto", () => {
    const size = textBlockSize({
      ...GEOMETRY,
      gutterMm: 4,
    });

    expect(size.widthMm).toBe(76);
    expect(size.heightMm).toBe(80);
  });
});

describe("paginate", () => {
  it("coloca un texto corto en una sola página", () => {
    const resultado = paginate([bloque("b1", "una página")], GEOMETRY, TIPOGRAFIA);

    expect(resultado.pages).toHaveLength(1);
    expect(resultado.pages[0]?.blocks).toHaveLength(1);
  });

  it("reparte un texto largo en varias páginas sin perder palabras", () => {
    const texto = palabras(400);
    const resultado = paginate([bloque("b1", texto)], GEOMETRY, TIPOGRAFIA);

    expect(resultado.pages.length).toBeGreaterThan(1);

    const recompuesto = resultado.pages
      .flatMap((page) => page.blocks)
      .flatMap((bloqueCompuesto) => bloqueCompuesto.lines)
      .map((linea) => linea.text)
      .join(" ");

    expect(recompuesto).toBe(texto);
  });

  it("numera los folios de forma correlativa", () => {
    const resultado = paginate([bloque("b1", palabras(400))], GEOMETRY, TIPOGRAFIA);

    resultado.pages.forEach((page, index) => {
      expect(page.folio).toBe(index + 1);
    });
  });

  it("alterna páginas rectas y versos", () => {
    const resultado = paginate([bloque("b1", palabras(400))], GEOMETRY, TIPOGRAFIA);

    expect(resultado.pages[0]?.side).toBe("recto");
    expect(resultado.pages[1]?.side).toBe("verso");
    expect(resultado.pages[2]?.side).toBe("recto");
  });

  it("empieza la numeración en la página que se le indique", () => {
    const resultado = paginate(
      [bloque("b1", "texto")],
      { ...GEOMETRY, firstPageNumber: 7 },
      TIPOGRAFIA,
    );

    expect(resultado.pages[0]?.folio).toBe(7);
  });

  it("parte un párrafo que ocupa más de una página", () => {
    const resultado = paginate([bloque("b1", palabras(400))], GEOMETRY, TIPOGRAFIA);

    const continuaciones = resultado.pages
      .flatMap((page) => page.blocks)
      .filter((bloqueCompuesto) => bloqueCompuesto.continued);

    expect(continuaciones.length).toBeGreaterThan(0);
  });

  it("hace que un capítulo empiece en página recta insertando una en blanco", () => {
    // Un texto que llena exactamente una página: el capítulo siguiente
    // caería en una página verso y hay que insertar una en blanco.
    const resultado = paginate(
      [
        bloque("b1", palabras(300), { sectionTitle: "Primero" }),
        bloque("b2", "abre el capítulo", { startsChapter: true, sectionTitle: "Segundo" }),
      ],
      GEOMETRY,
      TIPOGRAFIA,
    );

    const enBlanco = resultado.pages.filter((page) => page.blank);

    expect(enBlanco.length).toBeGreaterThan(0);

    const indiceCapitulo = resultado.pages.findIndex((page) =>
      page.blocks.some((bloqueCompuesto) => bloqueCompuesto.startsChapter),
    );

    expect(resultado.pages[indiceCapitulo]?.side).toBe("recto");
  });

  it("avisa de la página en blanco que se inserta", () => {
    const resultado = paginate(
      [
        bloque("b1", palabras(300), { sectionTitle: "Primero" }),
        bloque("b2", "abre el capítulo", { startsChapter: true, sectionTitle: "Segundo" }),
      ],
      GEOMETRY,
      TIPOGRAFIA,
    );

    expect(
      resultado.diagnostics.some((diagnostico) => diagnostico.code === "CHAPTER_NOT_ON_RECTO"),
    ).toBe(true);
  });

  it("no inserta página en blanco si el capítulo ya cae en recto", () => {
    const resultado = paginate(
      [bloque("b1", "abre el capítulo", { startsChapter: true })],
      GEOMETRY,
      TIPOGRAFIA,
    );

    expect(resultado.pages.filter((page) => page.blank)).toHaveLength(0);
  });

  it("avisa de una viuda cuando la continuación quedaría con muy pocas líneas", () => {
    // Un párrafo que llena una página y sobra una línea: la continuación
    // quedaría con una sola línea arriba.
    const total = LINEAS_POR_PAGINA * PALABRAS_POR_LINEA + 1;
    const resultado = paginate([bloque("b1", palabrasiguales(total))], GEOMETRY, TIPOGRAFIA);

    const viudas = resultado.diagnostics.filter((diagnostico) => diagnostico.code === "WIDOW");

    expect(viudas.length).toBeGreaterThan(0);
  });

  it("la continuación de un párrafo nunca queda con menos de dos líneas", () => {
    for (const extra of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const total = LINEAS_POR_PAGINA * PALABRAS_POR_LINEA + extra;
      const resultado = paginate([bloque("b1", palabrasiguales(total))], GEOMETRY, TIPOGRAFIA);

      for (const page of resultado.pages) {
        const primero = page.blocks[0];

        if (primero?.continued) {
          expect(primero.lines.length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("avisa de una huérfana cuando quedan muy pocas líneas al pie", () => {
    // El primer bloque deja una sola línea libre: el segundo no debe
    // arrancar con una línea suelta al pie.
    const primero = LINEAS_POR_PAGINA * PALABRAS_POR_LINEA - PALABRAS_POR_LINEA;
    const resultado = paginate(
      [bloque("b1", palabrasiguales(primero)), bloque("b2", palabrasiguales(5))],
      GEOMETRY,
      TIPOGRAFIA,
    );

    const huerfanas = resultado.diagnostics.filter((diagnostico) => diagnostico.code === "ORPHAN");

    expect(huerfanas.length).toBeGreaterThan(0);
  });

  it("no deja un párrafo con una sola línea al pie de una página", () => {
    const primero = LINEAS_POR_PAGINA * PALABRAS_POR_LINEA - PALABRAS_POR_LINEA;
    const resultado = paginate(
      [bloque("b1", palabrasiguales(primero)), bloque("b2", palabrasiguales(5))],
      GEOMETRY,
      TIPOGRAFIA,
    );

    for (const page of resultado.pages) {
      const ultimo = page.blocks[page.blocks.length - 1];

      if (ultimo && !ultimo.continued && ultimo.kind === "body") {
        // Un bloque que no continúa de otro no puede haber dejado una sola
        // línea suelta al pie: si lo hizo, el motor lo habría movido.
        expect(ultimo.lines.length).toBeGreaterThan(1);
      }
    }
  });

  it("no deja un título solo al pie de la página", () => {
    const resultado = paginate(
      [
        bloque("b1", palabras(21), { sectionTitle: "Capítulo" }),
        { id: "t1", kind: "heading1", text: "Un título" },
        bloque("b2", palabras(40)),
      ],
      GEOMETRY,
      TIPOGRAFIA,
    );

    for (const page of resultado.pages) {
      const ultimo = page.blocks[page.blocks.length - 1];

      if (ultimo?.kind === "heading1") {
        // El título queda al pie sin texto debajo: no debería ocurrir.
        expect(page.blocks.length).toBeGreaterThan(1);
      }
    }
  });

  it("avisa de una palabra más ancha que el área de texto", () => {
    const larga = "a".repeat(80);
    const resultado = paginate([bloque("b1", larga)], GEOMETRY, TIPOGRAFIA);

    expect(resultado.diagnostics.some((diagnostico) => diagnostico.code === "LONG_WORD")).toBe(
      true,
    );
  });

  it("recoge el título de la sección como encabezado de página", () => {
    const resultado = paginate(
      [bloque("b1", palabras(300), { sectionTitle: "El velo de la tarde" })],
      GEOMETRY,
      TIPOGRAFIA,
    );

    expect(resultado.pages[0]?.runningHead).toBe("El velo de la tarde");
  });

  it("informa del tamaño del área de texto", () => {
    const resultado = paginate([bloque("b1", "texto")], GEOMETRY, TIPOGRAFIA);

    expect(resultado.textWidthMm).toBe(80);
    expect(resultado.textHeightMm).toBe(80);
  });

  it("no inventa páginas vacías al final", () => {
    const resultado = paginate([bloque("b1", "texto")], GEOMETRY, TIPOGRAFIA);

    expect(resultado.pages).toHaveLength(1);
  });

  it("devuelve una página en blanco cuando no hay contenido", () => {
    const resultado = paginate([], GEOMETRY, TIPOGRAFIA);

    expect(resultado.pages).toHaveLength(1);
    expect(resultado.pages[0]?.blank).toBe(true);
  });

  it("reserva el espacio anterior y posterior al ajustar una imagen con pie", () => {
    const tipografia = {
      ...TIPOGRAFIA,
      body: { ...ESTILO, spaceBeforePt: 20, spaceAfterPt: 20 },
    };
    const resultado = paginate(
      [
        {
          id: "img1",
          kind: "image",
          text: "",
          image: {
            src: "https://res.cloudinary.com/demo/image/upload/plaza.jpg",
            widthPx: 1200,
            heightPx: 4000,
            widthPercent: 100,
            caption:
              "Una plaza pequeña al anochecer, con las farolas encendidas y el suelo mojado por la lluvia.",
          },
        },
      ],
      GEOMETRY,
      tipografia,
    );
    const page = resultado.pages[0];
    const layout = page?.blocks[0]?.imageLayout;

    expect(page?.usedHeightMm).toBeLessThanOrEqual(80.001);
    expect(layout?.captionLines.length).toBeGreaterThan(0);
    expect(layout?.heightMm).toBeLessThan(65);
  });

  it("conserva los tramos con formato en las líneas compuestas", () => {
    const resultado = paginate(
      [
        {
          id: "b1",
          kind: "body",
          text: "La noche era oscura.",
          runs: [
            { text: "La " },
            { text: "noche", marks: { bold: true } },
            { text: " era " },
            { text: "oscura", marks: { italic: true } },
            { text: "." },
          ],
        },
      ],
      GEOMETRY,
      TIPOGRAFIA,
    );

    const lineas = resultado.pages[0]?.blocks[0]?.lines ?? [];

    expect(lineas).toHaveLength(1);
    expect(lineas[0]?.segments?.find((segment) => segment.text === "noche")?.marks?.bold).toBe(
      true,
    );
    expect(lineas[0]?.segments?.find((segment) => segment.text === "oscura")?.marks?.italic).toBe(
      true,
    );
  });
});

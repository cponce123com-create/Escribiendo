import { describe, expect, it } from "vitest";
import { measureTextMm, type MeasureText } from "./measure";
import {
  CHAPTER_TITLE_SINK_PT,
  isHeadingKind,
  lineHeightMm,
  paginate,
  textBlockSize,
  type LaidOutPage,
  type LayoutBlock,
  type PageGeometry,
} from "./pagination";
import type { InlineRun } from "./rich-text";
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
  it("compone el titulo de seccion y no lo repite como encabezado en su pagina", () => {
    const resultado = paginate(
      [
        {
          id: "t1",
          kind: "title",
          text: "Prologo",
          sectionId: "s1",
          sectionTitle: "Prologo",
          startsChapter: true,
        },
        bloque("b1", "Primera linea del prologo.", {
          sectionId: "s1",
          sectionTitle: "Prologo",
        }),
        bloque("b2", palabras(200), {
          sectionId: "s1",
          sectionTitle: "Prologo",
        }),
      ],
      { ...GEOMETRY, chapterStartsRecto: false },
      TIPOGRAFIA,
    );

    expect(resultado.pages[0]?.blocks[0]?.kind).toBe("title");
    expect(resultado.pages[0]?.runningHead).toBeNull();
    expect(resultado.pages.some((page) => page.runningHead === "Prologo")).toBe(true);
  });

  it("compone un libro de mas de cien paginas conservando titulos y encabezados", () => {
    const bloques: LayoutBlock[] = [];

    for (let index = 0; index < 120; index += 1) {
      const sectionId = `s${index}`;
      const title = `Capitulo ${index + 1}`;

      bloques.push({
        id: `${sectionId}-t`,
        kind: "title",
        text: title,
        sectionId,
        sectionTitle: title,
        startsChapter: index > 0,
      });
      bloques.push(
        bloque(`${sectionId}-b`, palabras(80), {
          sectionId,
          sectionTitle: title,
        }),
      );
    }

    const resultado = paginate(bloques, { ...GEOMETRY, chapterStartsRecto: false }, TIPOGRAFIA);

    expect(resultado.pages.length).toBeGreaterThanOrEqual(100);
    expect(
      resultado.pages.filter((page) => page.blocks.some((b) => b.kind === "title")),
    ).toHaveLength(120);
    expect(
      resultado.pages.every(
        (page) => page.runningHead === null || page.runningHead.startsWith("Capitulo "),
      ),
    ).toBe(true);
  });

  it("registra la sangría solo en el primer fragmento del párrafo", () => {
    const result = paginate([bloque("b1", palabras(500), { firstOfSection: false })], GEOMETRY, {
      ...TIPOGRAFIA,
      body: { ...TIPOGRAFIA.body, firstLineIndentMm: 4 },
    });
    const fragments = result.pages.flatMap((page) => page.blocks);

    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments[0]?.firstLineIndentMm).toBe(4);
    expect(fragments.slice(1).every((fragment) => fragment.firstLineIndentMm === 0)).toBe(true);
  });

  it("reserva el ancho de la inicial capitular en las tres primeras líneas", () => {
    const texto = palabrasiguales(40);
    const normal = paginate([bloque("normal", texto)], GEOMETRY, TIPOGRAFIA).pages[0]?.blocks[0];
    const capitular = paginate(
      [bloque("capitular", texto, { dropCapCharacter: "A" })],
      GEOMETRY,
      TIPOGRAFIA,
    ).pages[0]?.blocks[0];

    expect(capitular?.dropCapIndentMm).toBeGreaterThan(0);
    expect(capitular?.lines[0]?.text.length).toBeLessThan(normal?.lines[0]?.text.length ?? 0);
    expect(capitular?.lines[1]?.text.length).toBeLessThan(normal?.lines[1]?.text.length ?? 0);
    expect(capitular?.lines[2]?.text.length).toBeLessThan(normal?.lines[2]?.text.length ?? 0);
  });

  it("aplica al título de capítulo heading1 más la caída solicitada", () => {
    const result = paginate(
      [bloque("titulo", "Capítulo uno", { kind: "chapterTitle" })],
      GEOMETRY,
      {
        ...TIPOGRAFIA,
        heading1: { ...TIPOGRAFIA.heading1, spaceBeforePt: 12 },
      },
    );
    const title = result.pages[0]?.blocks[0];

    expect(title?.spaceBeforeMm).toBeCloseTo(((12 + CHAPTER_TITLE_SINK_PT) * 25.4) / 72);
    expect(isHeadingKind("chapterTitle")).toBe(true);
    expect(isHeadingKind("heading3")).toBe(true);
    expect(isHeadingKind("body")).toBe(false);
  });

  it("coloca un texto corto en una sola página", () => {
    const resultado = paginate([bloque("b1", "una página")], GEOMETRY, TIPOGRAFIA);

    expect(resultado.pages).toHaveLength(1);
    expect(resultado.pages[0]?.blocks).toHaveLength(1);
  });

  it("usa el medidor real para decidir los cortes de línea", () => {
    let llamadas = 0;
    const medir: MeasureText = (text) => {
      llamadas += 1;

      return text.length * 20;
    };
    const resultado = paginate(
      [bloque("b1", "uno dos tres cuatro cinco")],
      GEOMETRY,
      TIPOGRAFIA,
      medir,
    );

    expect(llamadas).toBeGreaterThan(0);
    expect(resultado.pages[0]?.blocks[0]?.lines.length).toBeGreaterThan(1);
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
        bloque("b1", palabrasiguales(LINEAS_POR_PAGINA * PALABRAS_POR_LINEA), {
          sectionTitle: "Primero",
        }),
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
        bloque("b1", palabrasiguales(LINEAS_POR_PAGINA * PALABRAS_POR_LINEA), {
          sectionTitle: "Primero",
        }),
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

  it("el capítulo empieza en una página nueva", () => {
    const resultado = paginate(
      [
        bloque("b1", "texto del capítulo primero", { sectionTitle: "Primero" }),
        bloque("b2", "abre el capítulo", { startsChapter: true, sectionTitle: "Segundo" }),
      ],
      GEOMETRY,
      TIPOGRAFIA,
    );

    const paginaDelCapitulo = resultado.pages.find((page) =>
      page.blocks.some((compuesto) => compuesto.startsChapter),
    );

    expect(paginaDelCapitulo).toBeDefined();
    // El capítulo es lo primero de su página: no comparte página con el
    // capítulo anterior.
    expect(paginaDelCapitulo?.blocks[0]?.startsChapter).toBe(true);
  });

  it("nunca marca como en blanco una página que tiene contenido", () => {
    // El texto deja la página a medias y el capítulo siguiente obliga a
    // cerrar la página: esa página tiene contenido y no puede estar en blanco.
    const resultado = paginate(
      [
        bloque("b1", palabras(120), { sectionTitle: "Primero" }),
        bloque("b2", "abre el capítulo", { startsChapter: true, sectionTitle: "Segundo" }),
      ],
      GEOMETRY,
      TIPOGRAFIA,
    );

    const conContenido = resultado.pages.filter((page) => page.blank && page.blocks.length > 0);

    expect(conContenido).toHaveLength(0);
  });

  it("la página en blanco insertada no tiene bloques", () => {
    const resultado = paginate(
      [
        bloque("b1", palabrasiguales(LINEAS_POR_PAGINA * PALABRAS_POR_LINEA), {
          sectionTitle: "Primero",
        }),
        bloque("b2", "abre el capítulo", { startsChapter: true, sectionTitle: "Segundo" }),
      ],
      GEOMETRY,
      TIPOGRAFIA,
    );

    const enBlanco = resultado.pages.filter((page) => page.blank);

    expect(enBlanco.length).toBeGreaterThan(0);

    for (const page of enBlanco) {
      expect(page.blocks).toHaveLength(0);
    }
  });

  it("un bloque con salto propio empieza en una página nueva", () => {
    const resultado = paginate(
      [bloque("b1", "primera parte"), bloque("b2", "segunda parte", { breaksBefore: true })],
      GEOMETRY,
      TIPOGRAFIA,
    );

    expect(resultado.pages.length).toBeGreaterThan(1);
    expect(resultado.pages[1]?.blocks[0]?.id).toBe("b2");
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

  it("compone la nota al pie en la página de su llamada y reserva su altura", () => {
    const runs: InlineRun[] = [
      { text: "Una llamada" },
      {
        text: "1",
        marks: { superscript: true },
        footnote: {
          id: "nota-1",
          number: 1,
          note: "Una nota breve que debe quedar al pie de la misma página.",
        },
      },
      { text: " y el resto del párrafo." },
    ];
    const resultado = paginate(
      [bloque("b1", "Una llamada1 y el resto del párrafo.", { runs })],
      GEOMETRY,
      TIPOGRAFIA,
    );
    const pagina = resultado.pages[0];

    expect(pagina?.footnotes).toHaveLength(1);
    expect(pagina?.footnotes[0]?.lines[0]).toMatch(/^1\. /u);
    expect(pagina?.footnotesHeightMm).toBeGreaterThan(0);
    expect(pagina?.usedHeightMm).toBeLessThanOrEqual(80.001);
    expect(pagina?.blocks[0]?.lines[0]?.segments?.some((segment) => segment.footnote)).toBe(true);
  });

  it("descuenta la nota del espacio disponible para las líneas", () => {
    const texto = palabras(300);
    const runs: InlineRun[] = [
      {
        text: "1",
        marks: { superscript: true },
        footnote: {
          id: "nota-1",
          number: 1,
          note: "Una nota que ocupa varias líneas y obliga a mover texto a la página siguiente para que no se solapen.",
        },
      },
      { text: ` ${texto}` },
    ];
    const resultado = paginate([bloque("b1", `1 ${texto}`, { runs })], GEOMETRY, TIPOGRAFIA);
    const lineasPrimera = resultado.pages[0]?.blocks[0]?.lines.length ?? 0;

    expect(resultado.pages.length).toBeGreaterThan(1);
    expect(lineasPrimera).toBeLessThan(LINEAS_POR_PAGINA);
    expect(resultado.pages[0]?.footnotes).toHaveLength(1);
    expect(resultado.pages[0]?.usedHeightMm).toBeLessThanOrEqual(80.001);
  });
});

describe("physical parity with a cover", () => {
  it("starts chapters on physical recto while keeping body folios independent", () => {
    const geometry = {
      pageWidthMm: 148,
      pageHeightMm: 210,
      marginTopMm: 20,
      marginBottomMm: 20,
      marginInnerMm: 18,
      marginOuterMm: 14,
      chapterStartsRecto: true,
      physicalPageOffset: 1,
    };
    const result = paginate(
      [{ id: "title", kind: "title", text: "Chapter", startsChapter: true }],
      geometry,
      {},
    );
    expect(result.pages[0]?.blank).toBe(true);
    expect(result.pages[0]?.side).toBe("verso");
    expect(result.pages[1]?.side).toBe("recto");
    expect(result.pages[1]?.folio).toBe(2);
  });
});

/** Altura ocupada por los bloques compuestos de una página. */
function alturaOcupada(page: LaidOutPage | undefined): number {
  return (page?.blocks ?? []).reduce(
    (total, block) =>
      total +
      block.spaceBeforeMm +
      block.lines.length * lineHeightMm(block.style) +
      block.spaceAfterMm,
    0,
  );
}

describe("anclaje de la región inferior de una materia", () => {
  it("lleva el primer bloque anclado al pie del área de texto", () => {
    const blocks: LayoutBlock[] = [
      { id: "top", kind: "body", text: "© 2026 Autora. Todos los derechos reservados." },
      { id: "bottom-1", kind: "body", text: "ISBN: 978-84-376-0494-7", bottomAnchor: true },
      {
        id: "bottom-2",
        kind: "body",
        text: "Impreso por Imprenta del Pacífico.",
        bottomAnchor: true,
      },
    ];

    const result = paginate(blocks, GEOMETRY, TIPOGRAFIA);
    const page = result.pages[0];
    const primeroInferior = page?.blocks.find((block) => block.id === "bottom-1");

    expect(result.pages).toHaveLength(1);
    expect(primeroInferior?.spaceBeforeMm).toBeGreaterThan(0);
    expect(page?.blocks.at(-1)?.id).toBe("bottom-2");
    expect(alturaOcupada(page)).toBeCloseTo(80, 5);
  });

  it("ancla la región inferior en la página en la que cae", () => {
    const blocks: LayoutBlock[] = [
      { id: "top", kind: "body", text: palabras(400) },
      { id: "bottom", kind: "body", text: "Créditos de edición.", bottomAnchor: true },
    ];

    const result = paginate(blocks, GEOMETRY, TIPOGRAFIA);
    const ultima = result.pages.at(-1);

    expect(result.pages.length).toBeGreaterThan(1);
    expect(ultima?.blocks.some((block) => block.id === "bottom")).toBe(true);
    expect(alturaOcupada(ultima)).toBeCloseTo(80, 5);
  });
});

describe("páginas maestras", () => {
  it("cambia de marco y cierra la página al entrar en una sección con master", () => {
    const result = paginate(
      [
        bloque("cuerpo", palabrasiguales(PALABRAS_POR_LINEA * 2)),
        bloque("apendice", palabrasiguales(PALABRAS_POR_LINEA), { pageMaster: "apendice" }),
      ],
      GEOMETRY,
      TIPOGRAFIA,
      undefined,
      {
        apendice: {
          pageWidthMm: 120,
          marginInnerMm: 30,
          marginOuterMm: 30,
        },
      },
    );

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]?.frame?.marginInnerMm).toBe(10);
    expect(result.pages[1]?.frame).toMatchObject({
      pageWidthMm: 120,
      marginInnerMm: 30,
      marginOuterMm: 30,
    });
    expect(result.pages[1]?.pageMaster).toBe("apendice");
    expect(result.pages[1]?.totalHeightMm).toBe(80);
  });

  it("ignora un master que no existe en el mapa", () => {
    const result = paginate(
      [bloque("uno", palabrasiguales(5), { pageMaster: "inexistente" })],
      GEOMETRY,
      TIPOGRAFIA,
      undefined,
      {},
    );

    expect(result.pages[0]?.pageMaster).toBeUndefined();
    expect(result.pages[0]?.frame?.pageWidthMm).toBe(100);
  });

  it("conserva folio y lado al cambiar de master", () => {
    const result = paginate(
      [bloque("uno", "Texto"), bloque("dos", "Más texto", { pageMaster: "otro" })],
      GEOMETRY,
      TIPOGRAFIA,
      undefined,
      { otro: { marginTopMm: 20 } },
    );

    expect(result.pages.map((page) => page.folio)).toEqual([1, 2]);
    expect(result.pages.map((page) => page.side)).toEqual(["recto", "verso"]);
    expect(result.pages[1]?.frame?.marginTopMm).toBe(20);
  });
});

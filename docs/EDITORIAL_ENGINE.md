# Motor editorial

Este documento describe cómo un manuscrito guardado en Tiptap se convierte en
páginas compuestas y en archivos exportados. Es el contrato entre el editor,
la vista previa y los escritores de PDF, EPUB y DOCX.

## 1. Recorrido del manuscrito

```
BookSection.content (Tiptap JSON)
        │
        ├── apps/web/src/lib/layout/blocks.ts ──► LayoutBlock[] (vista previa y PDF)
        │        └── inline.ts lee las marcas
        │
        └── apps/web/src/lib/export/manuscript.ts ──► ManuscriptBlock[] (EPUB y DOCX)
                 └── inline.ts lee las marcas
                          │
                          ▼
        packages/editorial-engine: paginate() ──► LaidOutPage[]
                          │
                          ▼
        apps/web/src/lib/export/generate.ts ──► PdfPage[] ──► buildPdf()
                                             └──► ExportDocumentModel ──► buildEpub() / buildDocx()
```

La vista previa y el PDF comparten la misma paginación. El EPUB y el DOCX son
reflowables: no pasan por la maqueta, pero conservan el mismo formato en línea.

## 2. Geometría y tipografía

- `PageGeometry` define el tamaño de hoja, los cuatro márgenes, si el capítulo
  abre en página par y el número del primer folio.
- `TypographyConfig` define un estilo por clase de bloque (`body`,
  `firstParagraph`, `heading1`…`heading4`, `blockquote`, `code`, `list`) y las
  reglas de viudas y huérfanas.
- `withTypographyDefaults()` completa cualquier configuración parcial. Un
  perfil guardado antes de que existiera un campo sigue siendo válido.
- Los formatos de página (A5, A6, 6 × 9 pulgadas, etc.) viven en
  `page-formats.ts`; la validación de geometría en `layout-validation.ts`.
- Cada plantilla de sistema lleva además un `TemplatePagePreset` con la
  página, los márgenes, el sangrado, los folios y la apertura de capítulo.
  Al aplicar una plantilla, `ensureTemplateProfile()` crea o reutiliza un
  perfil del estudio con esos valores y lo vincula a la edición. El flujo
  principal solo pide la plantilla; los perfiles quedan en «Ajustes
  avanzados» y, al volver a aplicar la plantilla, recuperan el preset.
- La plantilla sigue primando para la tipografía y el perfil para la
  geometría. El perfil automático se llama `Plantilla: <nombre>` y no se
  elige a mano.

## 3. Medición del texto

`measure.ts` no carga fuentes reales: mide con un modelo determinista de anchos
medios por carácter (estrecho, ancho, mayúscula, dígito, minúscula, espacio) y
un factor por familia (serif 1,00; palo seco 1,06; monoespaciada 1,20).

- `letterSpacingPt` se suma por carácter.
- `uppercase` y `smallCaps` transforman antes de medir.
- La negrita se mide con `BOLD_FACTOR = 1,03`, porque una negra real ocupa algo
  más que su redonda. No se simula engordando el cuerpo.
- El resultado es una **estimación**. La paginación definitiva de un PDF con
  fuentes incrustadas necesita la tabla de anchos de la fuente; hoy no se
  incrusta ninguna.

## 4. Modelo de tramos con formato

`rich-text.ts` define:

```ts
interface InlineMarks {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  code?: boolean;
  link?: string;
}

interface InlineRun {
  text: string;
  marks?: InlineMarks;
}
```

`LayoutBlock` lleva `text` (plano, para medir y contar palabras) y
`runs` (los tramos con formato). El invariante es que
`runsToText(runs) === text`; las pruebas lo comprueban.

### Reparto de líneas

`breakRunsIntoLines(runs, options)`:

1. Si ningún tramo lleva marcas, delega en `breakIntoLines(text, options)`.
   Es el camino rápido y produce exactamente el mismo resultado que antes.
2. Si hay marcas, convierte los tramos en palabras con sus segmentos, mide cada
   segmento con su estilo y reparte con el mismo criterio codicioso.
3. El guionado solo corta por un guion ya existente (`-`, `‐`, `‑`, `–`, `—`,
   `/`). No inventa divisiones silábicas.
4. Cada línea resultante (`RichLine`) conserva sus `segments`, de modo que el
   formato sobrevive al salto de línea.

La paginación copia esos segmentos a `LaidOutLine.segments`. La vista previa y
el PDF los consumen; ningún paso intermedio los vuelve a aplanar.

## 5. Paginación

`paginate(blocks, geometry, typography)` compone por **altura**, no por número
de líneas: un título de 20 pt y un cuerpo de 11 pt conviven en la misma página.

- Apertura de capítulo en página par: inserta una página en blanco si hace
  falta y emite el diagnóstico `CHAPTER_NOT_ON_RECTO`.
- Viudas y huérfanas: `WIDOW` y `ORPHAN`, con los mínimos configurados.
- Desbordes: `OVERFLOW` cuando una palabra no cabe ni partida.
- Palabras largas: `LONG_WORD` cuando el texto de un bloque no cabe en el área.
- Separadores de escena e imágenes: ocupan su altura sin líneas de texto. La
  vista previa dibuja `* * *`; el PDF también.

`LaidOutPage` guarda `blocks`, `usedHeightMm`, `totalHeightMm`, `side`
(recto/verso), `folio` y `blank`.

## 6. Exportación

### PDF

- Fuentes estándar: Times-Roman, Times-Bold, Times-Italic y Times-BoldItalic.
  No se incrustan.
- Codificación WinAnsi con tabla de equivalencias para la tipografía española.
  Lo que no se puede representar se sustituye por `□` y se **cuenta** en
  `caracteresPerdidos`; la interfaz lo avisa.
- Un `PdfRun` por tramo, con su fuente, tamaño, posición y, si procede,
  subrayado, tachado y desplazamiento de línea base (`Ts`).
- El justificado reparte el ancho sobrante entre los espacios de la línea.
- Los títulos se miden en negrita, que es como se dibujan.

### EPUB

- XHTML por capítulo, `nav.xhtml`, `package.opf`, `style.css` y `mimetype` como
  primera entrada del ZIP.
- Formato en línea: `<strong>`, `<em>`, `<u>`, `<s>`, `<sup>`, `<sub>` y `<a>`.
- Separadores: `<hr class="scene"/>`.
- Imágenes: `<figure><img src="…">` y `properties="remote-resources"` en el
  manifiesto cuando la imagen es remota.

### DOCX

- Paquete OOXML con tipos de contenido, relaciones, estilos y propiedades.
- Cada tramo lleva su `<w:rPr>` (`<w:b/>`, `<w:i/>`, `<w:u/>`, `<w:strike/>`,
  `<w:vertAlign/>`).
- Los enlaces se agrupan en `<w:hyperlink r:id="…">` y se declaran como
  relaciones externas.
- Los separadores se dibujan como borde inferior de párrafo.

## 7. Pruebas

| Archivo                              | Qué cubre                                                    |
| ------------------------------------ | ------------------------------------------------------------ |
| `measure.test.ts`                    | Anchos, espaciado, familias, conversión a milímetros         |
| `rich-text.test.ts`                  | Marcas, negrita más ancha, guionado, camino rápido, sangría  |
| `pagination.test.ts`                 | Altura, viudas y huérfanas, capítulos, tramos conservados    |
| `layout-validation.test.ts`          | Geometría imposible o fuera de límites                       |
| `system-templates.test.ts`           | Geometría predeterminada y válida de las plantillas          |
| `export-engine/epub.test.ts`         | Estructura EPUB, formato en línea, enlaces, reglas, imágenes |
| `export-engine/pdf.test.ts`          | Cabecera, fuentes, WinAnsi, subrayado, superíndices          |
| `apps/web/lib/layout/blocks.test.ts` | Tiptap → tramos, reglas, imágenes, listas                    |

## 8. Limitaciones declaradas

- **Métricas estimadas.** Sin fuentes incrustadas, la paginación es una
  aproximación determinista; el PDF puede diferir en unas pocas líneas.
- **Imágenes.** El modelo las conserva y el EPUB las incluye; el PDF y el DOCX
  todavía no las dibujan.
- **Notas al pie.** El esquema las admite, pero no hay editor ni composición.
- **Validación externa.** No se ha ejecutado EPUBCheck ni se ha abierto el DOCX
  en Word o LibreOffice. No se afirma que sean válidos más allá de la
  comprobación estructural que hacen las pruebas.
- **Navegadores.** Las pruebas E2E solo se ejecutan en Chromium.

## 9. Invariantes que no se deben romper

1. `runsToText(block.runs) === block.text` en todos los bloques.
2. Un bloque sin marcas se compone exactamente igual que antes del Lote E.
3. Ningún carácter se pierde en silencio: o se representa, o se cuenta y se
   avisa.
4. El mismo manuscrito y la misma maqueta producen el mismo archivo (fechas
   fijadas, sin aleatoriedad).
5. La vista previa y el PDF usan la misma paginación.

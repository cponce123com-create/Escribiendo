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

`measure.ts` admite dos formas de medir:

- **Modelo aproximado** (el que se usa por defecto): anchos medios por carácter
  (estrecho, ancho, mayúscula, dígito, minúscula, espacio) y un factor por
  familia (serif 1,00; palo seco 1,06; monoespaciada 1,20). Es determinista y
  no necesita ninguna fuente.
- **Medición real** (`MeasureText`): la aplicación inyecta un medidor que
  devuelve los anchos de la propia fuente, leídos de la tabla `hmtx` y del
  mapa `cmap`. La usan la exportación y la vista previa.

Las dos rutas comparten las mismas reglas:

- `letterSpacingPt` se suma por carácter.
- `uppercase` y `smallCaps` transforman antes de medir.
- La negrita se mide con la cara de negrita de verdad. Si no hay medidor real,
  el modelo aproximado aplica `BOLD_FACTOR = 1,03`, porque una negra real
  ocupa algo más que su redonda. No se simula engordando el cuerpo.
- La cursiva se mide con su propia cara (`italic` o `boldItalic`); el modelo
  aproximado no distingue la cursiva de la redonda.

`apps/web/src/lib/export/fonts.ts` carga las doce caras Liberation desde
`public/fonts/liberation` y construye el medidor real. Si las fuentes no se
pueden leer, el medidor no se inyecta: la composición vuelve al modelo
aproximado y la interfaz lo declara (`estimatedPagination` en la exportación,
`realMetrics` en la vista previa). No se inventan métricas.

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

`paginate(blocks, geometry, typography, measure?)` compone por **altura**, no
por número de líneas: un título de 20 pt y un cuerpo de 11 pt conviven en la
misma página. El cuarto argumento es el medidor real; si no se pasa, se usa el
modelo aproximado.

- Apertura de capítulo en página par: inserta una página en blanco si hace
  falta y emite el diagnóstico `CHAPTER_NOT_ON_RECTO`.
- Viudas y huérfanas: `WIDOW` y `ORPHAN`, con los mínimos configurados.
- Desbordes: `OVERFLOW` cuando una palabra no cabe ni partida.
- Palabras largas: `LONG_WORD` cuando el texto de un bloque no cabe en el área.
- Separadores de escena e imágenes: ocupan su altura sin líneas de texto. La
  vista previa dibuja `* * *`; el PDF también.
- Las notas al pie reservan su altura al final de la página y avisan si no
  caben (`FOOTNOTE_OVERFLOW`).

`LaidOutPage` guarda `blocks`, `usedHeightMm`, `totalHeightMm`, `side`
(recto/verso), `folio` y `blank`.

## 6. Exportación

### PDF

- **Fuentes incrustadas.** Las caras que usa el documento se incrustan
  completas como `Type0`/`CIDFontType2`, con `FontFile2`, `Identity-H`,
  `CIDToGIDMap /Identity`, `FontDescriptor`, tabla `W` de anchos reales y mapa
  `ToUnicode`. Solo se incrustan las caras que aparecen en los tramos.
- **Fuente de reserva.** Times-Roman, Times-Bold, Times-Italic y
  Times-BoldItalic siguen declaradas para el caso de que no haya fuentes
  incrustadas (WinAnsi). En ese caso la paginación es aproximada y la
  interfaz lo avisa.
- **Métricas.** La composición usa `MeasureText`, de modo que los cortes de
  línea de la vista previa y del PDF coinciden. La cursiva se mide con su
  propia cara.
- Un `PdfRun` por tramo, con su fuente, tamaño, posición y, si procede,
  subrayado, tachado y desplazamiento de línea base (`Ts`).
- El justificado reparte el ancho sobrante entre los espacios de la línea con
  ajustes `TJ`, que funcionan con los códigos de dos bytes de `Identity-H`.
- Los títulos se miden en negrita, que es como se dibujan.
- Los caracteres sin glifo en la fuente incrustada se sustituyen y se
  **cuentan** en `caracteresPerdidos`; la interfaz lo avisa.
- Los flujos (contenido, programa de la fuente y mapa `ToUnicode`) van
  comprimidos con `FlateDecode`. El PDF de 200 000 palabras pasa de 5 387 KB a
  671 KB.

### EPUB

- XHTML por capítulo, `nav.xhtml`, `package.opf`, `style.css` y `mimetype` como
  primera entrada del ZIP.
- Formato en línea: `<strong>`, `<em>`, `<u>`, `<s>`, `<sup>`, `<sub>` y `<a>`.
- Separadores: `<hr class="scene"/>`.
- Imágenes: `<figure><img src="…">`. Cuando la capa web ha resuelto los bytes,
  la imagen va incrustada en el EPUB; si no, se deja la URL remota y el
  manifiesto declara `properties="remote-resources"`.
- Las entradas del ZIP van comprimidas con Deflate, salvo `mimetype`, que la
  especificación exige sin comprimir y en primer lugar.
- El ZIP se escribe en un búfer de bytes que crece por duplicación, no en una
  lista de números: con 80 fotografías, la diferencia son 367 MB frente a
  1 647 MB de memoria.

### DOCX

- Paquete OOXML con tipos de contenido, relaciones, estilos y propiedades.
- Cada tramo lleva su `<w:rPr>` (`<w:b/>`, `<w:i/>`, `<w:u/>`, `<w:strike/>`,
  `<w:vertAlign/>`).
- Los enlaces se agrupan en `<w:hyperlink r:id="…">` y se declaran como
  relaciones externas.
- Los separadores se dibujan como borde inferior de párrafo.
- Las imágenes con bytes resueltos van incrustadas en `word/media` con su
  relación y su texto alternativo.
- Las entradas del paquete OOXML van comprimidas con Deflate.

## 7. Pruebas

| Archivo                              | Qué cubre                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `measure.test.ts`                    | Anchos, espaciado, familias, medidor real y conversión a milímetros                                                           |
| `rich-text.test.ts`                  | Marcas, negrita más ancha, estilo de cada tramo, guionado, camino rápido, sangría                                             |
| `pagination.test.ts`                 | Altura, medidor real, viudas y huérfanas, capítulos, tramos conservados                                                       |
| `layout-validation.test.ts`          | Geometría imposible o fuera de límites                                                                                        |
| `system-templates.test.ts`           | Geometría predeterminada y válida de las plantillas                                                                           |
| `export-engine/epub.test.ts`         | Estructura EPUB, formato en línea, enlaces, reglas, imágenes                                                                  |
| `export-engine/pdf.test.ts`          | Cabecera, fuentes de reserva, escapado, metadatos, cajas y marcas de corte                                                    |
| `export-engine/pdf-fonts.test.ts`    | Lectura de la fuente, Unicode español, carácter ausente, objetos `Type0`/`FontFile2`/`ToUnicode`, caras usadas y determinismo |
| `export-engine/image-export.test.ts` | Imágenes incrustadas en PDF, EPUB y DOCX                                                                                      |
| `apps/web/lib/layout/blocks.test.ts` | Tiptap → tramos, reglas, imágenes, listas                                                                                     |

## 8. Limitaciones declaradas

- **Cobertura de las fuentes.** Liberation cubre latín, griego y cirílico. No
  cubre CJK, emoji ni todos los sistemas de escritura, y no hay shaping
  complejo ni ligaduras automáticas. Los caracteres sin glifo se sustituyen y
  se cuentan.
- **Tamaño del PDF.** No se generan subconjuntos: se incrusta el TTF completo.
  Un manuscrito de 200 000 palabras con una cara ocupa 5 387 KB.
- **Reserva de fuentes.** No hay cadena de fuentes de reserva por script, así
  que «Unicode completo» no está demostrado para todos los idiomas.
- **Imágenes.** Las tres formatos dibujan las imágenes cuando la capa web ha
  resuelto sus bytes. La subida real a Cloudinary no se ha probado con
  credenciales, así que ese camino sigue sin verificarse de extremo a extremo.
- **Validación externa.** El EPUB se ha validado con EPUBCheck 5.1.0 (0 errores,
  0 advertencias), el PDF lo abre pdf.js 4.10.38 y el DOCX lo lee un lector
  OOXML independiente. No se ha abierto el DOCX en Word o LibreOffice, porque no
  están instalados en esta máquina, ni se ha probado la lectura en un lector de
  EPUB comercial. No se afirma nada que no se haya ejecutado.
- **Navegadores.** Las pruebas E2E solo se ejecutan en Chromium.

## 9. Invariantes que no se deben romper

1. `runsToText(block.runs) === block.text` en todos los bloques.
2. Un bloque sin marcas se compone exactamente igual que antes del Lote E.
3. Ningún carácter se pierde en silencio: o se representa, o se cuenta y se
   avisa.
4. El mismo manuscrito y la misma maqueta producen el mismo archivo (fechas
   fijadas, sin aleatoriedad).
5. La vista previa y el PDF usan el mismo motor de paginación y las mismas
   fuentes; con las fuentes disponibles, los cortes de línea coinciden. Si las
   fuentes no se pueden leer, ambos caen al modelo aproximado y lo declaran.

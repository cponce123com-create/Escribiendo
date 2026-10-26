# Validación de las exportaciones

Qué se ha comprobado de los archivos que genera ESCRIBIENDO, cómo y con qué
resultado. Todas las comprobaciones son reproducibles con los comandos que se
indican.

## Formatos generados

| Formato  | Implementación                                  | Estándar         |
| -------- | ----------------------------------------------- | ---------------- |
| PDF      | `packages/export-engine/src/pdf.ts`             | PDF 1.4          |
| EPUB     | `packages/export-engine/src/epub.ts` + `zip.ts` | EPUB 3           |
| DOCX     | `packages/export-engine/src/docx.ts` + `zip.ts` | WordprocessingML |
| Markdown | `packages/export-engine/src/text-formats.ts`    | CommonMark       |
| HTML     | `packages/export-engine/src/text-formats.ts`    | HTML5            |
| TXT      | `packages/export-engine/src/text-formats.ts`    | Texto UTF-8      |

Desde el lote de imágenes, PDF, EPUB y DOCX incorporan imágenes cuando la
capa web ha resuelto sus bytes. El motor de exportación no descarga nada: recibe
un mapa de imágenes ya normalizadas. Así el paquete es determinista y se puede
probar sin red.

## Markdown, HTML y texto plano

Los tres formatos comparten el `ExportDocumentModel` de EPUB y DOCX, de modo
que un capítulo no puede decir una cosa en un archivo y otra en el resto.
Comprobado en `packages/export-engine/src/text-formats.test.ts` (13 casos):

- **Markdown**: títulos y jerarquía (`#`, `##`, `###`), formato en línea
  (`**`, `*`, `~~`, `<u>`, `<sup>`, `<sub>`), citas, separadores de escena
  (`* * *`), imágenes por referencia con texto alternativo, notas al pie
  `[^n]` con su definición, índice y escapado del marcado que venga del
  manuscrito.
- **HTML**: documento autónomo con `<!doctype html>`, `lang`, estilos
  incrustados, jerarquía semántica, enlaces internos de nota y escapado de
  `<`, `>` y `&`.
- **TXT**: títulos subrayados, párrafos separados por línea en blanco, citas
  sangradas, separadores de escena, `[Imagen: …]` y notas numeradas.

Ninguno incrusta imágenes binarias: la capa web no descarga bytes para estos
formatos y la exportación no se bloquea si falta la portada. En el registro de
la exportación, las imágenes cuentan como omitidas, que es lo que son.

## PDF

### Comprobaciones automáticas

En `packages/export-engine/src/pdf.test.ts` (18 casos),
`packages/export-engine/src/pdf-fonts.test.ts` (6 casos) y
`packages/export-engine/src/image-export.test.ts` (6 casos):

| Comprobación                                                                     | Resultado               |
| -------------------------------------------------------------------------------- | ----------------------- |
| La cabecera es `%PDF-1.4` y el archivo termina en `%%EOF`                        | Cumplido                |
| El número de páginas declarado coincide con las composiciones                    | Cumplido                |
| Las fuentes estándar siguen disponibles como alternativa                         | Cumplido                |
| Una fuente TTF se incrusta como `/Subtype /Type0` y `/CIDFontType2`              | Cumplido                |
| La fuente lleva `/FontFile2`, `/Encoding /Identity-H` y `/CIDToGIDMap /Identity` | Cumplido                |
| La fuente lleva `/ToUnicode` y se puede extraer el texto                         | Cumplido                |
| Solo se incrustan las caras que usa el documento                                 | Cumplido                |
| El escapado de paréntesis y barras invertidas                                    | Cumplido                |
| Los metadatos (título, autoría, asunto, fecha) están                             | Cumplido                |
| Los metadatos Unicode se escriben como cadenas UTF-16BE                          | Cumplido                |
| El objeto 0 no se usa como catálogo ni como objeto real                          | Cumplido                |
| `CropBox` y `TrimBox` miden la hoja acabada                                      | Cumplido                |
| `BleedBox` aparece cuando hay sangrado                                           | Cumplido                |
| Las marcas de corte no dependen del sangrado                                     | Cumplido                |
| El mismo documento produce el mismo archivo                                      | Cumplido (reproducible) |
| La posición del texto en la línea base es exacta                                 | Cumplido                |
| Los signos tipográficos del español se conservan                                 | Cumplido                |
| Las tildes, la eñe y la diéresis se conservan                                    | Cumplido                |
| Los caracteres sin representación se cuentan                                     | Cumplido                |
| Un JPEG se incrusta como XObject `/Subtype /Image` con `/DCTDecode`              | Cumplido                |
| La imagen se dibuja con `cm` y `/Im1 Do` en el flujo de la página                | Cumplido                |
| Una imagen sin bytes deja un marco y su texto alternativo                        | Cumplido                |
| Los flujos van comprimidos con `/Filter /FlateDecode`                            | Cumplido                |
| La tabla de anchos y el mapa `ToUnicode` se pueden desplegar y leer              | Cumplido                |

### Imágenes

- `prepareImageAsset` convierte a JPEG RGB con `sharp`, corrige la orientación
  EXIF, limita el lado mayor a 2400 px y no amplía imágenes pequeñas. El PDF
  solo admite JPEG de forma directa; PNG, WebP y AVIF se convierten antes.
- El objeto de imagen se escribe con sus dimensiones reales y su espacio de
  color (`DeviceGray`, `DeviceRGB` o `DeviceCMYK`). La aplicación normaliza a
  RGB, de modo que el caso normal es `DeviceRGB`.
- Una imagen que no se ha podido descargar o normalizar no desaparece: se dibuja
  un marco gris con el texto alternativo y el resultado incrementa
  `imagenesOmitidas`.

### Fuentes y Unicode

El **cuerpo** del PDF ya no depende de `WinAnsiEncoding`. La aplicación carga
las doce caras Liberation 2.1.5 desde `public/fonts/liberation/`; el escritor
incrusta solo las que aparecen en el documento como `Type0`/`CIDFontType2`, con
`FontFile2`, `Identity-H`, `CIDToGIDMap /Identity`, tabla `W` de anchos reales
y mapa `ToUnicode`. La paginación usa la misma medición (`hmtx`/`cmap`) que
después se imprime, y la vista previa paginada usa ese mismo medidor: sus
cortes de línea son los del PDF. La cursiva se mide con su propia cara.

La prueba E2E «el PDF conserva la tipografía española» extrae el texto del
mapa `ToUnicode` del archivo descargado y comprueba `«Cita»`, la raya larga,
los puntos suspensivos, `niño`, `caía` y `miró`; la interfaz no muestra aviso
de caracteres perdidos.

La cobertura de Liberation incluye latín, griego y cirílico, pero **no CJK,
emoji ni todos los sistemas de escritura**, y no hay shaping complejo ni
ligaduras automáticas. Los caracteres sin glifo se sustituyen y se cuentan en
`caracteresPerdidos`. Si las fuentes no se cargan, se conserva Times/WinAnsi y
`estimatedPagination` pasa a `true`; el panel lo avisa.

### Compresión

Los flujos del PDF (contenido de las páginas, programas de la fuente y mapas
`ToUnicode`) van comprimidos con `FlateDecode`, que es lo que hacen todos los
lectores. Las entradas del EPUB y del DOCX van comprimidas con Deflate,
salvo `mimetype`, que la especificación exige sin comprimir.

Tamaño medido con `pnpm bench:export` para 200 000 palabras con una cara
incrustada:

| Formato | Antes    | Ahora  |
| ------- | -------- | ------ |
| PDF     | 5 387 KB | 671 KB |
| EPUB    | —        | 29 KB  |
| DOCX    | —        | 8 KB   |

El PDF pasa de 5 387 KB a 671 KB: el archivo pasa a estar dominado por la
fuente incrustada y no por el texto. El coste es de CPU (310 ms de escritura
en lugar de 227 ms para 200 000 palabras) y ningún cambio en lo que se ve ni en
lo que se extrae.

**Validación externa (Lote M).** El PDF lo abre **pdf.js 4.10.38**, el lector
de PDF de Mozilla, que es independiente del motor de escritura:

- `pnpm validate:pdf` genera un PDF de prueba con el mismo motor y lo abre con
  el lector indicado en `PDF_VALIDATOR`. Resultado: pdf.js devuelve el texto
  con la fuente incrustada y el mapa `ToUnicode`, incluidos `«Cita»`, la raya
  larga, los puntos suspensivos y las eñes.
- La prueba de extremo a extremo deja el archivo que descarga la aplicación en
  `test-results/pdf-generado.pdf`, y el validador de `scripts/pdfjs` lo abre:

```bash
pnpm --dir scripts/pdfjs install
PDF_VALIDATOR="node scripts/pdfjs/valida-pdf.mjs" pnpm validate:pdf
node scripts\pdfjs\valida-pdf.mjs test-results\pdf-generado.pdf
```

### Lo que no se ha hecho

- **No se generan subconjuntos de fuente.** Se incrusta el TTF completo, aunque
  comprimido. Para 200 000 palabras el PDF ocupa 671 KB.
- **No hay cadena de fuentes de reserva por script.** «Unicode completo» para
  todos los idiomas no está demostrado.
- **No se afirma compatibilidad PDF/X.** El PDF lleva `TrimBox`, `BleedBox`,
  `CropBox` y marcas de corte, pero no se ha validado con un preflight ni con
  una norma ISO.

## EPUB

Estructura comprobada en `packages/export-engine/src/epub.test.ts` y en la
prueba de extremo a extremo «el archivo descargado es un EPUB válido»:

- La entrada `mimetype` está **la primera** y sin comprimir, con el valor
  `application/epub+zip`.
- `META-INF/container.xml` declara el punto de entrada del paquete.
- `EPUB/package.opf` declara la versión 3.0, el identificador único, el título,
  la autoría, el idioma y la fecha de modificación.
- El mismo OPF declara la accesibilidad calculada del documento:
  `schema:accessMode` (`textual` y `visual` si hay imágenes),
  `schema:accessModeSufficient`, `schema:accessibilityFeature`
  (`structuralNavigation`, `readingOrder`, `unlocked`, `tableOfContents` y
  `alternativeText` cuando todas las imágenes lo tienen),
  `schema:accessibilityHazard` (`none`) y un resumen en español. No se declara
  conformidad con un nivel WCAG: eso exige una auditoría aparte.
- El manifiesto y el spine incluyen un capítulo por sección.
- `EPUB/nav.xhtml` contiene la navegación con el índice.
- El XML va escapado.

### Imágenes

- Cuando la aplicación ha resuelto los bytes, la imagen se guarda en
  `EPUB/images/image-NNN.jpg` o `.png`, se declara en el manifiesto y el
  capítulo usa una ruta relativa (`../images/…`).
- Se conserva el PNG con transparencia; si no hay alfa, se normaliza a JPEG.
- Si no hay bytes, se conserva la URL remota y el capítulo declara
  `properties="remote-resources"`. El texto alternativo sigue presente. La
  exportación cuenta la imagen como omitida y la interfaz lo avisa.
- Dos exportaciones del mismo manuscrito producen los mismos nombres de
  archivo y el mismo ZIP.

**Validación externa (Lote L).** El EPUB se ha validado con **EPUBCheck 5.1.0**,
la herramienta oficial del W3C, ejecutada con Java 17:

- `pnpm validate:epub` genera un EPUB de prueba con el mismo motor y lo valida.
  Resultado: **0 errores fatales, 0 errores, 0 advertencias, 0 indicaciones**
  (reglas de EPUB 3.3).
- La prueba de extremo a extremo «el archivo descargado es un EPUB válido»
  valida **el archivo que descarga la aplicación** cuando está configurado
  `EPUBCHECK_JAR`; si la herramienta encuentra un error, la prueba falla.

```bash
EPUBCHECK_JAR=ruta\epubcheck.jar pnpm validate:epub
EPUBCHECK_JAR=ruta\epubcheck.jar JAVA=ruta\java.exe pnpm exec playwright test tests/e2e/exportacion.spec.ts
```

**Lo que no se ha hecho**: no hay portada, no se ha probado la lectura en un
lector comercial y EPUBCheck no sustituye a la revisión editorial. Word y
LibreOffice siguen sin estar instalados en esta máquina, así que la
comprobación del DOCX se hace con otras herramientas.

## DOCX

Comprobado en `packages/export-engine/src/epub.test.ts`,
`packages/export-engine/src/image-export.test.ts` y en la prueba de extremo a
extremo «el DOCX generado es un paquete de Word»:

- Las partes obligatorias están: `[Content_Types].xml`, `_rels/.rels`,
  `word/document.xml`, `word/_rels/document.xml.rels`, `word/styles.xml` y las
  propiedades del documento.
- Los estilos de título, subtítulo y cita están declarados.
- Los saltos de página se conservan.
- Los separadores de escena se dibujan como borde de párrafo.

### Imágenes

- La imagen se guarda en `word/media/image-NNN.jpg` o `.png` y se declara como
  `Default Extension` en `[Content_Types].xml`.
- `word/_rels/document.xml.rels` incluye la relación de imagen con
  `Target="media/…"`.
- El cuerpo usa `wp:inline` con `wp:extent`, `wp:docPr`, `a:blip`,
  `pic:pic` y `a:xfrm`. El texto alternativo y el pie se conservan.
- El ancho se limita al área de texto de un A4 y el alto a una caja prudente;
  la proporción se mantiene.
- Si falta la imagen, se escribe `[Imagen: …]` con el pie o el texto
  alternativo.

**Validación externa (Lote L).** El DOCX se ha abierto con **Mammoth 1.11.0**,
un lector de OOXML independiente del motor de escritura:

- `pnpm validate:docx` genera un DOCX de prueba con el mismo motor y lo abre
  con el lector indicado en `DOCX_VALIDATOR`. Resultado: el lector devuelve el
  texto, la negrita, la cursiva, el enlace, la llamada con su nota al pie y la
  imagen incrustada.
- La prueba de extremo a extremo «el DOCX generado es un paquete de Word» deja
  el archivo que descarga la aplicación en `test-results/docx-generado.docx`,
  para poder abrirlo con la misma herramienta:

```bash
DOCX_VALIDATOR="pnpm dlx mammoth@1.11.0" pnpm validate:docx
pnpm dlx mammoth@1.11.0 test-results\docx-generado.docx
```

**Validación con LibreOffice (Lote Z).** El DOCX también se ha abierto con
**LibreOffice 26.8.1.1**, un procesador de textos independiente:

- `pnpm validate:docx:libreoffice` genera el DOCX, lo convierte a PDF con
  LibreOffice en modo sin interfaz y lee el PDF con pdf.js.
- Resultado: **3 páginas**; se conservan el texto, la nota al pie («La nota
  explica el detalle.»), el pie de la imagen y el salto de página.
- El DOCX y el PDF quedan como artefactos del trabajo de CI `DOCX con
LibreOffice`, para poder abrirlos a mano.
- El trabajo pasa en Ubuntu y deja ambos archivos como artefactos
  ([ejecución](https://github.com/cponce123com-create/Escribiendo/actions/runs/39789957627)).

**Lo que sigue sin comprobarse**: Microsoft Word. LibreOffice es un procesador
de textos independiente, pero no es Word; la compatibilidad con Word no se
declara.

## Integridad, seguridad y reproducibilidad

- El mismo manuscrito y la misma maqueta producen **el mismo archivo**, byte a
  byte: la fecha de creación se fija en el trabajo, no en el momento de
  generar el archivo.
- El trabajo guarda las **versiones** de las secciones que exportó. Como las
  revisiones son inmutables, el archivo se puede regenerar idéntico aunque el
  manuscrito haya cambiado después.
- La descarga va firmada y caduca a los diez minutos: sin sesión o con una
  firma caducada, se rechaza con `401` o `403`.
- La cola es idempotente: pedir dos veces la misma exportación devuelve el
  mismo trabajo.
- El nombre de descarga se sanea: se eliminan controles, comillas y separadores
  de ruta; se envía un `filename` ASCII y un `filename*` RFC 5987. El
  `Content-Type` sale del archivo generado, no de un valor almacenado.
- La resolución de imágenes solo acepta HTTPS de
  `res.cloudinary.com/<cloudName>/image/upload/…`. Se comprueba también la URL
  final después de las redirecciones. Hay timeout de 15 s, máximo de 15 MB por
  imagen, máximo de 80 imágenes y concurrencia 4. Las URLs no permitidas se
  omiten y quedan contadas.

## Rendimiento

Medido con `pnpm bench:export` (véase
[PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md)). La última ejecución, con
métricas reales de Liberation y una cara incrustada, dio 112 ms de paginación,
227 ms de PDF y 5 387 KB para 200 000 palabras. Las imágenes reales no se
incluyen en ese banco: no hay credenciales de Cloudinary para descargarlas.

## Evidencia ejecutada

| Comprobación                     | Resultado                       |
| -------------------------------- | ------------------------------- |
| `pnpm test`                      | 337 pruebas en 36 archivos      |
| `pnpm test:e2e`                  | 81 pruebas en Chromium          |
| `pnpm typecheck`                 | Sin errores                     |
| `pnpm lint`                      | Sin errores                     |
| `pnpm build`                     | Correcto                        |
| `pnpm bench:export`              | Ejecutado con fuentes           |
| `pnpm validate:epub`             | 0 errores con EPUBCheck 5.1.0   |
| `pnpm validate:docx`             | Leído con Mammoth 1.11.0        |
| `pnpm validate:docx:libreoffice` | LibreOffice 26.8.1.1: 3 páginas |
| `pnpm validate:pdf`              | Leído con pdf.js 4.10.38        |

Los trabajos `Verificación` y `Extremo a extremo` también pasan en GitHub
Actions; el E2E ejecuta las 81 pruebas en Chromium.

## Bloqueos externos

- Microsoft Word no está disponible en esta máquina: la compatibilidad con
  Word no está comprobada. LibreOffice 26.8.1.1 sí se ha usado (Lote Z).
- Cloudinary no está configurado en local: la subida y la descarga reales de
  imágenes no se han probado de extremo a extremo.
- Render Free no es accesible desde esta red.
- No se ha probado la exportación con 80 imágenes reales en una instancia Free.

Ninguna de estas ausencias se presenta como una validación aprobada.

## Notas al pie (Lote J)

Comprobado en `packages/export-engine/src/footnote-export.test.ts` y en la
prueba de editor de `tests/e2e/manuscrito.spec.ts`.

### PDF

- La paginación compone cada nota al 78 % del cuerpo y reserva su altura en la
  página de la llamada.
- `toPdfPages` dibuja una línea separadora de 0,5 pt y las líneas de la nota
  en la parte inferior del área de texto, antes del folio.
- Las notas usan la misma familia y la misma medición real que el cuerpo. Si
  las fuentes no se cargan, caen a Times/WinAnsi y los caracteres sin
  representación se sustituyen y se cuentan en `caracteresPerdidos`.
- Si una nota no cabe con su llamada, se conserva completa, se emite
  `FOOTNOTE_OVERFLOW` y la maqueta debe revisarse. No se divide entre páginas.

### EPUB

- La llamada se escribe como
  `<a epub:type="noteref" href="#fn-ID"><sup>N</sup></a>`.
- Al final del capítulo se agrupan las notas en
  `<section epub:type="footnotes">`; cada nota es un `<li epub:type="footnote">`
  con enlace de vuelta a la llamada.
- El texto va escapado. Las notas son texto plano en esta versión.
- No se ha validado con EPUBCheck; la estructura se comprueba byte a byte.

### DOCX

- Se añade `word/footnotes.xml` al paquete, el override de tipo de contenido y
  la relación `footnotes` en `word/_rels/document.xml.rels`.
- Cada llamada usa un `w:footnoteReference` real con el identificador global;
  la nota contiene `w:footnoteRef` y el texto en el estilo `FootnoteText`.
- Los estilos `FootnoteText` y `FootnoteReference` están declarados en
  `word/styles.xml`.
- Abierto con LibreOffice 26.8.1.1 (Lote Z): la nota al pie se conserva en el
  PDF generado. Microsoft Word sigue sin probarse.

### Evidencia

| Suite           | Resultado                  |
| --------------- | -------------------------- |
| `pnpm test`     | 332 pruebas en 35 archivos |
| `pnpm test:e2e` | 80 pruebas en Chromium     |
| `pnpm build`    | Correcto                   |

## Fuentes incrustadas (Lote K)

Comprobado en `packages/export-engine/src/pdf-fonts.test.ts` (6 casos) y en la
prueba E2E «el PDF conserva la tipografía española»:

- El lector `truetype.ts` interpreta las tablas `head`, `maxp`, `hhea`, `hmtx`,
  `cmap` (formatos 0, 4, 6 y 12), `name`, `OS/2` y `post`. Los anchos salen de
  `hmtx`; el mapa inverso de `cmap` alimenta `ToUnicode`.
- El PDF declara `Type0` + `CIDFontType2`, `FontFile2`, `Identity-H`,
  `CIDToGIDMap /Identity`, `FontDescriptor`, tabla `W` y `ToUnicode`.
- Solo se incrustan las caras que aparecen en los tramos. Si una cara no se
  usa, no se escribe su programa.
- La prueba E2E extrae el texto del PDF descargado y comprueba las comillas
  angulares, la raya, los puntos suspensivos, `niño`, `caía` y `miró`.
- Las doce caras son Liberation Fonts 2.1.5, licencia SIL OFL. Se incluyen
  `OFL.txt` y la nota de origen en `apps/web/public/fonts/liberation/`.

Límites: no hay subconjuntos, no hay cadena de reserva para CJK/emoji ni
shaping complejo, y no se ha validado el PDF con un preflight PDF/X. Los
caracteres sin glifo se sustituyen y se cuentan; no se presentan como
conservados.

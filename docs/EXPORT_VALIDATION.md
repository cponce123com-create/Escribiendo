# Validación de las exportaciones

Qué se ha comprobado de los archivos que genera ESCRIBIENDO, cómo y con qué
resultado. Todas las comprobaciones son reproducibles con los comandos que se
indican.

## Formatos generados

| Formato | Implementación                                  | Estándar         |
| ------- | ----------------------------------------------- | ---------------- |
| PDF     | `packages/export-engine/src/pdf.ts`             | PDF 1.4          |
| EPUB    | `packages/export-engine/src/epub.ts` + `zip.ts` | EPUB 3           |
| DOCX    | `packages/export-engine/src/docx.ts` + `zip.ts` | WordprocessingML |

Desde el lote de imágenes, los tres formatos incorporan imágenes cuando la
capa web ha resuelto sus bytes. El motor de exportación no descarga nada: recibe
un mapa de imágenes ya normalizadas. Así el paquete es determinista y se puede
probar sin red.

## PDF

### Comprobaciones automáticas

En `packages/export-engine/src/pdf.test.ts` (18 casos) y
`packages/export-engine/src/image-export.test.ts` (6 casos):

| Comprobación                                                                  | Resultado               |
| ----------------------------------------------------------------------------- | ----------------------- |
| La cabecera es `%PDF-1.4` y el archivo termina en `%%EOF`                     | Cumplido                |
| El número de páginas declarado coincide con las composiciones                 | Cumplido                |
| Las fuentes estándar están declaradas (Times-Roman, Times-Bold, Times-Italic) | Cumplido                |
| El escapado de paréntesis y barras invertidas                                 | Cumplido                |
| Los metadatos (título, autoría, asunto, fecha) están                          | Cumplido                |
| Los metadatos Unicode se escriben como cadenas UTF-16BE                       | Cumplido                |
| El objeto 0 no se usa como catálogo ni como objeto real                       | Cumplido                |
| `CropBox` y `TrimBox` miden la hoja acabada                                   | Cumplido                |
| `BleedBox` aparece cuando hay sangrado                                        | Cumplido                |
| Las marcas de corte no dependen del sangrado                                  | Cumplido                |
| El mismo documento produce el mismo archivo                                   | Cumplido (reproducible) |
| La posición del texto en la línea base es exacta                              | Cumplido                |
| Los signos tipográficos del español se conservan                              | Cumplido                |
| Las tildes, la eñe y la diéresis se conservan                                 | Cumplido                |
| Los caracteres sin representación se cuentan                                  | Cumplido                |
| Un JPEG se incrusta como XObject `/Subtype /Image` con `/DCTDecode`           | Cumplido                |
| La imagen se dibuja con `cm` y `/Im1 Do` en el flujo de la página             | Cumplido                |
| Una imagen sin bytes deja un marco y su texto alternativo                     | Cumplido                |

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

### Unicode

El **cuerpo** del PDF sigue usando `WinAnsiEncoding`, que no cubre todo
Unicode. Hay una tabla de equivalencias a Win1252 para comillas tipográficas,
raya larga, puntos suspensivos y otros signos del español. Lo que no tiene
equivalente se sustituye por `□` y se devuelve en `caracteresPerdidos`; la
interfaz avisa. Nada se pierde en silencio.

Los **metadatos** (título, autoría y asunto) ya se escriben como cadenas
UTF-16BE, de modo que un título con caracteres fuera de Latin-1 no se corrompe.

Comprobado en la prueba de extremo a extremo «el PDF conserva la tipografía
española»: el archivo descargado contiene las comillas, la raya larga, los
puntos suspensivos, `niño` y `caña`, y la interfaz no muestra aviso de
caracteres perdidos.

### Lo que no se ha hecho

- **No hay incrustación de fuentes TTF ni tabla de anchos real.** La paginación
  es una estimación con anchos medios. Es la limitación principal del PDF.
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

**Lo que no se ha hecho**: no se ha validado con EPUBCheck (no está disponible
y exigiría Java), no hay portada y no se ha probado la lectura en un lector
comercial. «EPUB válido» aquí significa «con la estructura que exige la
especificación y verificada byte a byte», no «aprobado por EPUBCheck».

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

**Lo que no se ha hecho**: no se ha abierto el archivo en Microsoft Word ni en
LibreOffice desde este entorno. La estructura OOXML es correcta y se puede
inspeccionar, pero la compatibilidad real con Word no está comprobada.

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
[PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md)). La última ejecución, ya con el
motor de imágenes cargado, dio 265 ms de paginación y 101 ms de PDF para
200 000 palabras. Las imágenes reales no se incluyen en ese banco: no hay
credenciales de Cloudinary para descargarlas.

## Evidencia ejecutada

| Comprobación        | Resultado                  |
| ------------------- | -------------------------- |
| `pnpm test`         | 268 pruebas en 30 archivos |
| `pnpm test:e2e`     | 71 pruebas en Chromium     |
| `pnpm typecheck`    | Sin errores                |
| `pnpm lint`         | Sin errores                |
| `pnpm build`        | Correcto                   |
| `pnpm bench:export` | Ejecutado                  |

## Bloqueos externos

- EPUBCheck no está instalado.
- Word y LibreOffice no están disponibles.
- Cloudinary no está configurado en local.
- Render Free no es accesible desde esta red.
- No se ha probado la exportación con 80 imágenes reales en una instancia Free.

Ninguna de estas ausencias se presenta como una validación aprobada.

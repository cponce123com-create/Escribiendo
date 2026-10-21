# Validación de las exportaciones

Qué se ha comprobado de los archivos que genera ESCRIBIENDO, cómo y con qué
resultado. Todas las comprobaciones son reproducibles: el código está en el
repositorio y los comandos se indican en cada apartado.

## Formatos generados

| Formato | Implementación                                  | Estándar                  |
| ------- | ----------------------------------------------- | ------------------------- |
| PDF     | `packages/export-engine/src/pdf.ts`             | PDF 1.4, fuentes estándar |
| EPUB    | `packages/export-engine/src/epub.ts` + `zip.ts` | EPUB 3                    |
| DOCX    | `packages/export-engine/src/docx.ts` + `zip.ts` | WordprocessingML          |

## PDF

### Comprobaciones automáticas

En `packages/export-engine/src/pdf.test.ts` (15 casos):

| Comprobación                                                                  | Resultado               |
| ----------------------------------------------------------------------------- | ----------------------- |
| La cabecera es `%PDF-1.4` y el archivo termina en `%%EOF`                     | Cumplido                |
| El número de páginas declarado coincide con las composiciones                 | Cumplido                |
| Las fuentes estándar están declaradas (Times-Roman, Times-Bold, Times-Italic) | Cumplido                |
| El escapado de paréntesis y barras invertidas                                 | Cumplido                |
| Los metadatos (título, autoría, asunto, fecha) están                          | Cumplido                |
| `CropBox` y `TrimBox` miden la hoja acabada                                   | Cumplido                |
| `BleedBox` aparece cuando hay sangrado                                        | Cumplido                |
| Las marcas de corte no dependen del sangrado                                  | Cumplido                |
| El mismo documento produce el mismo archivo                                   | Cumplido (reproducible) |
| La posición del texto en la línea base es exacta                              | Cumplido                |
| Los signos tipográficos del español se conservan                              | Cumplido                |
| Las tildes, la eñe y la diéresis se conservan                                 | Cumplido                |
| Los caracteres sin representación se cuentan                                  | Cumplido                |

### Unicode

El PDF declara `WinAnsiEncoding`, que no cubre todo Unicode. Antes de esta
corrección, cualquier carácter por encima de U+00FF se sustituía por `?`: las
comillas tipográficas («»), la raya larga (—) y los puntos suspensivos (…)
desaparecían del archivo, que es justo lo que ocurre en un texto en español.

Ahora hay una tabla de equivalencias a Win1252 (`WINANSI_EXTRA`) y, para lo
que no tiene equivalente, un signo visible (`□`) **y un recuento**: el
generador devuelve `caracteresPerdidos` y la interfaz avisa de ello. Nada se
pierde en silencio.

Comprobado en la prueba de extremo a extremo «el PDF conserva la tipografía
española»: el archivo descargado contiene `«Cita»`, la raya larga, los puntos
suspensivos, `niño` y `caía`, y la interfaz no muestra ningún aviso de
caracteres perdidos.

### Lo que no se ha hecho

- **No hay incrustación de fuentes.** El PDF usa las fuentes estándar, que el
  lector ya tiene, con lo que el archivo es pequeño y se abre en cualquier
  visor. A cambio, la paginación se estima con un modelo de anchos medios y
  el justificado es aproximado. Escribir el texto con la fuente real exige
  incrustar el TTF y subconjuntarlo: un trabajo de la fase de producción final.
- **No se afirma compatibilidad PDF/X.** No se ha validado con un preflight
  ni con una norma ISO. El PDF lleva `TrimBox`, `BleedBox`, `CropBox` y
  marcas de corte, que es lo que necesita una imprenta, pero eso no es
  PDF/X.

## EPUB

Estructura comprobada en `packages/export-engine/src/epub.test.ts` y en la
prueba de extremo a extremo «el archivo descargado es un EPUB válido»:

- La entrada `mimetype` está **la primera** y sin comprimir, con el valor
  `application/epub+zip` (lo exige la especificación).
- `META-INF/container.xml` declara el punto de entrada del paquete.
- `EPUB/package.opf` declara la versión 3.0, el identificador único, el
  título, la autoría, el idioma y la fecha de modificación.
- El manifiesto y el spine incluyen un capítulo por sección.
- `EPUB/nav.xhtml` contiene la navegación con el índice.
- El XML va escapado.

**Lo que no se ha hecho**: no se ha validado con EPUBCheck (no está
disponible en el entorno y su instalación exigiría Java), no hay portada, no
hay imágenes incrustadas y no se ha probado la lectura en un lector real. La
estructura es correcta y verificable byte a byte, pero «EPUB válido» aquí
significa «con la estructura que exige la especificación», no «validado por
EPUBCheck».

## DOCX

Comprobado en `packages/export-engine/src/epub.test.ts` y en la prueba de
extremo a extremo «el DOCX generado es un paquete de Word»:

- Las partes obligatorias están: `[Content_Types].xml`, `_rels/.rels`,
  `word/document.xml`, `word/_rels/document.xml.rels`, `word/styles.xml` y las
  propiedades del documento.
- Los estilos de título, subtítulo y cita están declarados.
- Los saltos de página se conservan.

**Lo que no se ha hecho**: no se ha abierto el archivo en Microsoft Word ni en
LibreOffice desde este entorno. La estructura OOXML es correcta y se puede
validar con un inspector, pero la compatibilidad real con Word no está
comprobada.

## Integridad y reproducibilidad

- El mismo manuscrito y la misma maqueta producen **el mismo archivo**, byte a
  byte: la fecha de creación del documento se fija en el trabajo, no en el
  momento de generar el archivo.
- El trabajo guarda las **versiones** de las secciones que exportó. Como las
  revisiones son inmutables, el archivo se puede regenerar idéntico aunque el
  manuscrito haya cambiado después.
- La descarga va firmada y caduca a los diez minutos: sin sesión o con una
  firma caducada, la descarga se rechaza con `401` o `403`.
- La cola es idempotente: pedir dos veces la misma exportación devuelve el
  mismo trabajo, comprobado en la prueba de extremo a extremo «pedir dos veces
  la misma exportación reutiliza el trabajo».

## Rendimiento

Medido con `pnpm bench:export` (véase
[PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md)): un manuscrito de 200 000
palabras se compone y se exporta a PDF en unos 230 ms y con menos de 60 MB de
memoria.

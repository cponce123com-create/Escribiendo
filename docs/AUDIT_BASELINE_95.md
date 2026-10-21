# Auditoría de referencia para la meta 95

Fecha: 21 de octubre de 2026.
Rama: `improvement/escribiendo-95`.
Base: `0f65b1e` (la versión estable sigue en `main`).

Esta auditoría no acepta como cierta ninguna puntuación anterior. Cada
hallazgo se ha comprobado contra el código de esta rama y cada corrección se
ha sometido a las pruebas del repositorio. La puntuación de 95 **no se declara
alcanzada**: este documento registra la línea base y lo que queda abierto.

Las secciones de la línea base y de los lotes anteriores son un registro
cronológico; **el estado vigente** está en las actualizaciones del final
(lotes J a S) y en [EXPORT_VALIDATION.md](EXPORT_VALIDATION.md).

## Línea base ejecutada

Antes de tocar el código se ejecutaron los mismos comandos que se usan para
cerrar un lote:

| Comprobación      | Comando             | Resultado en la base `0f65b1e` |
| ----------------- | ------------------- | ------------------------------ |
| Formato           | `pnpm format:check` | Correcto                       |
| Análisis estático | `pnpm lint`         | Sin errores                    |
| Tipos             | `pnpm typecheck`    | Sin errores                    |
| Pruebas unitarias | `pnpm test`         | 252 pruebas, 27 archivos       |
| Compilación       | `pnpm build`        | Correcto, Next.js 16.4.2       |
| Extremo a extremo | `pnpm test:e2e`     | 70 pruebas en Chromium         |

Después del lote de imágenes y de las pruebas nuevas de esta rama:

| Comprobación        | Resultado                |
| ------------------- | ------------------------ |
| Pruebas unitarias   | 268 pruebas, 30 archivos |
| Extremo a extremo   | 71 pruebas en Chromium   |
| Formato, lint       | Sin errores              |
| Tipos y compilación | Sin errores              |

Las cifras son de esta máquina y de la compilación de producción local. No
presumen el comportamiento del despliegue de Render.

La cifra vigente despues del Lote S es **328 pruebas unitarias en 34 archivos**
y **79 pruebas E2E en Chromium**. Las tablas siguientes conservan la historia de
cada lote; no se reescriben los resultados anteriores.

## Hallazgos comprobados y corregidos en el lote de imágenes

| #    | Hallazgo comprobado                                                                                                       | Corrección                                                                                                                                           | Evidencia                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| I-1  | El editor solo registraba `StarterKit`: no había nodo de imagen ni forma de insertar una.                                 | Nodo Tiptap `image` con `src`, `alt`, `caption`, dimensiones, porcentaje, alineación y `publicId`; controles de inserción.                           | `editorial-image.ts`, `section-image-controls.tsx`, E2E de controles |
| I-2  | El modelo de maquetación descartaba la imagen y su pie.                                                                   | `LayoutBlock.image`, `imageLayout` y altura real en la paginación.                                                                                   | `packages/editorial-engine/src/image.test.ts`, `pagination.test.ts`  |
| I-3  | El PDF no dibujaba imágenes; el DOCX tampoco; el EPUB solo conservaba una URL remota.                                     | PDF con XObjects JPEG `DCTDecode`; EPUB con `EPUB/images/`; DOCX con `word/media/`, relaciones y `wp:inline`.                                        | `image-export.test.ts` (6 pruebas)                                   |
| I-4  | Una imagen no disponible podía desaparecer sin aviso.                                                                     | PDF dibuja un marco con el texto alternativo; DOCX deja `[Imagen: …]`; EPUB conserva el recurso remoto y lo declara; los metadatos cuentan omitidas. | `image-export.test.ts`, panel de exportación                         |
| I-5  | El PDF empezaba los objetos en 0, un número reservado por la especificación.                                              | El objeto 0 queda libre; el catálogo empieza en 1 y la tabla `xref` lo refleja.                                                                      | `pdf.test.ts`, `image-export.test.ts`                                |
| I-6  | Los metadatos PDF se escribían como cadenas Latin-1 y perdían títulos con caracteres fuera de esa tabla.                  | Título, autoría y asunto se escriben como cadenas UTF-16BE (`FEFF…`) en el diccionario de información.                                               | `pdf.test.ts`                                                        |
| I-7  | `Asset` y `BookAsset` existían en Prisma pero no se usaban: no había biblioteca ni persistencia de imágenes.              | Consulta de biblioteca por libro, registro autorizado de `Asset`/`BookAsset`, metadatos y auditoría.                                                 | `assets.ts`, `asset-actions.ts`                                      |
| I-8  | La firma de Cloudinary solo autorizaba la carpeta de portadas; una carpeta interior podía pedirse sin comprobar el libro. | La firma interior exige `section:update`, un libro del espacio de trabajo y una carpeta con espacio, libro e interior.                               | `api/cloudinary/signature/route.ts`, E2E de seguridad                |
| I-9  | Descargar una URL arbitraria del manuscrito desde el servidor era una puerta abierta a SSRF.                              | Solo HTTPS de `res.cloudinary.com/<cloudName>/image/upload/…`, con comprobación también de la URL final tras redirecciones.                          | `images.test.ts`                                                     |
| I-10 | El nombre del archivo de descarga se copiaba a `Content-Disposition` sin limpiar.                                         | Se eliminan controles, comillas y separadores de ruta; se envía `filename` ASCII y `filename*` RFC 5987.                                             | Ruta de descarga; revisión de código                                 |

## Lo que se ha ejecutado, no solo leído

- `pnpm test`: 268 pruebas en 30 archivos.
- `pnpm test:e2e`: 71 pruebas en Chromium contra la compilación de producción.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` y `pnpm build`: correctos.
- `pnpm bench:export`: medición reproducida; las cifras están en
  [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md).

## Lo que quedaba abierto al inicio de la mejora

Estas ausencias impedían declarar 95 y no se compensan con una estimación. El
Lote J cerró el punto 1; el resto sigue abierto.

1. **Notas al pie.** Cerrado en el Lote J: nodo de editor, numeración,
   composición al pie y exportación a PDF, EPUB y DOCX. Quedan las limitaciones
   de texto plano y notas muy largas.
2. **PDF con fuentes incrustadas (cerrado parcialmente en el Lote K).** El
   cuerpo ya usa TTF Liberation incrustadas, `Identity-H`, `ToUnicode` y anchos
   reales; los signos del español se conservan y se pueden extraer. Sigue sin
   cubrir CJK, emoji ni shaping complejo, y no se generan subconjuntos. Si las
   fuentes no se cargan, se conserva la alternativa Times/WinAnsi y se avisa.
3. **Validación externa (cerrada en parte en el Lote L).** El EPUB lo aprueba
   EPUBCheck 5.1.0 (0 errores, 0 advertencias) y el DOCX lo lee Mammoth 1.11.0;
   en el Lote M el PDF lo abre pdf.js 4.10.38. Sigue sin abrirse el DOCX en Word
   o LibreOffice ni probarse el EPUB en un lector comercial.
4. **Cloudinary real.** No hay credenciales locales: la subida se ha validado
   por código y por las pruebas de autorización, no con una cuenta real.
5. **Render y Neon reales.** El despliegue no es accesible desde esta red; las
   pruebas de carga y las cabeceras contra producción siguen pendientes.
6. **Puntuación.** La última medición documentada es 87,4/100. No se emite una
   puntuación nueva hasta cerrar los lotes de Unicode y validación externa.

## Bloqueos externos conocidos

- EPUBCheck ya se usa (Lote L): requiere Java, que no viene con el sistema y
  se instala aparte.
- Word y LibreOffice no están disponibles en la máquina.
- Cloudinary no está configurado en el entorno local.
- El puerto 5432 de Neon está filtrado; las comprobaciones de base usan la API
  SQL por HTTPS.
- Render Free no es accesible desde aquí.

Ningún bloqueo anterior se presenta como un éxito. La rama se considera una
mejora verificada de los lotes de imágenes y notas, no la versión 95 terminada.

## Actualización del Lote J: notas al pie

Fecha: 21 de octubre de 2026.
Base del lote: `4211bb6`.

### Evidencia ejecutada

| Comprobación        | Resultado                |
| ------------------- | ------------------------ |
| Pruebas unitarias   | 280 pruebas, 31 archivos |
| Extremo a extremo   | 79 pruebas en Chromium   |
| Formato, lint       | Sin errores              |
| Tipos y compilación | Sin errores              |

### Hallazgos corregidos

| #   | Hallazgo comprobado                                                                | Corrección                                                                                                                     | Evidencia                                                       |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| J-1 | El editor no tenía nodo ni comando para insertar una nota al pie.                  | Nodo Tiptap `footnote`, botón «†», diálogo de texto, edición al pulsar y borrado con texto vacío.                              | `editorial-footnote.ts`, E2E de inserción y persistencia        |
| J-2 | Una nota no validada podía guardarse sin identidad o sin texto.                    | El esquema exige `id` seguro y `note` no vacío de hasta 2000 caracteres, sin contenido anidado.                                | `tiptap.test.ts` (4 casos)                                      |
| J-3 | La numeración guardada en el JSON quedaría obsoleta al insertar una nota anterior. | La numeración se calcula por orden de aparición con un contador compartido entre secciones.                                    | `blocks.test.ts`, `inline.test.ts` indirectamente, exportadores |
| J-4 | La maqueta no reservaba altura para la nota y podía solaparla con el cuerpo.       | Composición al 78 % del cuerpo, altura reservada, área en la vista previa y diagnóstico `FOOTNOTE_OVERFLOW`.                   | `pagination.test.ts` (2 casos), `paginated-preview.tsx`         |
| J-5 | EPUB, DOCX y PDF no representaban las notas.                                       | EPUB con `noteref`/`footnote`; DOCX con `word/footnotes.xml` y referencias reales; PDF con línea separadora y notas al pie.    | `footnote-export.test.ts` (3 casos)                             |
| J-6 | Las notas muy largas podían perderse o desplazar el texto sin aviso.               | Se conserva la nota completa, se reserva su altura y se emite un diagnóstico visible si no cabe. No se divide automáticamente. | `pagination.ts`, panel de diagnóstico                           |
| J-7 | Copiar y pegar una llamada repetía el identificador y podía descartar una nota.    | La composición usa un identificador por aparición; el DOCX conserva el número y el EPUB genera anclas únicas.                  | `blocks.test.ts` (tercer caso)                                  |

### Lo que sigue abierto

1. **PDF con Unicode completo.** El cuerpo y las notas siguen usando Times y
   WinAnsi, con aviso de caracteres perdidos. Faltan TTF incrustadas y tabla de
   anchos real.
2. **Validación externa.** No se ha pasado EPUBCheck, no se ha abierto el DOCX
   en Word o LibreOffice y no se ha probado un EPUB en un lector comercial.
3. **Cloudinary real.** No hay credenciales locales para probar una subida.
4. **Render y Neon reales.** El despliegue no es accesible desde esta red.
5. **Notas enriquecidas y división.** Las notas son texto plano; una nota
   excepcionalmente larga no se reparte entre páginas.
6. **Puntuación.** La última medición documentada sigue siendo 87,4/100. No se
   emite una puntuación nueva sin cerrar los lotes de Unicode y validación
   externa.

## Actualización del Lote K: fuentes TTF y PDF Unicode

Fecha: 21 de octubre de 2026.
Base del lote: `dc7c6ea`.

### Evidencia ejecutada

| Comprobación         | Resultado                |
| -------------------- | ------------------------ |
| Pruebas unitarias    | 328 pruebas, 34 archivos |
| Extremo a extremo    | 79 pruebas en Chromium   |
| Formato, lint        | Sin errores              |
| Tipos y compilación  | Sin errores              |
| Banco de exportación | Ejecutado con fuentes    |

### Hallazgos corregidos

| #   | Hallazgo comprobado                                                                                                            | Corrección                                                                                                                        | Evidencia                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| K-1 | El PDF solo declaraba Times-Roman, Times-Bold y Times-Italic; dependía del lector.                                             | Se incrustan TTF completas como `Type0`/`CIDFontType2`, con `FontFile2`, `Identity-H` y `CIDToGIDMap /Identity`.                  | `pdf-fonts.test.ts` (6 casos)                      |
| K-2 | La paginación usaba anchos medios y no la fuente que después se imprimía.                                                      | `MeasureText` recorre paginación, pies de imagen, notas, reglas y folios; las métricas salen de `hmtx` y `cmap`.                  | `pagination.test.ts`, `measure.ts`                 |
| K-3 | El texto no tenía mapa de extracción: buscar o copiar dependía del lector.                                                     | Cada fuente incrustada lleva `ToUnicode`; la prueba E2E extrae «Cita», raya, puntos suspensivos, `niño`, `caía` y `miró`.         | `exportacion.spec.ts`                              |
| K-4 | El justificado con `Tw` no es fiable en códigos de dos bytes de `Identity-H`.                                                  | El espacio extra se reparte con ajustes `TJ`; el avance de los tramos incluye ese espacio para no solapar el texto siguiente.     | `pdf-fonts.test.ts`, `generate.ts`                 |
| K-5 | Incrustar todas las caras aunque no se usaran aumentaría el archivo sin necesidad.                                             | Solo se procesan las caras que aparecen en los tramos; las demás se omiten.                                                       | `pdf-fonts.test.ts` («solo las caras usadas»)      |
| K-6 | Una fuente ausente podía dejar la paginación como si fuera exacta.                                                             | Si no se cargan las fuentes, se usa Times/WinAnsi, `estimatedPagination` queda en `true` y el panel lo avisa.                     | `fonts.ts`, `export-panel.tsx`                     |
| K-7 | Las fuentes debían ser redistribuibles y no depender de las instaladas en Windows.                                             | Se usan Liberation Fonts 2.1.5, licencia SIL OFL; se incluyen `OFL.txt` y las doce caras en `public/fonts/liberation/`.           | `apps/web/public/fonts/liberation/`                |
| K-8 | La vista previa se componía con el modelo aproximado mientras el PDF usaba métricas reales: los cortes de línea no coincidían. | La vista previa inyecta el mismo medidor real; la página declara si la composición es exacta o estimada.                          | `preview.ts`, `maquetacion.spec.ts`                |
| K-9 | La cursiva se medía con los anchos de la redonda, así que el PDF podía solapar un tramo en cursiva con el siguiente.           | El medidor elige la cara que se dibuja (`regular`, `bold`, `italic`, `boldItalic`) y la composición de tramos propaga la cursiva. | `rich-text.test.ts`, `measure.test.ts`, `fonts.ts` |

### Cobertura y límites

- La fuente se incrusta completa, sin subconjuntos. Para 200 000 palabras el
  PDF medido ocupa 5 387 KB; no es un archivo pequeño, pero es autocontenido.
- Liberation cubre latín, griego y cirílico. **No cubre CJK, emoji ni todos los
  sistemas de escritura**, y no hay shaping complejo ni ligaduras automáticas.
  Los caracteres sin glifo se sustituyen y se cuentan en `caracteresPerdidos`.
- No se ha añadido una cadena de fuentes de reserva por script. «Unicode
  completo» sigue sin estar demostrado para todos los idiomas.
- EPUBCheck, Word/LibreOffice, Cloudinary real, Render y Neon por 5432 siguen
  sin poder verificarse localmente.

### Puntuación

La puntuación documentada **no sube a 95**. Se mantiene la última medición
conservadora de 87,4/100 hasta que la validación externa y la cobertura
Unicode pendientes puedan demostrarse. El Lote K mejora el PDF, pero no
autoriza a declarar terminado lo que no se ha probado.

## Actualizacion del Lote L: validacion externa y escaneo de dependencias

Fecha: 21 de octubre de 2026.
Base del lote: `86610b6`.

| Comprobacion         | Resultado                                                                            |
| -------------------- | ------------------------------------------------------------------------------------ |
| `pnpm validate:epub` | 0 errores fatales, 0 errores, 0 advertencias (EPUBCheck 5.1.0, reglas EPUB 3.3)      |
| E2E con EPUBCheck    | El EPUB que descarga la aplicacion tambien valida sin errores                        |
| `pnpm validate:docx` | El DOCX lo lee Mammoth 1.11.0: texto, negrita, cursiva, enlace, nota al pie e imagen |
| `pnpm audit --prod`  | Sin vulnerabilidades conocidas                                                       |
| `pnpm audit`         | 1 aviso alto de desarrollo (`braces`), sin parche upstream                           |
| `pnpm test`          | 328 pruebas en 34 archivos                                                           |
| `pnpm test:e2e`      | 79 pruebas en Chromium                                                               |

Correcciones asociadas:

- El EPUB ya no se da por bueno solo por su estructura: lo aprueba la
  herramienta oficial del W3C. La prueba de extremo a extremo valida el
  archivo que descarga la aplicacion, no un ejemplo.
- El DOCX lo abre un lector OOXML independiente del motor que lo escribe.
- El aviso de `deepmerge-ts` (GHSA-ggr8-5vv4-36mx), que llegaba por el CLI de
  Prisma, se corrige con un `override` a la version 8.0.0. `pnpm db:generate` y
  `pnpm db:validate` siguen funcionando.

Lo que sigue sin verificarse: Word y LibreOffice, la subida real a Cloudinary,
el despliegue en Render, Neon por 5432, el pentest y la cobertura Unicode mas
alla de latin, griego y cirilico. La puntuacion documentada sigue siendo
87,4/100: **95 no se declara**.

## Actualizacion del Lote M: compresion y validacion externa del PDF

Fecha: 21 de octubre de 2026.
Base del lote: `c43ee27`.

| Comprobacion         | Resultado                                                             |
| -------------------- | --------------------------------------------------------------------- |
| `pnpm validate:pdf`  | pdf.js 4.10.38 abre el PDF y extrae el texto con la fuente incrustada |
| `pnpm validate:epub` | 0 errores y 0 advertencias con EPUBCheck 5.1.0                        |
| `pnpm validate:docx` | Mammoth 1.11.0 lee el documento                                       |
| `pnpm test`          | 328 pruebas en 34 archivos                                            |
| `pnpm test:e2e`      | 79 pruebas en Chromium                                                |
| `pnpm bench:export`  | PDF de 671 KB, EPUB de 29 KB y DOCX de 8 KB para 200 000 palabras     |

Correcciones:

- El PDF comprime sus flujos con `FlateDecode`. El archivo de 200 000 palabras
  pasa de 5 387 KB a 671 KB, ocho veces menos, sin cambiar lo que se ve ni lo
  que se extrae.
- El ZIP del EPUB y del DOCX comprime sus entradas con Deflate. La entrada
  `mimetype` del EPUB sigue sin comprimir y en primer lugar, como exige la
  especificacion.
- El PDF lo abre ahora una herramienta externa, pdf.js, el lector de Mozilla.
  Con el Lote L ya lo leian EPUBCheck y Mammoth: los tres formatos exportados
  tienen una validacion independiente del motor que los escribe.

Lo que sigue sin verificarse: Word y LibreOffice, la subida real a Cloudinary,
el despliegue en Render, Neon por 5432, el pentest y la cobertura Unicode mas
alla de latin, griego y cirilico. La puntuacion documentada sigue siendo
87,4/100: **95 no se declara**.

## Actualizacion del Lote N: prueba de esfuerzo y memoria de la exportacion

Fecha: 21 de octubre de 2026.
Base del lote: `29dac65`.

| Comprobacion         | Resultado                                                                |
| -------------------- | ------------------------------------------------------------------------ |
| `pnpm stress:export` | 200 000 palabras, 80 fotografias y 500 notas al pie en los tres formatos |
| Memoria maxima       | 367 MB, con un margen de 145 MB sobre los 512 MB de Render Free          |
| `pnpm test`          | 328 pruebas en 34 archivos                                               |
| `pnpm test:e2e`      | 79 pruebas en Chromium                                                   |

Correcciones:

- La prueba de esfuerzo que faltaba: un manuscrito grande con imagenes y notas
  al pie, exportado a los tres formatos, con tiempo, tamano y memoria maxima.
- **Fallo encontrado y corregido.** La primera ejecucion daba 1 647 MB de
  memoria: el escritor de ZIP armaba el archivo en una lista de numeros, con
  lo que un ZIP de 40 MB ocupaba mas de un gigabyte. La exportacion de un
  libro con 80 fotografias no cabia en Render Free. Con un bufer de bytes que
  crece por duplicacion, la memoria baja a 367 MB y la escritura es el doble
  de rapida.
- La documentacion ya no afirma que un libro con 80 fotos quepa en el limite
  de memoria: ahora hay una cifra medida.

Lo que sigue sin verificarse: Word y LibreOffice, la subida real a Cloudinary,
el despliegue en Render, Neon por 5432, el pentest y la cobertura Unicode mas
alla de latin, griego y cirilico. La puntuacion documentada sigue siendo
87,4/100: **95 no se declara**.

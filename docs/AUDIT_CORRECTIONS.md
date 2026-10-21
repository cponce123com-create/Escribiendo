# Correcciones de la auditoría

Registro cronológico de lo que se ha corregido, con su evidencia. Cada
corrección va acompañada de las pruebas que la sostienen.

---

## Lote 1 — Integridad de manuscritos

Rama: `audit/optimization-95`. Commit: pendiente de cerrar en este lote.

### Problemas confirmados

Los ocho hallazgos del área de guardado y recuperación de
[AUDIT_BASELINE.md](AUDIT_BASELINE.md) se comprobaron **contra el código** y
resultaron ciertos:

- El autoguardado era un `setInterval` de 60 segundos (`AUTOSAVE_INTERVAL_MS`),
  de modo que hasta un minuto de trabajo se perdía al cerrar la pestaña.
- No existía ninguna copia local del texto: el editor solo sabía hablar con el
  servidor.
- `persist` llamaba a `setDirty(false)` sin comprobar si se había seguido
  escribiendo durante la petición: la interfaz decía «todo guardado» con texto
  sin guardar.
- No había control del orden de las respuestas: dos guardados solapados
  podían dejar la versión del servidor desfasada.
- Ante un conflicto de versión, el servidor devolvía un mensaje y el cliente
  solo podía recargar la página, con lo que el trabajo de quien escribía se
  perdía.
- No se escuchaban los eventos `online` y `offline`.
- Un autoguardado pospuesto por el servidor (por el límite de 45 s) se
  respondía como `success`, y el editor lo tomaba por un guardado real.
- El aviso `beforeunload` era la única protección: advertía, pero no salvaba.

### Soluciones implementadas

| Archivo                                                               | Qué hace                                                                                                                                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/editor/drafts.ts`                                   | Almacén de borradores en **IndexedDB** (no `localStorage`), con respaldo en memoria cuando el navegador no lo ofrece. Clave por cuenta, libro y sección.                     |
| `apps/web/src/lib/editor/sync.ts`                                     | Máquina de estados pura: `idle`, `local`, `syncing`, `synced`, `offline`, `error`, `conflict`. Espera de reintento exponencial con dispersión.                               |
| `apps/web/src/lib/editor/sync.test.ts`                                | 20 pruebas unitarias de las transiciones, del reintento y de las invariantes.                                                                                                |
| `apps/web/src/lib/editor/drafts.test.ts`                              | 7 pruebas unitarias del almacén, incluida la caída a memoria sin IndexedDB.                                                                                                  |
| `apps/web/src/components/books/section-editor.tsx`                    | Reescrito: rebote de 700 ms al equipo, envío al servidor a los 3 s, detección de conexión, reintentos, control de orden de respuestas y recuperación al abrir.               |
| `apps/web/src/components/books/section-conflict.tsx`                  | Panel de conflicto con **comparación por palabras** (reutiliza el diff de la Fase 3) y dos salidas: conservar la versión local o adoptar la del servidor.                    |
| `apps/web/src/lib/books/actions.ts`                                   | `saveSectionAction` devuelve la versión del servidor en caso de conflicto, distingue un guardado pospuesto (`throttled`) y acepta un guardado forzado y explícito (`force`). |
| `apps/web/src/app/(app)/books/[bookId]/sections/[sectionId]/page.tsx` | Pasa el libro y la cuenta al editor, que los necesita para identificar el borrador.                                                                                          |

### Comportamiento nuevo, verificable

1. **Ninguna respuesta vieja puede marcar el texto como guardado.** Cada
   petición lleva un número; las respuestas que no son la última se ignoran.
2. **Escribir durante un envío deja el texto pendiente.** Se compara la
   versión local con la que se envió; si han cambiado, el estado vuelve a
   «guardado en este equipo».
3. **Un autoguardado pospuesto no se confunde con un guardado.** La respuesta
   lleva `throttled: true` y el texto sigue pendiente.
4. **Un conflicto no descarta ninguna de las dos versiones.** El servidor
   devuelve la suya y la interfaz las compara.
5. **El estado nunca dice «guardado» sin confirmación del servidor.** Los
   estados son explícitos y la región `aria-live` los anuncia.

### Pruebas ejecutadas

| Suite                               | Resultado                                                              |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `pnpm test` (unitarias)             | 216 en verde (24 archivos), 29 nuevas de este lote                     |
| `pnpm test:e2e` (extremo a extremo) | 64 en verde contra la compilación de producción, 9 nuevas de este lote |
| `pnpm typecheck`                    | Sin errores                                                            |
| `pnpm lint`                         | Sin errores                                                            |
| `pnpm build`                        | Correcto                                                               |

Las nueve pruebas nuevas están en `tests/e2e/manuscrito.spec.ts` y cubren:
guardado local inmediato, escritura sin conexión, servidor caído con
recuperación al recargar, escritura durante una petición en curso, dos
pestañas con conflicto, resolución del conflicto conservando la versión local
y persistencia tras recargar.

El detalle de cada escenario está en [RECOVERY_TESTS.md](RECOVERY_TESTS.md).

### Falso positivo detectado y corregido durante el lote

El `beforeunload` solo avisa; no salva. En un primer momento se confundió el
aviso con una protección y se dio por buena la persistencia local. La
prueba de «servidor caído» lo puso de manifiesto: al recargar, el texto no
estaba. La persistencia local es la que lo resuelve, no el aviso.

### Riesgos que quedan

- El borrador local vive en el navegador: en un equipo compartido, quien
  pueda usar el mismo perfil del sistema operativo podría abrirlo desde las
  herramientas del navegador. Está documentado en `drafts.ts` y en
  [SECURITY.md](SECURITY.md).
- Si la persona borra los datos del navegador antes de que el servidor
  confirme, el texto se pierde. Por eso el estado nunca dice «guardado» antes
  de la confirmación del servidor.
- El límite de 45 s entre guardados automáticos del servidor sigue en pie: es
  deliberado, para no crear una revisión por pulsación. El texto no se pierde
  por eso, porque queda en el equipo hasta que el servidor lo acepte.

## Lote E — fidelidad editorial del formato en línea

Fecha: 21 de octubre de 2026. Rama: `main`.

### Qué estaba mal

1. La vista previa y la exportación usaban **dos conversores distintos**. El de
   la exportación aplanaba el documento a texto: negritas, cursivas, enlaces y
   superíndices se perdían sin aviso.
2. Los separadores de escena (`horizontalRule`) se convertían en **saltos de
   página** en el EPUB y el DOCX. Una pausa de escena partía el capítulo en dos.
3. El PDF dibujaba una sola fuente por línea. Aunque el documento tuviera
   negritas, la línea entera salía en redonda.
4. Los títulos se medían con el ancho de la redonda y se imprimían en negrita:
   el cálculo podía dar por buena una línea que en el papel se salía.

### Qué se ha cambiado

- `packages/editorial-engine/src/rich-text.ts`: modelo de tramos (`InlineRun`,
  `InlineMarks`) y reparto de líneas que mide cada tramo con su estilo. Sin
  marcas, delega en el camino rápido de siempre.
- `measure.ts`: la negrita se mide con un factor de 1,03 (`BOLD_FACTOR`), no
  simulando un cuerpo mayor.
- `pagination.ts`: `LayoutBlock.runs` y `LaidOutLine.segments`; los títulos se
  miden en negrita.
- `apps/web/src/lib/layout/inline.ts`: lectura única de las marcas de Tiptap,
  compartida por la vista previa y la exportación.
- `apps/web/src/lib/layout/blocks.ts`: conserva negrita, cursiva, subrayado,
  tachado, superíndice, subíndice, código y enlaces; conserva reglas e
  imágenes.
- `apps/web/src/lib/export/manuscript.ts`: el mismo formato para EPUB y DOCX;
  los separadores dejan de ser saltos de página; las listas ordenadas se
  numeran.
- `packages/export-engine/src/pdf.ts`: Times-BoldItalic, subrayado y tachado
  trazados, desplazamiento de línea base para superíndices.
- `packages/export-engine/src/epub.ts`: `<strong>`, `<em>`, `<u>`, `<s>`,
  `<sup>`, `<sub>`, `<a>`, `<hr class="scene"/>`, `<figure>` con recursos
  remotos declarados.
- `packages/export-engine/src/docx.ts`: `<w:rPr>` por tramo, hipervínculos con
  relación externa y separador como borde de párrafo.
- `apps/web/src/components/layout/paginated-preview.tsx`: pinta los segmentos
  con su estilo.
- `apps/web/src/components/books/section-editor.tsx`: botones de subrayado y
  enlace; el enlace no navega al hacer clic dentro del editor.

### Pruebas

| Prueba                                             | Resultado                          |
| -------------------------------------------------- | ---------------------------------- |
| `packages/editorial-engine/src/rich-text.test.ts`  | 13 nuevas                          |
| `apps/web/src/lib/layout/blocks.test.ts`           | 6 nuevas                           |
| `packages/export-engine/src/epub.test.ts`          | 6 nuevas                           |
| `packages/export-engine/src/pdf.test.ts`           | 3 nuevas                           |
| `packages/editorial-engine/src/pagination.test.ts` | 1 nueva (tramos conservados)       |
| E2E de exportación                                 | La negrita llega al PDF como `/F2` |

Total: 249 unitarias y 70 E2E en verde.

### Lo que sigue sin estar resuelto

- Las imágenes se conservan en el modelo y el EPUB las incluye como recurso
  remoto, pero el PDF y el DOCX no las dibujan.
- Las notas al pie no tienen editor ni composición.
- El EPUB no se ha validado con EPUBCheck ni el DOCX se ha abierto en Word.
- Las fuentes del PDF siguen siendo las estándar: la paginación es una
  estimación de anchos, no la medida de una fuente incrustada.

---

## Lote I — Imágenes de extremo a extremo

Fecha: 21 de octubre de 2026.
Rama: `improvement/escribiendo-95`.
Base: `0f65b1e`.

### Qué estaba mal

1. El editor registraba solo `StarterKit` y no tenía nodo de imagen. Una imagen
   no se podía insertar, ni con un comando, ni desde la interfaz.
2. `LayoutBlock.image` solo guardaba `src` y `alt`; la paginación no reservaba
   altura para la imagen ni para su pie.
3. El PDF y el DOCX no dibujaban imágenes. El EPUB conservaba la URL remota,
   pero no incrustaba el archivo.
4. Los modelos `Asset` y `BookAsset` existían en Prisma y no se usaban.
5. La firma de Cloudinary solo autorizaba la carpeta de portadas.
6. El PDF empezaba los objetos en 0, un número reservado por la especificación,
   y escribía los metadatos como cadenas Latin-1.
7. Descargar una URL cualquiera del manuscrito desde el servidor permitía SSRF.
8. El nombre del archivo de descarga llegaba sin sanear a
   `Content-Disposition`.

### Qué se ha cambiado

| Área         | Archivos                                                                                                    | Cambio                                                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Editor       | `components/editor/editorial-image.ts`, `components/books/section-image-controls.tsx`, `section-editor.tsx` | Nodo `image` con pie, dimensiones, porcentaje, alineación y `publicId`; inserción, reemplazo, eliminación y biblioteca.            |
| Persistencia | `lib/books/assets.ts`, `lib/books/asset-actions.ts`, `api/cloudinary/signature/route.ts`                    | Biblioteca por libro, registro autorizado en `Asset`/`BookAsset`, carpeta interior por espacio y libro, auditoría.                 |
| Maqueta      | `packages/editorial-engine/src/image.ts`, `pagination.ts`, `apps/web/src/lib/layout/image.ts`, `blocks.ts`  | Caja real de imagen, pie, proporción, alineación y descuento del espacio anterior y posterior.                                     |
| PDF          | `packages/export-engine/src/pdf.ts`, `image-processing.ts`                                                  | XObjects JPEG `DCTDecode`, dibujo, marcador visible, metadatos UTF-16BE y objeto 0 libre.                                          |
| EPUB         | `packages/export-engine/src/epub.ts`                                                                        | Imágenes en `EPUB/images/`, manifiesto y rutas relativas; recurso remoto declarado solo si faltan los bytes.                       |
| DOCX         | `packages/export-engine/src/docx.ts`                                                                        | `word/media/`, relaciones, `wp:inline`, `a:blip`, texto alternativo, pie y dimensiones EMU.                                        |
| Descarga     | `api/exports/[jobId]/download/route.ts`                                                                     | Nombre saneado, `filename*` RFC 5987, `X-Download-Options: noopen` y tipo MIME del archivo generado.                               |
| Red          | `lib/export/images.ts`                                                                                      | Allowlist de Cloudinary, HTTPS, timeout de 15 s, máximo de 15 MB, 80 imágenes y concurrencia 4; se comprueba también la URL final. |

### Pruebas ejecutadas

| Suite               | Resultado                  |
| ------------------- | -------------------------- |
| `pnpm test`         | 268 pruebas en 30 archivos |
| `pnpm test:e2e`     | 71 pruebas en Chromium     |
| `pnpm format:check` | Correcto                   |
| `pnpm lint`         | Sin errores                |
| `pnpm typecheck`    | Sin errores                |
| `pnpm build`        | Correcto                   |

Pruebas nuevas de este lote:

- `packages/export-engine/src/image-export.test.ts`: 6 casos de PDF, EPUB y
  DOCX con imágenes incrustadas, recursos remotos y marcadores de ausencia.
- `packages/editorial-engine/src/image.test.ts`: 5 casos de geometría, pie,
  porcentaje y reducción por altura.
- `apps/web/src/lib/export/images.test.ts`: 4 casos de allowlist y de
  reutilización de imágenes ya resueltas.
- `packages/editorial-engine/src/pagination.test.ts`: 1 caso de imagen con pie
  y espacio anterior/posterior.
- `tests/e2e/manuscrito.spec.ts`: 1 caso de controles de imagen y biblioteca.
- Se actualizaron las expectativas de `pdf.test.ts` y `blocks.test.ts` para los
  metadatos UTF-16BE y los atributos editoriales.

### Lo que sigue sin estar resuelto

- La subida real a Cloudinary no se ha probado: no hay credenciales locales.
- EPUBCheck, Word y LibreOffice no están disponibles; la estructura se
  comprueba byte a byte, no con esas herramientas.
- Las notas al pie siguen sin editor ni composición.
- El cuerpo del PDF sigue usando fuentes estándar y WinAnsi. Los metadatos ya
  son Unicode, pero el texto con caracteres sin equivalente se sustituye por
  `□` y se cuenta.
- No se ha medido el coste de descargar y normalizar 80 imágenes en Render
  Free; solo se ha acotado por código.

---

## Lote J — Notas al pie de extremo a extremo

Fecha: 21 de octubre de 2026.
Rama: `improvement/escribiendo-95`.
Base del lote: `4211bb6`.

### Qué estaba mal

1. El editor solo tenía `StarterKit`: no existía un nodo para insertar una
   llamada a nota ni una forma de editar su texto.
2. La maqueta no reservaba altura para las notas; una nota habría quedado
   fuera del área de texto o habría desplazado el cuerpo sin avisar.
3. PDF, EPUB y DOCX no tenían ninguna representación de notas al pie.
4. La numeración no podía depender de un número guardado en el JSON: insertar
   una nota antes de otra debía renumerar las siguientes.

### Qué se ha cambiado

| Área       | Archivos                                                                                                        | Cambio                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Esquema    | `packages/book-schema/src/tiptap.ts`                                                                            | Nodo `footnote` con `id` validado y `note` no vacío de hasta 2000 caracteres; texto plano y conteo incluyen la nota.                                            |
| Editor     | `components/editor/editorial-footnote.ts`, `section-editor.tsx`, `globals.css`                                  | Nodo atómico en línea, numeración dinámica por decoraciones, botón «†», inserción con diálogo y edición o borrado al pulsar la llamada.                         |
| Conversión | `lib/layout/inline.ts`, `lib/layout/blocks.ts`, `lib/export/manuscript.ts`                                      | La nota se convierte en un tramo superíndice con identidad, número y texto; un contador compartido numera todas las secciones en orden de lectura.              |
| Maqueta    | `packages/editorial-engine/src/rich-text.ts`, `pagination.ts`, `paginated-preview.tsx`, `diagnostics-panel.tsx` | Medición real del superíndice, composición de la nota al 78 % del cuerpo, reserva de altura, área visible en la vista previa y diagnóstico `FOOTNOTE_OVERFLOW`. |
| EPUB       | `packages/export-engine/src/epub.ts`                                                                            | `epub:type="noteref"` en la llamada y `aside`/`li` con `epub:type="footnote"` al final del capítulo, con enlace de vuelta.                                      |
| DOCX       | `packages/export-engine/src/docx.ts`                                                                            | `word/footnotes.xml`, relación `footnotes`, override de tipo de contenido, estilos `FootnoteText`/`FootnoteReference` y `w:footnoteReference` reales.           |
| PDF        | `packages/export-engine/src/pdf.ts`, `lib/export/generate.ts`                                                   | Línea separadora vectorial y notas compuestas al pie de cada página, con la altura que reservó la paginación.                                                   |

### Pruebas ejecutadas

| Suite               | Resultado                  |
| ------------------- | -------------------------- |
| `pnpm test`         | 280 pruebas en 31 archivos |
| `pnpm test:e2e`     | 72 pruebas en Chromium     |
| `pnpm format:check` | Correcto                   |
| `pnpm lint`         | Sin errores                |
| `pnpm typecheck`    | Sin errores                |
| `pnpm build`        | Correcto                   |

Pruebas nuevas de este lote:

- `packages/book-schema/src/tiptap.test.ts`: 4 casos de aceptación y rechazo
  de la estructura de una nota.
- `apps/web/src/lib/layout/blocks.test.ts`: 3 casos de conversión, numeración
  global entre secciones y llamadas copiadas con el mismo identificador
  guardado.
- `packages/editorial-engine/src/pagination.test.ts`: 2 casos de composición
  al pie y descuento de altura.
- `packages/export-engine/src/footnote-export.test.ts`: 3 casos de EPUB, DOCX
  y PDF.
- `tests/e2e/manuscrito.spec.ts`: inserción, numeración, guardado y
  persistencia de una nota en el editor real.

### Lo que sigue sin estar resuelto

- La nota es texto plano: no admite cursiva, negrita ni enlaces dentro de la
  nota.
- Una nota excepcionalmente larga puede no caber con su llamada en una página.
  En ese caso se conserva entera, se emite `FOOTNOTE_OVERFLOW` y la maqueta
  debe revisarse; no se divide automáticamente entre páginas.
- EPUBCheck, Word y LibreOffice siguen sin estar disponibles. La estructura
  OOXML/EPUB se comprueba en las pruebas, no con esas aplicaciones.
- El cuerpo del PDF usaba Times/WinAnsi en este lote. El Lote K lo sustituye
  por TTF Liberation incrustadas; la cobertura limitada se documenta más abajo.

---

## Lote K: fuentes TTF, métricas reales y Unicode en el PDF

Fecha: 21 de octubre de 2026.
Rama: `improvement/escribiendo-95`.
Base del lote: `dc7c6ea`.

### Qué estaba mal

1. El PDF solo usaba las fuentes estándar del lector. La paginación estimaba
   los anchos y el texto fuera de WinAnsi se sustituía por un signo vacío.
2. El justificado se apoyaba en `Tw`, que no funciona igual con códigos de dos
   bytes de `Identity-H`.
3. No había forma de extraer el texto de un PDF con fuentes incrustadas ni de
   saber si la paginación era real o estimada.
4. La vista previa paginada se componía con el modelo aproximado mientras el
   PDF usaba métricas reales: sus cortes de línea no coincidían.
5. La cursiva se medía con los anchos de la redonda, de modo que un tramo en
   cursiva podía solaparse con el siguiente al colocarlo en el PDF.

### Qué se ha cambiado

| Área         | Archivos                                                                | Cambio                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lector TTF   | `packages/export-engine/src/truetype.ts`                                | Lectura de `head`, `maxp`, `hhea`, `hmtx`, `cmap` (formatos 0, 4, 6 y 12), `name`, `OS/2` y `post`; métricas, glifos y mapa inverso.                    |
| Escritor PDF | `packages/export-engine/src/pdf.ts`                                     | Objetos `Type0`, `CIDFontType2`, `FontFile2`, `CIDToGIDMap /Identity`, `ToUnicode`, tabla `W` y fuentes solo para las caras usadas.                     |
| Métricas     | `packages/editorial-engine/src/measure.ts`, `pagination.ts`, `image.ts` | `MeasureText` opcional propagado a líneas, notas, pies de imagen, reglas y folios.                                                                      |
| Orquestación | `apps/web/src/lib/export/fonts.ts`, `generate.ts`                       | Carga y cachea las doce caras, pasa la medición real a la paginación y al PDF, añade `family` a los tramos y reparte el justificado con `TJ`.           |
| Vista previa | `apps/web/src/lib/layout/preview.ts`, `books/[bookId]/preview/page.tsx` | La vista previa compone con el mismo medidor real que el PDF y declara si la composición es exacta o estimada.                                          |
| Cursiva      | `packages/editorial-engine/src/rich-text.ts`, `measure.ts`, `fonts.ts`  | El tramo conserva su estilo al medirse: la cursiva usa su propia cara (`italic` o `boldItalic`) en la composición y en la colocación del PDF.           |
| Interfaz     | `components/export/export-panel.tsx`, `lib/export/actions.ts`           | Muestra las fuentes incrustadas y avisa si la paginación es estimada; el aviso de caracteres perdidos ya no atribuye la pérdida a la «fuente estándar». |
| Activos      | `apps/web/public/fonts/liberation/`                                     | Liberation Fonts 2.1.5, doce TTF, `OFL.txt` y nota de licencia.                                                                                         |

### Pruebas ejecutadas

| Suite               | Resultado                  |
| ------------------- | -------------------------- |
| `pnpm test`         | 289 pruebas en 32 archivos |
| `pnpm test:e2e`     | 72 pruebas en Chromium     |
| `pnpm format:check` | Correcto                   |
| `pnpm lint`         | Sin errores                |
| `pnpm typecheck`    | Sin errores                |
| `pnpm build`        | Correcto                   |
| `pnpm bench:export` | Ejecutado con fuentes      |

Pruebas nuevas o ampliadas:

- `packages/export-engine/src/pdf-fonts.test.ts`: seis casos de lectura de la
  fuente, signos del español, carácter ausente, objetos PDF, caras usadas y
  determinismo.
- `packages/editorial-engine/src/pagination.test.ts`: un caso comprueba que
  `paginate` usa el medidor real para decidir los cortes de línea.
- `packages/editorial-engine/src/measure.test.ts` y `rich-text.test.ts`: dos
  casos comprueban que el medidor real recibe el estilo del tramo, incluida la
  cursiva.
- `tests/e2e/maquetacion.spec.ts`: la vista previa declara que usa las métricas
  reales de la fuente.
- `tests/e2e/exportacion.spec.ts`: el PDF descargado declara `Type0`,
  `CIDFontType2`, `FontFile2` y `ToUnicode`; el texto se extrae del mapa y se
  comprueban comillas, raya, puntos suspensivos, eñe, tilde y diéresis.

### Límites que permanecen

- No se generan subconjuntos: se incrusta el TTF completo. El PDF de 200 000
  palabras mide 5 387 KB.
- Liberation cubre latín, griego y cirílico; no cubre CJK, emoji ni todos los
  sistemas de escritura. No hay shaping complejo.
- Los caracteres sin glifo se sustituyen y se cuentan; no se inventa una
  representación.
- EPUBCheck, Word/LibreOffice, Cloudinary real, Render y Neon por 5432 siguen
  bloqueados.
- La puntuación no se declara en 95.

---

## Lote L: validacion externa de las exportaciones y escaneo de dependencias

Fecha: 21 de octubre de 2026.
Rama: `improvement/escribiendo-95`.
Base del lote: `86610b6`.

### Que estaba mal

1. El EPUB se daba por bueno solo por su estructura interna. La herramienta
   oficial del W3C, EPUBCheck, no se habia ejecutado: el documento de
   auditoria lo declaraba como bloqueo sin resolver.
2. El DOCX solo se comprobaba byte a byte. No lo habia leido ninguna
   herramienta independiente del motor que lo escribe.
3. No se habia ejecutado nunca un escaneo de dependencias, y el aviso
   `deepmerge-ts` (GHSA-ggr8-5vv4-36mx) seguia presente sin evaluar.

### Que se ha cambiado

| Area            | Archivo                                                      | Cambio                                                                                                                                  |
| --------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Validacion EPUB | `scripts/validate-epub.ts`, `scripts/lib/export-fixtures.ts` | Genera un EPUB de prueba con el motor y lo valida con EPUBCheck cuando se indica `EPUBCHECK_JAR`.                                       |
| Validacion DOCX | `scripts/validate-docx.ts`                                   | Genera un DOCX de prueba y lo abre con el lector indicado en `DOCX_VALIDATOR` (por ejemplo, Mammoth), comprobando el texto esperado.    |
| E2E exportacion | `tests/e2e/exportacion.spec.ts`                              | El EPUB que descarga la aplicacion se valida con EPUBCheck; el DOCX se guarda en `test-results/docx-generado.docx` para abrirlo aparte. |
| Dependencias    | `pnpm-workspace.yaml`                                        | `override` de `deepmerge-ts` a la version 8.0.0, que corrige el aviso de agotamiento de pila.                                           |

### Pruebas ejecutadas

| Comprobacion         | Resultado                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm validate:epub` | 0 errores fatales, 0 errores, 0 advertencias, 0 indicaciones (EPUB 3.3)                           |
| E2E con EPUBCheck    | El EPUB descargado por la aplicacion: 0 errores y 0 advertencias                                  |
| `pnpm validate:docx` | Mammoth 1.11.0 lee el documento: texto, negrita, cursiva, enlace, nota al pie e imagen incrustada |
| `pnpm audit --prod`  | Sin vulnerabilidades conocidas                                                                    |
| `pnpm audit`         | 1 aviso alto de desarrollo (`braces`), sin version corregida publicada                            |
| `pnpm test`          | 289 pruebas en 32 archivos                                                                        |
| `pnpm test:e2e`      | 72 pruebas en Chromium                                                                            |

### Limites que permanecen

- EPUBCheck valida el EPUB, no la lectura en un lector comercial. Word y
  LibreOffice no estan instalados en esta maquina: la compatibilidad con esas
  aplicaciones no esta comprobada.
- El aviso de `braces` no tiene parche upstream y solo afecta al lint. Se
  documenta en vez de ocultarse: `pnpm audit` sigue informandolo.
- Cloudinary real, Render y Neon por 5432 siguen bloqueados.
- La puntuacion no se declara en 95.

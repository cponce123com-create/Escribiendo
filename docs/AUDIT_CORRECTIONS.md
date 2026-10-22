# Correcciones de la auditoría

Registro cronológico de lo que se ha corregido, con su evidencia. Cada
corrección va acompañada de las pruebas que la sostienen.

> Los lotes van del más antiguo al más reciente. Al final están las últimas
> correcciones (integridad de la maqueta, archivos que no se rompen, el trabajo
> de quien escribe, la aplicación y la operación).

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
| `pnpm test:e2e`     | 80 pruebas en Chromium     |
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
| `pnpm test`         | 332 pruebas en 35 archivos |
| `pnpm test:e2e`     | 80 pruebas en Chromium     |
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
| `pnpm test`          | 332 pruebas en 35 archivos                                                                        |
| `pnpm test:e2e`      | 80 pruebas en Chromium                                                                            |

### Limites que permanecen

- EPUBCheck valida el EPUB, no la lectura en un lector comercial. Word y
  LibreOffice no estan instalados en esta maquina: la compatibilidad con esas
  aplicaciones no esta comprobada.
- El aviso de `braces` no tiene parche upstream y solo afecta al lint. Se
  documenta en vez de ocultarse: `pnpm audit` sigue informandolo.
- Cloudinary real, Render y Neon por 5432 siguen bloqueados.
- La puntuacion no se declara en 95.

---

## Lote M: compresion de los archivos exportados y validacion del PDF con pdf.js

Fecha: 21 de octubre de 2026.
Rama: `improvement/escribiendo-95`.
Base del lote: `c43ee27`.

### Que estaba mal

1. El PDF no comprimia nada: los flujos de las paginas, el programa de la
   fuente y los mapas `ToUnicode` se guardaban sin comprimir. Un manuscrito de
   200 000 palabras pesaba 5 387 KB, casi todo texto que se podia comprimir.
2. El ZIP de EPUB y DOCX solo admitia entradas sin comprimir, con lo que el
   EPUB y el DOCX crecian sin necesidad.
3. El PDF no lo habia abierto ninguna herramienta externa. EPUB y DOCX ya los
   leian EPUBCheck y Mammoth; el PDF se quedaba en las pruebas propias.

### Que se ha cambiado

| Area      | Archivo                                     | Cambio                                                                                                                  |
| --------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| PDF       | `packages/export-engine/src/pdf.ts`         | Los flujos van con `/Filter /FlateDecode`: contenido, programa de la fuente y mapa `ToUnicode`.                         |
| ZIP       | `packages/export-engine/src/zip.ts`         | Las entradas van comprimidas con Deflate; `mimetype` sigue sin comprimir y en primer lugar, como exige el EPUB.         |
| Pruebas   | `packages/export-engine/src/test-utils.ts`  | Utilidades compartidas que despliegan los flujos del PDF y las entradas del ZIP para poder comprobar el contenido real. |
| Validador | `scripts/pdfjs/`, `scripts/validate-pdf.ts` | Validador externo del PDF con pdf.js (Mozilla) y script que genera un PDF de prueba y lo abre con el.                   |
| Banco     | `scripts/benchmark-export.ts`               | El banco mide tambien el tamano del EPUB y del DOCX.                                                                    |

### Pruebas ejecutadas

| Comprobacion         | Resultado                                                                           |
| -------------------- | ----------------------------------------------------------------------------------- |
| `pnpm validate:pdf`  | pdf.js 4.10.38 abre el PDF y devuelve el texto con la fuente incrustada             |
| PDF de la aplicacion | `node scripts/pdfjs/valida-pdf.mjs test-results\pdf-generado.pdf` devuelve el texto |
| `pnpm validate:epub` | 0 errores y 0 advertencias con EPUBCheck 5.1.0                                      |
| `pnpm validate:docx` | Mammoth 1.11.0 lee el documento                                                     |
| `pnpm test`          | 332 pruebas en 35 archivos                                                          |
| `pnpm test:e2e`      | 80 pruebas en Chromium                                                              |
| `pnpm bench:export`  | PDF de 671 KB, EPUB de 29 KB y DOCX de 8 KB para 200 000 palabras                   |

### Tamano medido

| Formato | Antes    | Ahora  |
| ------- | -------- | ------ |
| PDF     | 5 387 KB | 671 KB |
| EPUB    | -        | 29 KB  |
| DOCX    | -        | 8 KB   |

El PDF pesa ocho veces menos. El coste es de CPU: escribirlo pasa de 227 ms a
310 ms para 200 000 palabras. No cambia ni lo que se ve ni lo que se extrae:
las tres herramientas externas leen el archivo igual que antes.

### Limites que permanecen

- No se generan subconjuntos de fuente: la fuente completa sigue incrustada.
- Word y LibreOffice no estan instalados: la compatibilidad con esas
  aplicaciones no esta comprobada.
- La puntuacion no se declara en 95.

---

## Lote N: prueba de esfuerzo y escritor de ZIP sin lista de numeros

Fecha: 21 de octubre de 2026.
Rama: `improvement/escribiendo-95`.
Base del lote: `29dac65`.

### Que estaba mal

1. No habia ninguna prueba de esfuerzo con imagenes ni con notas al pie: el
   banco de rendimiento solo midia texto, y el limite de 80 imagenes de la
   aplicacion nunca se habia comprobado con el motor de exportacion.
2. El escritor de ZIP armaba el archivo en una lista de numeros. Con un libro
   de 80 fotografias, un ZIP de 40 MB ocupaba mas de un gigabyte de memoria:
   la exportacion no cabia en una instancia de Render Free (512 MB).
3. La documentacion daba por hecho que un libro con 80 fotos cabria en el
   limite de memoria, sin medirlo.

### Que se ha cambiado

| Area         | Archivo                                    | Cambio                                                                                                                        |
| ------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Banco        | `scripts/stress-export.ts`                 | Genera 200 000 palabras, 80 fotografias y 500 notas al pie, exporta los tres formatos y mide tiempo, tamano y memoria maxima. |
| Escritor ZIP | `packages/export-engine/src/zip.ts`        | `ByteWriter`: el archivo se escribe en un bufer de bytes que crece por duplicacion, no en una lista de numeros.               |
| Pruebas      | `packages/export-engine/src/zip.test.ts`   | Una entrada de 2 MB se guarda y se recupera sin perder bytes.                                                                 |
| Utilidades   | `packages/export-engine/src/test-utils.ts` | `zipEntriesResumen`: lista las entradas sin desplegarlas, para no gastar memoria en un archivo grande.                        |

### Pruebas ejecutadas

| Comprobacion         | Resultado                                                             |
| -------------------- | --------------------------------------------------------------------- |
| `pnpm stress:export` | PDF de 588 ms y 40 159 KB, EPUB de 1 413 ms, DOCX de 1 355 ms         |
| Memoria maxima       | 367 MB, con un margen de 145 MB sobre los 512 MB de Render Free       |
| Antes del arreglo    | La misma prueba daba 1 647 MB: la exportacion no cabia en Render Free |
| `pnpm test`          | 332 pruebas en 35 archivos                                            |
| `pnpm test:e2e`      | 80 pruebas en Chromium                                                |
| `pnpm validate:epub` | 0 errores y 0 advertencias con EPUBCheck 5.1.0                        |

### Limites que permanecen

- El archivo se genera entero en la memoria de la peticion: con 80
  fotografias y 200 000 palabras se llega a 367 MB. Un manuscrito mayor, o con
  mas imagenes, sigue sin caber en Render Free. La solucion seria escribir el
  archivo a disco o a un almacenamiento temporal, no esta hecha.
- La prueba no descarga imagenes de Cloudinary: las genera con `sharp`, igual
  que la aplicacion las normaliza.
- La puntuacion no se declara en 95.

---

## Lote O: integridad de la maqueta (pagina en blanco, capitulos y secciones excluidas)

Fecha: 21 de octubre de 2026.
Rama: `improvement/escribiendo-95`.
Base del lote: `27fe353`.

### Que estaba mal

1. Al abrir un capitulo, la pagina en curso se marcaba como en blanco **con su
   contenido** (`flushPage(true)` conservaba los bloques). La vista previa
   oculta las paginas en blanco, asi que el final del capitulo anterior
   desaparecia de la vista previa mientras el PDF si lo dibujaba.
2. Un capitulo no empezaba en pagina nueva: continuaba en la pagina en curso,
   de modo que la regla de abrir en recto no se cumplia.
3. La exportacion pasaba `startOnOddPage: false` a proposito, mientras la vista
   previa leia el valor real: los dos archivos podian paginarse distinto.
4. `includeInExport` y `pageBreakBefore` eran columnas muertas: una seccion
   marcada como "no exportar" se exportaba igual, y el salto de pagina propio
   de la seccion no se aplicaba.

### Que se ha cambiado

| Area        | Archivo                                       | Cambio                                                                                                                                                               |
| ----------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motor       | `packages/editorial-engine/src/pagination.ts` | La pagina en curso se cierra **con su contenido**; la pagina en blanco insertada no tiene bloques. Un capitulo o un bloque con salto propio empieza en pagina nueva. |
| Motor       | `packages/editorial-engine/src/pagination.ts` | `LayoutBlock` gana `breaksBefore` para el salto propio de la seccion.                                                                                                |
| Maquetacion | `apps/web/src/lib/layout/blocks.ts`           | `PreviewSection` gana `pageBreakBefore` e `includeInExport`; `bookToBlocks` marca el salto; helper `seccionesExportables`.                                           |
| Maquetacion | `apps/web/src/lib/layout/preview.ts`          | La vista previa lee las columnas nuevas y deja fuera las secciones excluidas.                                                                                        |
| Exportacion | `apps/web/src/lib/export/manuscript.ts`       | `ExportSection` gana los mismos campos; `loadManuscript` excluye las secciones que no se exportan.                                                                   |
| Exportacion | `apps/web/src/lib/export/generate.ts`         | El PDF usa la maqueta real: `startOnOddPage` y `pageBreakBefore` dejan de estar fijados a falso.                                                                     |

### Pruebas ejecutadas

| Comprobacion                                       | Resultado                                                                                                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/editorial-engine/src/pagination.test.ts` | 6 casos nuevos: capitulo en pagina nueva, pagina con contenido nunca en blanco, pagina en blanco sin bloques, salto propio, apertura en recto y aviso de la pagina insertada |
| `apps/web/src/lib/layout/blocks.test.ts`           | 4 casos nuevos: salto de la seccion y filtro de secciones exportables                                                                                                        |
| `tests/e2e/maquetacion.spec.ts`                    | Un caso nuevo: dos capitulos y el final del primero visible en la vista previa                                                                                               |
| `pnpm test`                                        | 300 pruebas en 32 archivos                                                                                                                                                   |
| `pnpm test:e2e`                                    | 73 pruebas en Chromium                                                                                                                                                       |

Los seis casos unitarios del motor **fallan con el comportamiento anterior**
(comprobado ejecutando la suite contra el codigo previo), asi que son un
detector determinista del defecto. La prueba de extremo a extremo comprueba el
flujo completo, pero el defecto dependia de la paridad de las paginas y no
falla siempre; por eso el detector es la prueba unitaria.

### Limites que permanecen

- La paridad de la maqueta depende de la geometria del perfil y del tipo de
  letra del perfil de pagina.
- La puntuacion no se declara en 95.

---

## Lote P: el motor deja de producir archivos rotos

Fecha: 21 de octubre de 2026.
Rama: `improvement/escribiendo-95`.
Base del lote: `f5d818e`.

### Que estaba mal

1. Un solo caracter de control en el manuscrito (U+0007, por ejemplo) hacia que
   EPUBCheck declarase el EPUB entero como invalido: `FATAL(RSC-016) An invalid
XML character`. Comprobado con EPUBCheck 5.1.0.
2. El atributo `href` de un enlace no se validaba: un `javascript:` enviado a
   proposito sobrevivia en el XHTML del EPUB y en la relacion externa del
   DOCX. El editor lo filtra, pero el servidor no.
3. El diff comparaba palabra a palabra con una matriz que crecia con el
   cuadrado del texto, y el limite contaba tokens (espacios incluidos). Un
   capitulo normal reservaba cientos de megabytes **en el navegador**, porque
   el panel de conflicto es un componente de cliente.
4. El espacio inseparable (U+00A0) si partia palabras, en contra de lo que
   decia el codigo: en espanol, «no se rompe» no puede partirse.
5. La opcion `uppercase` se media en mayusculas y se dibujaba en minusculas;
   `smallCaps` no se aplicaba en ningun sitio.

### Que se ha cambiado

| Area       | Archivo                                      | Cambio                                                                                                        |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Esquema    | `packages/book-schema/src/tiptap.ts`         | El texto y las notas se rechazan si llevan caracteres de control; el `href` tiene que usar un esquema seguro. |
| Compartido | `packages/shared/src/{xml-chars,enlaces}.ts` | Utilidad unica para limpiar caracteres y para decidir que enlaces son seguros.                                |
| Escritores | `packages/export-engine/src/xml.ts`          | `escapeXml` compartido que limpia los controles antes de escapar.                                             |
| Escritores | `packages/export-engine/src/{epub,docx}.ts`  | No se escribe un enlace con un esquema peligroso ni en el XHTML ni en la relacion del DOCX.                   |
| Comparador | `packages/book-schema/src/diff.ts`           | El limite cuenta palabras y ademas hay un tope de celdas: la memoria queda acotada.                           |
| Medicion   | `packages/editorial-engine/src/measure.ts`   | El espacio inseparable ya no parte palabras; `smallCaps` queda declarado como reservado.                      |
| PDF        | `apps/web/src/lib/export/generate.ts`        | El PDF dibuja el texto en mayusculas cuando el estilo lo pide, igual que la vista previa.                     |

### Pruebas ejecutadas

| Comprobacion                                    | Resultado                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| EPUBCheck 5.1.0 sobre un EPUB con un control    | 0 errores y 0 advertencias (antes: error fatal)                                 |
| `packages/book-schema/src/tiptap.test.ts`       | 4 casos nuevos: controles en texto y en nota, esquema peligroso y enlace valido |
| `packages/export-engine/src/epub.test.ts`       | 4 casos nuevos: controles y enlaces peligrosos en EPUB y DOCX                   |
| `packages/book-schema/src/diff.test.ts`         | Un caso nuevo: la comparacion enorme degrada a sustitucion completa             |
| `packages/editorial-engine/src/measure.test.ts` | Un caso nuevo: el espacio inseparable no parte palabras                         |
| `pnpm test`                                     | 332 pruebas en 35 archivos                                                      |
| `pnpm test:e2e`                                 | 73 pruebas en Chromium                                                          |

### Lote Q: el trabajo de quien escribe no se pierde ni se cuelga

| Que estaba mal                                                                                                                           | Correccion                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Un borrador local con una version distinta de la del servidor se descartaba **en silencio** y el siguiente autoguardado lo sobrescribia. | Se abre el comparador con las dos versiones y decide quien escribe.                      |
| Un trabajo de exportacion que se quedaba «en proceso» para siempre se mostraba como si estuviera en marcha.                              | Se marca como fallido al pedirlo de nuevo (`EXPORT_JOB_TIMEOUT_MINUTES`).                |
| La descarga regeneraba el archivo entero en cada clic y servia tambien trabajos fallidos.                                                | Solo se sirven trabajos terminados (409 en los demas).                                   |
| A la interfaz le llegaban errores internos de Prisma (nombres de indices y columnas).                                                    | El detalle va al registro; a la interfaz solo llega un mensaje claro.                    |
| Las dos barreras que protegen la base de pruebas de la E2E compartian anulacion.                                                         | Cada barrera tiene la suya: `E2E_ALLOW_NON_TEST_DATABASE` y `E2E_ALLOW_REMOTE_DATABASE`. |
| Los JSON del borrador y del servidor se parseaban sin proteccion.                                                                        | Se parsean con try/catch: un borrador danado avisa en vez de romper la pagina.           |

Pruebas: `apps/web/src/lib/export/job-estado.test.ts` (3 casos) y
`scripts/lib/e2e-database.test.ts` (6 casos, incluidas las dos anulaciones
independientes). 332 unitarias en 35 archivos y 73 E2E en Chromium.

### Lote R: la aplicacion no se cuelga ni se aburre

| Que estaba mal                                                                                                                        | Correccion                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| La pagina de estadisticas cargaba **todo** el historial de revisiones del estudio, dos veces.                                         | Solo se cargan las revisiones del periodo, con la revision anterior como referencia, y una cache de un minuto. |
| La prueba de permisos «exhaustiva» solo comprobaba que la funcion devolvia un booleano y dejaba fuera `team:manage` y `audit:export`. | La lista de acciones es la fuente del tipo y la comparacion es real: hay casos para los roles delicados.       |
| Quien revisa no podia comentar, en contra de lo que promete la interfaz al invitarlo.                                                 | `comment:create` incluye al rol de revision.                                                                   |
| Firmar una subida a Cloudinary no comprobaba el rol para las portadas.                                                                | La comprobacion de rol se aplica a los dos propositos.                                                         |
| Las paginas con manuscrito no llevaban `Cache-Control: no-store` explicito.                                                           | `/books`, `/notes`, `/stats` y `/team` se marcan como privadas y sin cache.                                    |
| Retirar a alguien, revocar una invitacion, borrar una nota, un objetivo o un perfil: un solo clic.                                    | Piden confirmacion en el sitio, sin ventanas del navegador.                                                    |

Pruebas: 332 unitarias en 35 archivos y 73 E2E en Chromium (la de escritura
comprueba ahora la confirmacion).

---

## Lote S: integracion continua, control de tamano y accesibilidad automatica

Fecha: 21 de octubre de 2026.
Rama: `improvement/escribiendo-95`.
Base del lote: `b26c522`.

### Que estaba mal

1. No habia integracion continua: nada se ejecutaba al abrir una PR, y el
   despliegue automatico de Render iba a `main` sin ninguna prueba que lo
   frenara.
2. No habia forma de detectar que el JavaScript del cliente o las fuentes
   publicas crecian sin avisar.
3. La accesibilidad era una limitacion documentada, sin ninguna comprobacion
   automatica.
4. No habia revision periodica de dependencias: el unico aviso de seguridad
   conocido se habia encontrado a mano.

### Que se ha cambiado

| Area          | Archivo                           | Cambio                                                                                                      |
| ------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| CI            | `.github/workflows/ci.yml`        | Formato, analisis, tipos, pruebas, tamano y compilacion en Node 24.20.0.                                    |
| CI            | `.github/workflows/e2e.yml`       | Extremo a extremo contra la compilacion de produccion, con PostgreSQL 17 como servicio.                     |
| CI            | `.github/workflows/audit.yml`     | Auditoria de dependencias cada lunes y listado de versiones anticuadas.                                     |
| Dependencias  | `.github/dependabot.yml`          | Actualizaciones semanales de npm y de las acciones.                                                         |
| Tamano        | `scripts/check-size.ts`           | `pnpm check:size` mide el JavaScript del cliente y los estaticos publicos y falla si pasan del presupuesto. |
| Accesibilidad | `tests/e2e/accesibilidad.spec.ts` | Auditoria con axe-core de las paginas principales: falla ante infracciones graves o criticas.               |
| Accesibilidad | `tests/e2e/support/axe.ts`        | Utilidad compartida por los archivos de prueba.                                                             |

### Fallos encontrados y corregidos por la auditoria

| Hallazgo                                                                    | Correccion                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| El editor de ProseMirror no tenia nombre accesible (infraccion grave).      | `editorProps.attributes` con `role="textbox"`, `aria-multiline` y `aria-label`. |
| Los campos de imagen ocultos no tenian etiqueta (infraccion critica).       | `aria-label` en los dos `input type="file"`.                                    |
| El encabezado de pagina de la vista previa no cumplia el contraste (grave). | Se usa un tono de tinta mas oscuro sobre el papel blanco.                       |

### Pruebas ejecutadas

| Comprobacion         | Resultado                                                                        |
| -------------------- | -------------------------------------------------------------------------------- |
| `pnpm check:size`    | 1 240 KB de JavaScript (presupuesto 1 953 KB) y 4 265 KB de estaticos (5 859 KB) |
| E2E de accesibilidad | 80 pruebas en Chromium, sin infracciones graves ni criticas                      |
| `pnpm test`          | 332 pruebas en 35 archivos                                                       |

---

## Lote U: la vista previa se parece al PDF y las listas estan acotadas

Fecha: 21 de octubre de 2026.
Rama: `improvement/escribiendo-95`.
Base del lote: `58b130d`.

### Que estaba mal

1. La vista previa paginada **no dibujaba las imagenes**: ponia un simbolo
   como marcador. El PDF, el EPUB y el DOCX si lasonian, asi que la vista
   previa no era representativa del archivo final.
2. `getSection`, `listRevisions` y `getRevisionContent` recibian el `bookId` de
   la direccion pero **no lo usaban** en el filtro: `/books/A/secciones/B`
   mostraba el contenido de B bajo la cabecera de A, sin dar un 404.
3. Tres listados crecian sin limite: el historial de una seccion (cargaba
   **todas** sus revisiones, y las revisiones son inmutables), los comentarios de
   un libro y las imagenes de un libro.
4. Dos flujos sin ninguna prueba automatica: la recuperacion de contrasena y
   los permisos por rol (que no administra el estudio y exporta la auditoria).

### Que se ha cambiado

| Area         | Archivo                                                                       | Cambio                                                                                                           |
| ------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Vista previa | `apps/web/src/components/layout/paginated-preview.tsx`                        | Dibuja la imagen con su tamano en milimetros, su alineacion y su pie, como en el PDF.                            |
| Consultas    | `apps/web/src/lib/books/queries.ts`                                           | La seccion y sus revisiones tienen que ser del libro de la direccion.                                            |
| Listados     | `apps/web/src/lib/review/compare.ts`, `review/comments.ts`, `books/assets.ts` | Cada lista tiene un limite (`take`) y lo documenta.                                                              |
| Pruebas      | `tests/e2e/auth.spec.ts`                                                      | Recuperacion de contrasena con enlace de un solo uso: cambia la contrasena, invalida el enlace y permite entrar. |
| Pruebas      | `tests/e2e/equipo.spec.ts`                                                    | Quien no administra el estudio no gestiona el equipo ni exporta la auditoria (403).                              |

### Pruebas ejecutadas

| Comprobacion        | Resultado                           |
| ------------------- | ----------------------------------- |
| `pnpm test`         | 332 pruebas en 35 archivos          |
| `pnpm test:e2e`     | 80 pruebas en Chromium (dos nuevas) |
| `pnpm format:check` | Correcto                            |
| `pnpm lint`         | Sin errores                         |
| `pnpm typecheck`    | Sin errores                         |
| `pnpm build`        | Correcto                            |

La prueba de recuperacion deja la cuenta de pruebas intacta: usa una cuenta
propia, creada con una invitacion, para no invalidar la sesion compartida.

---

## Lote V: se puede trabajar en varios estudios

Fecha: 21 de octubre de 2026.
Rama: `improvement/escribiendo-95`.
Base del lote: `318b400`.

### Que estaba mal

1. La sesion resolvia siempre el estudio **mas antiguo** al que pertenecia la
   persona (`take: 1` por antiguedad). Quien aceptaba una invitacion a otro
   estudio se encontra con la pantalla del equipo del estudio viejo y no
   veia el nuevo: el acceso existia, pero era invisible.
2. No habia forma de cambiar de estudio.
3. Aceptar una invitacion con sesion abierta podia **rebajar el rol** de la
   persona (`update: { role: invitation.role }` sobre un `upsert`).

### Que se ha cambiado

| Area     | Archivo                                              | Cambio                                                                                                                                   |
| -------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Esquema  | `packages/database/prisma/schema.prisma`             | La sesion guarda el estudio con el que se trabaja (`workspaceId`, indice incluido). Migracion aditiva.                                   |
| Sesion   | `apps/web/src/lib/auth/session.ts`                   | El estudio activo es el de la sesion; si la persona deja de pertenecer a el, se recurre al primero. La sesion expone todos sus estudios. |
| Sesion   | `apps/web/src/lib/auth/session.ts`                   | `switchWorkspace()`: solo cambia a un estudio del que la persona forma parte.                                                            |
| Equipo   | `apps/web/src/lib/team/actions.ts`                   | Aceptar una invitacion deja la sesion en el estudio invitado y **no toca el rol** de quien ya era miembro.                               |
| Interfaz | `apps/web/src/components/app/workspace-switcher.tsx` | Selector de estudio en la barra lateral, con el cambio anotado en la auditoria.                                                          |

La migracion es aditiva (`ALTER TABLE ... ADD COLUMN`), sin tocar datos.

### Pruebas ejecutadas

| Comprobacion                                | Resultado                                              |
| ------------------------------------------- | ------------------------------------------------------ |
| `pnpm db:validate`                          | El esquema es valido                                   |
| `pnpm db:migrate`                           | Migracion aplicada en la base de pruebas               |
| E2E de equipo                               | Un caso nuevo: cambiar de estudio y volver al original |
| `pnpm test`                                 | 332 pruebas en 35 archivos                             |
| `pnpm test:e2e`                             | 80 pruebas en Chromium                                 |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | Sin errores                                            |

### Lotes que quedan anotados y no cerrados

- El historial de una seccion, los comentarios de un libro y las imagenes de un
  libro ya tienen limite, pero no hay paginacion con «ver mas»: cuando se
  supera el limite, lo que queda fuera no se ve.
- La exportacion sigue generandose dentro de la peticion: un libro muy grande
  bloquea el event loop de Render Free. La mitigacion pendiente es un tope
  explicito de tamano con un aviso claro.

---

## Lote W: el editor deja de usar ventanas del navegador y la exportacion no se solapa

Fecha: 21 de octubre de 2026.
Rama: `improvement/escribiendo-95`.
Base del lote: `b0a1949`.

### Que estaba mal

1. El enlace y la nota al pie se pedian con `window.prompt` y `window.alert`:
   modales del navegador que bloquean la interfaz, no se pueden validar
   mientras se escribe, no los anuncia bien un lector de pantalla y, en el
   caso del enlace, no rechazaban los esquemas peligrosos (solo lo hacia
   Tiptap, en el cliente).
2. Al abrir el diálogo se perdia la seleccion del editor, de modo que el
   enlace no se aplicaba al texto escolhido.
3. Dos exportaciones a la vez en la misma instancia de Render Free se quedan
   sin memoria: la medida del banco de esfuerzo da 367 MB para un libro de
   200 000 palabras con 80 fotografias, y el plan da 512 MB.
4. Una prueba de seguridad leia el cuerpo de la respuesta despues de que el
   cliente hubiera navegado: fallaba de forma intermitente.

### Que se ha cambiado

| Area        | Archivo                                                      | Cambio                                                                                                              |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Editor      | `apps/web/src/components/forms/dialog.tsx`                   | Dialogo modal propio: foco dentro, Escape cierra y el titulo lo anuncia el lector de pantalla.                      |
| Editor      | `apps/web/src/components/books/section-editor.tsx`           | El enlace y la nota se escriben en el dialogo, con aviso de esquema, contador de caracteres y seleccion recuperada. |
| Exportacion | `apps/web/src/lib/export/slot.ts`                            | Un hueco de exportacion por instancia, con caducidad de diez minutos para no dejar el hueco tomado.                 |
| Exportacion | `apps/web/src/lib/export/jobs.ts`, `api/exports/…/download`  | La peticion y la descarga reservan el hueco; si hay otra en marcha, la respuesta lo explica (429).                  |
| Pruebas     | `tests/e2e/manuscrito.spec.ts`, `tests/e2e/security.spec.ts` | Un caso nuevo del dialogo de enlace; la prueba de seguridad lee el HTML sin ejecutar JavaScript.                    |

### Pruebas ejecutadas

| Comprobacion        | Resultado                  |
| ------------------- | -------------------------- |
| `pnpm test`         | 332 pruebas en 35 archivos |
| `pnpm test:e2e`     | 80 pruebas en Chromium     |
| `pnpm format:check` | Correcto                   |
| `pnpm lint`         | Sin errores                |
| `pnpm typecheck`    | Sin errores                |
| `pnpm build`        | Correcto                   |

---

## Lote X: operacion y plan al dia

Fecha: 21 de octubre de 2026.
Rama: `improvement/escribiendo-95`.
Base del lote: `4281847`.

### Que estaba mal

1. `pnpm db:status` no decía cuanto ocupaban las tablas. Las revisiones y la
   auditoria crecen con el uso y son las que pueden llenar el almacenamiento del
   plan gratuito, sin que nadie lo viera.
2. Los indices parciales de unicidad (una edicion predeterminada por libro, un
   perfil predeterminado por estudio, un slug por plantilla de sistema) solo
   existen en las migraciones: una migracion futura los recompone y se
   perderian en silencio.
3. La vista previa renderizaba **todas** las paginas de un libro largo, con
   miles de nodos en el documento.
4. `IMPLEMENTATION_PLAN.md` daba por pendientes las imagenes, las notas al pie
   y las fuentes incrustadas, que hace dias estan cerradas y verificadas.

### Que se ha cambiado

| Area      | Archivo                                                | Cambio                                                                                                                  |
| --------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Operacion | `scripts/db-status.ts`                                 | Informa del tamano de las ocho tablas mas grandes y comprueba que siguen los tres indices parciales de unicidad.        |
| Operacion | `docs/DATABASE.md`                                     | Explica la columna `sessions.workspaceId` y el aviso sobre los indices parciales.                                       |
| Interfaz  | `apps/web/src/components/layout/paginated-preview.tsx` | La vista previa usa `content-visibility`, de modo que el navegador no dibuja las paginas que no se ven.                 |
| Plan      | `IMPLEMENTATION_PLAN.md`                               | Los puntos 1, 2 y 3 pasan a **cerrados** con su evidencia; el punto 5, a medias; las condiciones del 95, con su estado. |

### Pruebas ejecutadas

| Comprobacion        | Resultado                                          |
| ------------------- | -------------------------------------------------- |
| `pnpm db:status`    | Tamano de tablas y 3 indices parciales comprobados |
| `pnpm test`         | 332 pruebas en 35 archivos                         |
| `pnpm test:e2e`     | 80 pruebas en Chromium                             |
| `pnpm format:check` | Correcto                                           |
| `pnpm lint`         | Sin errores                                        |
| `pnpm typecheck`    | Sin errores                                        |
| `pnpm build`        | Correcto                                           |

---

## Lote Y: la aplicacion explica cuando le falta una migracion

Fecha: 21 y 22 de octubre de 2026.
Rama: `improvement/escribiendo-95`.
Base del lote: `38d4f51` (primera parte) y este commit (cierre).

### Qué pasaba

Desplegar el código nuevo sin aplicar la migración dejaba la aplicación entera
caída: un «error de interfaz» con una referencia opaca. La sesión se lee con la
columna `sessions.workspaceId`, que en una base antigua no existe, y Prisma
falla con `P2022`.

La primera corrección cubría la lectura de la sesión y el envío del formulario
de acceso, pero quedaban dos huecos reales, comprobados en la reproducción:

1. `/login` y `/setup` contaban usuarios (la base respondía) y después leían la
   sesión. Con una cookie presente, la página volvía a romperse.
2. Cada página privada vuelve a pedir la sesión por su cuenta; el aviso del
   layout solo cubría las peticiones en las que fallaba la lectura del layout.

### Reproducción

Se simuló un despliegue antiguo: se quitó la columna de la base de pruebas y se
arrancó la compilación de producción. Se visitaron las rutas públicas y las
privadas con una cookie de sesión.

| Momento                                               | Antes                            | Ahora                                                                |
| ----------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| `/` sin sesión                                        | Redirige al acceso, que falla    | Acceso con el aviso de migración                                     |
| `/login` con cookie                                   | «Error de interfaz»              | Aviso «La base de datos está desactualizada» con el comando          |
| `/setup`                                              | «Error de interfaz»              | El mismo aviso, antes de tocar la sesión                             |
| `/dashboard`, `/stats`, `/books`, `/team`, `/account` | «Error de interfaz»              | Redirección a `/migracion-pendiente`                                 |
| `/migracion-pendiente`                                | No existía                       | Pantalla estática disponible sin base de datos                       |
| Envío del formulario de acceso                        | «No se ha podido iniciar sesión» | Distingue el esquema desactualizado de unas credenciales incorrectas |
| `/api/health/ready`                                   | `200` con `database: ok`         | `503` con `schema: outdated`                                         |

Con el esquema restaurado, `/api/health/ready` responde `200` con
`schema: ok` y el acceso muestra el formulario con normalidad.

### Qué se ha cambiado

| Área      | Archivo                                             | Cambio                                                                                                                                                                          |
| --------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base      | `packages/database/src/schema.ts`                   | `esEsquemaDesactualizado()` reconoce el error de Prisma por columna o tabla que falta; `checkSchema()` comprueba las columnas que la aplicación necesita, con límite de tiempo. |
| Base      | `packages/database/src/expected-schema.ts`          | Lista única de columnas esperadas y `missingColumns()`: la usan la aplicación y `db:status`.                                                                                    |
| Operación | `scripts/db-status.ts`                              | Comprueba las columnas esperadas, nombra las que faltan y distingue «hay que migrar» de «la migración figura aplicada pero la columna no está».                                 |
| Base      | `packages/database/src/schema.test.ts`              | Cuatro casos: error de Prisma, mensaje sin código y errores que **no** son de esquema.                                                                                          |
| Acceso    | `apps/web/src/lib/auth/installation.ts`             | `getDatabaseState()` cuenta usuarios y después comprueba el esquema: devuelve `not-migrated` antes de leer la sesión.                                                           |
| Acceso    | `apps/web/src/lib/auth/database-state.ts`           | `schemaOutdatedState()`, estado para una base que responde pero no tiene las columnas esperadas.                                                                                |
| Acceso    | `apps/web/src/components/auth/database-problem.tsx` | El aviso habla de tablas **o columnas** y del comando que hay que ejecutar.                                                                                                     |
| Sesión    | `apps/web/src/lib/auth/session.ts`                  | El error de esquema se convierte en `ConfigurationError`; `requireSession()` redirige a `/migracion-pendiente`, de modo que cubre todas las páginas privadas.                   |
| Interfaz  | `apps/web/src/components/app/schema-error.tsx`      | Pantalla «Migración pendiente».                                                                                                                                                 |
| Ruta      | `apps/web/src/app/migracion-pendiente/page.tsx`     | Pantalla estática y pública, disponible aunque la base no tenga el esquema.                                                                                                     |
| Interfaz  | `apps/web/src/app/page.tsx`                         | Muestra la pantalla si la sesión no se puede leer.                                                                                                                              |
| Interfaz  | `apps/web/src/app/(app)/layout.tsx`                 | Vuelve a ser simple: la redirección vive en `requireSession()`.                                                                                                                 |
| Interfaz  | `apps/web/src/app/error.tsx`                        | Usa `retry` (API estable de Next 16.4): reintentar vuelve a pedir los datos al servidor.                                                                                        |
| Acceso    | `apps/web/src/lib/auth/actions.ts`                  | El fallo de esquema se distingue de unas credenciales incorrectas.                                                                                                              |
| Salud     | `apps/web/src/app/api/health/ready/route.ts`        | Informa `schema: ok` u `outdated`, responde `503` si falta una migración e incluye el commit desplegado en Render.                                                              |
| Pruebas   | `apps/web/src/lib/auth/database-state.test.ts`      | Nuevo caso para `schemaOutdatedState()`.                                                                                                                                        |
| Pruebas   | `tests/e2e/security.spec.ts`                        | El chequeo de salud exige `schema: ok`; la pantalla de migración se sirve sin sesión y con el comando.                                                                          |
| Documento | `docs/DEPLOYMENT.md`, `README.md`                   | Explican el aviso, las rutas y el comando.                                                                                                                                      |

### Pruebas ejecutadas

| Comprobación                            | Resultado                                                                                                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reproducción con esquema antiguo        | Ocho rutas sin «error de interfaz»: `/`, `/login`, `/migracion-pendiente`, `/dashboard`, `/stats`, `/books`, `/team` y `/account`; avisos correctos y `503` en el chequeo de salud. |
| `pnpm db:status` con la columna ausente | Termina con error y nombra `sessions.workspaceId`; con el esquema completo informa `Columnas esperadas: 3`.                                                                         |
| Esquema restaurado                      | `/api/health/ready` responde `200` con `schema: ok`; el acceso muestra el formulario.                                                                                               |
| `pnpm test`                             | 337 pruebas en 36 archivos.                                                                                                                                                         |
| `pnpm test:e2e`                         | 81 pruebas en Chromium; EPUBCheck 5.1.0 sin errores ni advertencias.                                                                                                                |
| `pnpm format:check`                     | Correcto.                                                                                                                                                                           |
| `pnpm lint`                             | Sin errores.                                                                                                                                                                        |
| `pnpm typecheck`                        | Sin errores.                                                                                                                                                                        |
| `pnpm build`                            | Correcto.                                                                                                                                                                           |

### Cierre en producción

El despliegue seguía mostrando «Migración pendiente» porque la base de datos de
Neon que usa Render no tenía aplicada la última migración. El `.env` de la
estación de trabajo apuntaba a `127.0.0.1:5433`, así que ejecutar
`pnpm db:migrate` en local migraba la base de pruebas, no la de producción.

La red de la estación no permite conectar con Neon por el puerto 5432, así que
la migración se aplicó desde el editor SQL de Neon, en una transacción:

- `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "workspaceId" UUID;`
- `CREATE INDEX IF NOT EXISTS "sessions_workspaceId_idx" ON "sessions"("workspaceId");`
- registro en `_prisma_migrations` con el checksum
  `5b8c43d6bc9cd36096440c421d143b0d06b35a677eba62a1ea2626d14f8e6f62`
  (SHA-256 de `20261021210000_session_workspace/migration.sql`), para que
  `prisma migrate deploy` no la repita.

Verificación, el 22 de octubre de 2026:

| Comprobación         | Resultado                                                                 |
| -------------------- | ------------------------------------------------------------------------- |
| `_prisma_migrations` | Cuatro filas; la última, `20261021210000_session_workspace`.              |
| `/api/health/ready`  | `200` con `status: ready`, `schema: ok` y el commit desplegado `a4a6a68`. |
| Acceso               | El formulario inicia sesión y las páginas privadas cargan.                |
| Despliegue           | No hizo falta volver a desplegar: el cambio es de datos, no de código.    |

El cierre es operativo: no cambia la puntuación conservadora de 87,4/100, que
sigue pendiente de las validaciones externas (Word y LibreOffice, Cloudinary,
PDF/X, cobertura CJK, fuzzing del parser TTF y pentest).

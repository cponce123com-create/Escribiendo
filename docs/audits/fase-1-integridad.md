# Fase 1 — Integridad editorial, casos críticos y validación legal

**Fecha:** 24 de octubre de 2026
**Alcance:** P0/P1 del prompt maestro v10 verificados sobre el código real, no sobre los informes previos.

## 1. Capitular con puntuación de apertura (P0)

**Confirmación del defecto.** `paginated-preview.tsx` y `pdf-layout.ts` quitaban el **primer grafema** del primer tramo. Con `«Aquella…`, `—¿Quién…?`, `“Había…”` o `¡Hola!` se eliminaba la puntuación y se dibujaba la letra aparte, duplicándola.

**Corrección.**

- `packages/editorial-engine/src/drop-cap.ts`: nuevo `extractDropCapGrapheme`, que busca exactamente el grafema elegido por `dropCapGrapheme` y lo elimina una sola vez, conservando comillas, rayas, signos, marcas y el resto de tramos.
- Vista previa y PDF usan el mismo extractor; si el grafema no aparece en la primera línea, no se dibuja la inicial para no duplicar texto.
- Pruebas: `drop-cap.test.ts` (puntuación, tramos con formato, marcas combinadas, grafema ausente) y `pdf-layout.test.ts` (texto del PDF con `«quella casa»`, sin `Aquella`).

## 2. Página legal inválida omitida en silencio (P1)

**Confirmación.** `legalPageToBlocks` devuelve `[]` cuando `buildLegalPage` marca `ready=false`; `composeMatter` omitía la página y la exportación continuaba.

**Corrección.**

- `book-matter.ts`: `legalPageErrors` extrae los errores bloqueantes y `assertLegalReady` lanza `LegalPageInvalidError` (AppError, mensaje visible).
- `generate.ts`: la exportación se detiene antes de generar si hay una página legal habilitada e inválida. Una página desactivada, manual o sustituida por una sección propia no se bloquea.
- `preview.ts`: diagnóstico `LEGAL_PAGE_INVALID` con severidad `error` y panel de diagnósticos con etiqueta «Página legal incompleta».
- Pruebas: `book-matter.test.ts` (bloqueo, modos excluidos) y `preview.test.ts` (diagnóstico).

## 3. Logotipo del sello editorial (P1)

**Confirmación.** `composeMatter` no pasaba `resolveImage`; el logo configurado se omitía.

**Corrección.**

- `logo.ts`: resolvedor seguro que solo descarga URLs de la cuenta de Cloudinary configurada (mismo filtro SSRF, tamaño y tiempo que las imágenes del manuscrito), obtiene dimensiones reales y limita el ancho al 25 % de la caja.
- `BookMatter.logoImage`: la imagen resuelta viaja con la materia y `composeMatter` la conecta a `legalPageToBlocks`.
- Vista previa, galería legal y exportación comparten el resolvedor; si no se puede resolver, la vista previa emite `MATTER_LOGO_OMITIDO` y el texto no se mueve.
- Pruebas: `book-matter.test.ts` comprueba que el logo aparece como bloque de imagen.

## 4. Saltos de línea de la dedicatoria (Fase 1D)

**Confirmación.** `inline.ts` convertía los `hardBreak` en espacio y `normalizedText` colapsaba todos los espacios; además `paragraphs()` en `matter-content.ts` hacía lo mismo. Los saltos del autor se perdían.

**Corrección.**

- `inlineRuns` acepta `hardBreak: "newline"`; `sectionToBlocks` lo activa solo para `DEDICATION`.
- `normalizedText` conserva saltos simples y dobles.
- `paragraphs()` conserva los saltos internos de cada párrafo.
- `breakIntoLines` compone cada segmento separado por `
` sin reiniciar sangrías ni la sangría de primera línea.
- Pruebas: `measure.test.ts`, `matter-content.test.ts` y `blocks.test.ts`.

## 5. DOCX con geometría real (P1)

**Confirmación.** `docx.ts` fijaba A4 (11906×16838 twips), márgenes de 1418 y `w:lines="3"` para la capitular, sin leer el perfil de la edición.

**Corrección.**
- `buildDocx` acepta `DocxOptions` con tamaño de página, márgenes, gutter y líneas de inicial; `generate.ts` le pasa el perfil y la instantánea.
- La tabulación derecha del índice se ancla al ancho útil real; el `sectPr` escribe el tamaño y los márgenes configurados.
- Sin opciones se conserva el A4 histórico, así que los DOCX antiguos no cambian.
- Prueba: `docx-toc.test.ts` comprueba 148×210 mm, márgenes 18/14 mm, tabulación en 6577 twips y `w:lines="2"`.

## Verificación

- `pnpm test`: **889 pruebas / 113 archivos** en verde.
- `pnpm typecheck`: todos los paquetes y el `tsconfig` raíz.
- `pnpm lint`: sin errores.
- `pnpm build`: correcto con `NODE_ENV=production`.

## Pendiente de la Fase 1 y siguientes

- Validar el DOCX generado en Word y LibreOffice (no instalado en este entorno).
- Pruebas visuales de píxeles y extracción de texto del PDF exportado.
- Doble generación de exportación (`jobs.ts` + ruta de descarga) sin medir todavía.
- Importador, seguridad y rendimiento: fases 7 a 9 del prompt.

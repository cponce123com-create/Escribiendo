# Auditoría técnica editorial — ESCRIBIENDO

**Fecha:** 24 de octubre de 2026  
**Fuente:** `Escribiendo-main (9).zip` y tres capturas del libro _El Silencio de la Auvernia_.
**Alcance:** análisis estático del motor de composición, páginas editoriales, índice, inicial capitular, exportación, pruebas y UX. No se ejecutó la aplicación ni se inspeccionó Render.

## Estado de corrección (24 de octubre de 2026)

Entrega `fix/auditoria-editorial-nucleo-tipografico`: núcleo geométrico del motor.

| Hallazgo | Estado                     | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ECP-01   | **Corregido**              | Folio medido y anclado al margen; líderes vectoriales en preview/PDF; tabulación derecha en DOCX. Tolerancia de 0,5 mm probada con 1-4 dígitos (`toc-layout.test.ts`, `pdf-layout.test.ts`, `docx-toc.test.ts`)                                                                                                                                                                                                                                                  |
| ECP-06   | **Corregido**              | `stabilizeComposition` con tope de 5 pasadas, detección de ciclo, cotejo folio↔sección y bloqueo de exportación (`toc-stabilization.test.ts`). La firma del índice ahora incluye el folio                                                                                                                                                                                                                                                                        |
| ECP-02   | **Corregido en el motor**  | `spacer` se acumula como `spaceBeforePt`; la dedicatoria usa fracción de la altura útil; el logo se emite como imagen o deja diagnóstico `MATTER_LOGO_OMITIDO`                                                                                                                                                                                                                                                                                                   |
| ECP-03   | **Corregido**              | Panel de dedicatoria en «Páginas de la edición» con plantilla, alineación, posición y firma persistidas en `settings.dedication`; `bookToBlocks` compone la sección con `buildDedicationPage` y la altura útil real. Sin configuración guardada se conserva la composición anterior (`blocks.test.ts`, `matter-content.test.ts`, `template-actions.test.ts`)                                                                                                     |
| ECP-04   | **Corregido**              | Preset versionado `copyright-peru-classic-reference` con dos regiones: derechos arriba y créditos de edición anclados al pie (`bottomAnchor`). Sin título, autoría ni logotipo duplicados; los datos ausentes se omiten con advertencia (`legal-page.test.ts`, `matter-blocks.test.ts`, `pagination.test.ts`)                                                                                                                                                    |
| ECP-05   | **Corregido**              | Inicial por grafema (`Intl.Segmenter`), geometría única de `dropCapMetrics` en paginación, preview y PDF, y configuración persistida por edición (`settings.dropCap`: activa y 2/3 líneas) con panel en «Páginas de la edición». Vista previa y exportación leen la misma decisión y la instantánea congela las líneas; se retiraron los interruptores duplicados (`drop-cap.test.ts`, `preview.test.ts`, `layout-snapshot.test.ts`, `template-actions.test.ts`) |
| ECP-07   | **Corregido**              | Al entrar en «Páginas de la edición» solo se compone la plantilla legal elegida —con `buildLegalMatterPreview`, sin paginar el manuscrito— y el índice elegido, que necesita folios reales; el resto muestra una miniatura de catálogo. La galería legal reutiliza la composición acotada al cambiar campos (`gallery-preview.ts`, `preview.ts`, `edicion/page.tsx`)                                                                                             |
| ECP-08   | **Corregido**              | Contrato de formatos visible en el panel de exportación: los PDF reproducen la vista previa página por página; EPUB y DOCX garantizan contenido, jerarquía y estilos, sin paginación fija (`export-panel.tsx`)                                                                                                                                                                                                                                                   |
| ECP-09   | **Corregido en geometría** | Goldens deterministas de las tres páginas de referencia (legal de dos regiones, dedicatoria e índice con folios y líderes) y prueba de 250 capítulos sin desbordes (`reference-pages.golden.test.ts`). No incluye diff de píxeles: compara geometría compuesta, estable en CI sin navegador                                                                                                                                                                      |

## Resumen ejecutivo

La plataforma contiene módulos razonables para maquetación y exportación, pero todavía no garantiza un resultado editorial geométricamente determinista. Las principales causas son el uso de puntos guía aproximados en el índice, la pérdida de información espacial de las materias, la desconexión de plantillas ya creadas de dedicatoria con el flujo de producción y la composición intensiva de vistas previas. Se recomienda **evolucionar** el motor actual, no reescribirlo.

## Hallazgos con evidencias

### ECP-01 — Índice: folios sin columna de alineación fija — CRÍTICO

- `packages/templates/src/table-of-contents.ts`: `tocLeaderDots` calcula una cantidad de caracteres con `title.length`; no conoce las anchuras de los glifos.
- `apps/web/src/lib/editorial/matter-blocks.ts`: `tocToBlocks` forma una cadena con espacios em, puntos y folio; guarda también `tocEntry`, duplicando representación visual y semántica.
- `packages/editorial-engine/src/pagination.ts`: el caso `if (block.tocEntry)` calcula puntos mediante repeticiones de `.` hasta aproximar el ancho que sobra.
- Consecuencia: la terminación de los puntos puede variar entre títulos/folios y tipografías; la alineación recta de los números no está modelada como columna independiente.
- Corrección: estructurar cada entrada como `title`, `level`, `label`, `leaders`, `pageRightAnchor`, `titleBox`, `folioBox`, `leaderSegment`. Dibujar títulos a la izquierda, folios anclados a la derecha, puntos vectoriales o líderes tipográficos entre ambos, con un espacio uniforme alrededor. No justificar párrafos del índice.
- Aceptación: margen derecho de todos los folios alineado con tolerancia de **0,5 mm** para 1, 2, 3 y 4 dígitos, con títulos largos y anidación; prueba visual dorada de vista previa vs PDF.

### ECP-02 — Descarte de geometría vertical en páginas especiales — CRÍTICO

- `packages/templates/src/matter-content.ts`: la dedicatoria emite bloques `spacer` según `upper`, `center`, `lower`.
- `apps/web/src/lib/editorial/matter-blocks.ts`: `styleForRole('spacer')` y `styleForRole('logo')` devuelven `null`; el propio comentario declara la pérdida de espacios y logotipos.
- Consecuencia: la posición configurada no llega a la página final. Los estilos con líneas ornamentales se tratan como cuerpo en flujo, sin zonas en milímetros.
- Corrección: incorporar `positionMm`/`layoutRegion` o contenedores editoriales con altura/offset verificables para materias; exportación y vista previa deben consumir el mismo modelo.
- Aceptación: dedicatoria puede colocarse por plantilla dentro del tercio superior, centrado o inferior con posición invariante ante cambios de fuente o tamaño de papel.

### ECP-03 — Dedicatoria con función de plantilla no integrada en producción — ALTA

- `packages/templates/src/matter-content.ts`: existe `buildDedicationPage`, con plantillas `classic`, `minimal`, `literary` y un contador de caracteres.
- Búsqueda de uso en `apps/web/src`: solo se invoca en `apps/web/src/lib/editorial/matter-blocks.test.ts`; el flujo normal usa el texto de la sección `DEDICATION` y le fuerza alineación derecha en `apps/web/src/lib/layout/blocks.ts`.
- Consecuencia: la interfaz no aprovecha de forma integral la plantilla de dedicatoria; una parte de la funcionalidad está implementada pero desconectada.
- Corrección: edición visual de dedicatoria con selección de plantilla, texto, firma opcional, alineación y posición. Integrar el generador mediante datos de configuración por edición; migrar sin perder dedicatorias anteriores.
- Nota: `DEDICATION_MAX_CHARS = 500` genera una advertencia, no un bloqueo; al presentarlo como máximo conviene definir una política explícita y clara.

### ECP-04 — La página legal no reproduce las dos regiones de la captura — ALTA

- `packages/templates/src/legal-page.ts`: el generador escribe logo, título, autor y regla **antes** de la información de copyright y metadatos, y luego agrega bloques consecutivos.
- La plantilla de referencia tiene (1) bloque de derechos superior y (2) bloque de créditos editoriales inferior; ambos alineados a la izquierda en una caja estrecha.
- Corrección: nuevo preset `copyright-peru-classic-reference`, versionado, con dos regiones independientes ancladas al área útil de página. Conservar los 7 presets existentes; no sobrescribir selecciones previas. Completar campos desde el libro y edición. Usar saltos explícitos entre entradas en lugar de `spacer` descartable.
- Aceptación: respetar orden y separaciones de la captura; nunca inventar ISBN, depósito, año, imprenta o información personal. Ausencia de datos: advertencia preventiva sin imprimir falsedades.

### ECP-05 — Letra capital sin sistema configurable — ALTA

- `apps/web/src/lib/layout/blocks.ts`: toma `Array.from(block.text)[0]` al primer párrafo del capítulo.
- `packages/editorial-engine/src/pagination.ts`: reserva espacio para una inicial `fontSizePt * 3` en las primeras tres líneas.
- `packages/editorial-engine/src/drawing.ts`, `apps/web/src/components/layout/paginated-preview.tsx` y `apps/web/src/lib/export/pdf-layout.ts`: tres lugares calculan y/o dibujan la inicial y su ubicación.
- `apps/web/src/components/export/export-panel.tsx`: solo existe un interruptor activar/desactivar. `preview/page.tsx` tiene un interruptor independiente; ambos pueden mostrar estados diferentes.
- Corrección: `DropCapStyle` persistido a nivel de plantilla o capítulo (habilitar, nLíneas 2/3, fuente, separación mm, desplazamiento fino, estilo clásico/ornamental y reglas de exclusión). Consolidar cálculo geométrico compartido. No elegir comillas, guiones ni signos de apertura como inicial por defecto. Definir comportamiento con tildes y Unicode.
- Aceptación: primer párrafo compuesto sin solapamiento ni desplazamiento al cambiar font-size, interlineado, márgenes, títulos y formatos; la vista previa y PDF coinciden.

### ECP-06 — Estabilización del índice sin verificación final — ALTA

- `apps/web/src/lib/layout/preview.ts` y `apps/web/src/lib/export/generate.ts`: hasta tres pasadas de paginación; no se observa una validación explícita posterior que rechace o destaque un índice no convergente.
- Corrección: una rutina común de estabilización con criterio estable, tope razonable, detección de ciclos y diagnóstico final. Para cada entrada cotejar `label` con el folio de la sección realmente compuesta después de la última pasada.
- Aceptación: nunca exportar silenciosamente un índice con números incorrectos; los errores se muestran con acción para corregirlos.

### ECP-07 — Coste de galerías y vistas previas — ALTA

- `apps/web/src/app/(app)/books/[bookId]/edicion/page.tsx`: prepara vistas de **7** plantillas legales y **6** índices; para cada una puede ejecutar `buildPreview` del libro entero.
- `legal-template-gallery.tsx` y `toc-template-gallery.tsx`: recomposición completa tras cambiar campos (debounce de 300/350 ms).
- Corrección: miniaturas estáticas de catálogo y maquetación de solo la opción seleccionada en el cliente; caché por firma de contenidos, fuentes, formato y configuración. Opcionalmente, mini preview solo de la materia, con folios del snapshot del libro. Cálculo pesado diferido en servidor.
- Aceptación: entrar en «Páginas de edición» no dispara 13 composiciones completas y escribir en un campo no recomponen el libro completo sin necesidad.

### ECP-08 — Preview-PDF buenos fundamentos, formatos refluibles diferentes — MEDIA

- PDF y preview comparten `paginate`, tipografía y geometría básica.
- En `apps/web/src/lib/export/generate.ts`, DOCX y EPUB se generan por otra ruta; en `packages/export-engine/src/docx.ts` hay formato `framePr` para la letra capital. El reflujo impide garantizar identidad de páginas para EPUB.
- Corrección: preservar equivalencia exacta entre vista previa paginada y **PDF**. Para DOCX y EPUB, equivalencia de contenido, jerarquía y estilo, no paginación fija. Especificar este contrato en la UI.

### ECP-09 — Pruebas insuficientes para acabado visual — MEDIA

- Existen pruebas automáticas para paginación, plantillas, índice y exportación; es una fortaleza.
- En `apps/web/src/lib/editorial/matter-blocks.test.ts` se verifica incluso que se descartan `spacer` y `logo`, por lo que el comportamiento problemático está consolidado como esperado.
- Corrección: actualizar pruebas de contrato, fixtures de las 3 capturas, snapshots de geometría (rectángulos y líneas), diff visual de páginas, prueba de 100-300 páginas y validación de contenidos.

## Modelo editorial de las tres referencias

**Página legal:** página dedicada, sin folio visible si así lo establece la plantilla; caja tipográfica estrecha, alineación izquierda. Región superior de derechos de autor + párrafos legales; región inferior de datos de edición, editorial, depósito y contacto. Posiciones relativas a la zona útil y proporcionales al formato. Mantener las redacciones de la muestra como texto configurable por titular; revisar legalidad antes de publicaciones.

**Dedicatoria:** página independiente; alineación derecha; caja angosta en zona superior/media-superior; título «Dedicatoria» solo si el preset lo pide, sin adornos obligatorios. Preservar saltos de línea del autor. Límite recomendado visible y configurable, sin truncado oculto.

**Índice:** título centrado; ancho uniforme para listado; títulos a la izquierda y folios en una columna de anchura suficiente. Líderes tipográficos dibujados entre el último carácter visible del título y folio; si el título se parte, los líderes aparecen en la línea final y los folios permanecen anclados. Niveles expresados en milímetros, no espacios Unicode. Los números no se editan manualmente. Regeneración al cambiar cualquier capítulo, formato, fuente o márgenes.

## UX deseada

- Presets «Mi página legal clásica», «Dedicatoria literaria» e «Índice clásico alineado» con miniatura fiel y opción «Restaurar valores del preset».
- Editor a la izquierda / página final a la derecha, ajustes que muestran unidad (`mm`, `pt`, líneas) y modifican solo la sección pertinente; opción «ver libro completo» independiente.
- Estado persistente de letra capital por libro/edición; controles contextuales para capítulos.
- Diagnósticos accionables: «el capítulo 8 no tiene título», «índice sin converger», «dato legal pendiente», «dedicatoria desborda».
- Accesibilidad: controles con etiquetas, teclado, estados de carga, adaptación móvil, y no depender solo de colores.

## Plan de entrega

| Fase | Contenido                                                     | Resultado verificable                                     |
| ---- | ------------------------------------------------------------- | --------------------------------------------------------- |
| 1    | Tests base, fixtures y snapshot antes de cambios              | Referencias reproducibles y sin pérdida de datos          |
| 2    | Motor geométrico para materias y bloques                      | Posición vertical y horizontal compartida preview/PDF     |
| 3    | Índice con columna de folios y líderes reales; estabilización | 0 folios desalineados y correspondencia con el cuerpo     |
| 4    | Preset página legal referencia                                | Dos zonas, metadatos dinámicos, configuración persistente |
| 5    | Dedicatoria editable por plantilla                            | Bloque derecho en posición precisa, saltos conservados    |
| 6    | Letra capital editorial configurable                          | 2/3 líneas, márgenes estables y sin duplicaciones         |
| 7    | UX + reducción de trabajo de galerías                         | Carga ágil con miniaturas estáticas y preview selectivo   |
| 8    | Golden tests y validación de exportación                      | Paridad preview/PDF, DOCX/EPUB estructural, CI verde      |

## Prompt de ejecución para Claude Code / Codex

> Actúa como arquitecto de software senior especializado en Next.js, TypeScript, motores de maquetación y tipografía editorial. Trabaja sobre el repositorio **ESCRIBIENDO** ya existente. **No reescribas todo el proyecto.** Ejecuta primero una auditoría reproductible de `packages/editorial-engine`, `packages/templates`, `apps/web/src/lib/editorial`, `apps/web/src/lib/layout`, `apps/web/src/lib/export` y la interfaz de páginas de edición. Establece pruebas de regresión antes de cambiar algoritmos. Implementa los hallazgos ECP-01 a ECP-09 y las ocho fases de este informe en orden de prioridad, conservando manuscritos, datos, ediciones y compatibilidad con formatos existentes.
>
> **Reglas absolutas:** (1) la letra capital debe tener diseño, coordenadas, tamaño y separación definidos; (2) preservar el preset de página legal con bloque de derechos superior y metadatos inferior; (3) dedicatoria alineada a la derecha y posicionada de manera reproducible; (4) folios de índice alineados en columna real y siempre derivados de las páginas finales; (5) usar una sola geometría para PDF/vista previa; (6) registrar errores en UI y bloquear silencios que produzcan datos falsos; (7) conservar edición manual y plantillas anteriores con migración y reversibilidad; (8) reducir recomposición innecesaria y probar con libros largos; (9) nunca inventar información legal.
>
> Tras cada fase realiza tests, typecheck, lint, pruebas de exportación y verificación de diseño. Si existe una regresión, arréglala antes de avanzar. Documenta archivos modificados, pruebas realizadas, métricas, limitaciones y riesgos. No declares «perfecto» o «9.8» solo por pasar tests; cada criterio debe comprobarse mediante casos reales. Si el entorno permite `git commit` y `git push` y tienes autorización, registra un commit por fase y sube los cambios; no borres datos ni uses comandos destructivos.

## Limitaciones de la auditoría

La revisión es **estática** del ZIP. En este entorno hay Node 22 y no están instaladas las dependencias ni `pnpm`, mientras que el proyecto declara Node >=24.11 y pnpm 12.14. No se ejecutaron tests, compilación, screenshots automáticos ni una exportación real. Por tanto, las hipótesis visuales y de rendimiento deben comprobarse posteriormente mediante las pruebas propuestas; las afirmaciones de implementación se basan en las rutas y funciones identificadas.

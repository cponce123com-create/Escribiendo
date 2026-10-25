# Laboratorio Editorial — auditoría de continuidad

Fecha: 24 de octubre de 2026. Base remota: `6b276c694d9c9788dfa2c386fc329604edcb6808` (main, incluye PR 56). Los blobs rastreados de la copia local coinciden con esa base; `git status --short` y `git diff --stat` estaban vacíos. No se modificó trabajo previo.

## Fase 0: inventario actualizado por inspección

El inventario del 23 de octubre es histórico: no debe usarse para declarar inexistentes módulos agregados posteriormente. Esta revisión recorre implementaciones, consumidores y pruebas. «Parcial» distingue código conectado de comportamiento verificado en producción.

| Área                                      | Estado       | Implementación / consumidores                                                            | Pruebas existentes                                         | Brecha observada                                                                                      |
| ----------------------------------------- | ------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Segmentación, Unicode y offsets           | Parcial      | `packages/book-schema/src/linguistics/{text,types}.ts`, extracción Tiptap, editor        | `text.test.ts`, `tiptap.test.ts`                           | Heurísticas del español; no analizador sintáctico                                                     |
| Reglas e incrementalidad                  | Parcial      | `linguistics/engine.ts`, adaptador `lib/editor/linguistic-rules.ts`, SectionEditor       | `engine.test.ts`, `linguistic-rules.test.ts`               | Caché por instancia; el análisis general crea un motor por petición                                   |
| Ortografía local                          | Parcial      | `lib/editor/local-proofreader.ts`, botón Revisar del editor                              | `local-proofreader.test.ts`                                | Patrones acotados; no diccionario completo                                                            |
| Estilo, repeticiones, legibilidad y ritmo | Parcial      | `linguistics/{style-rules,repetition,readability,rhythm}.ts`, `/books/[bookId]/analysis` | Suites de cada motor y dashboard                           | Análisis general automático; falta selección explícita de capítulo y reglas en ese panel              |
| Continuidad narrativa                     | Parcial      | `linguistics/continuity.ts`, `lib/books/narrative-continuity*.ts`, `/continuity`         | `continuity.test.ts`                                       | Extrae colores, edad y años; no todas las relaciones, fechas e intervalos solicitados                 |
| Personajes y planificación                | Parcial      | `lib/story`, `/characters`, `/planning`, `/narrative`                                    | `character-analysis*.test.ts`, `narrative-queries.test.ts` | Fichas existentes reutilizables; alias desde notas, cronología sin fechas estructuradas               |
| Diálogos                                  | Defectuoso   | `lib/story/narrative-queries.ts`, `/narrative`                                           | `narrative-queries.test.ts`                                | `startsWith` atribuye nombres ambiguos; búsqueda global de comillas confunde citas con intervenciones |
| Relaciones y estructura                   | Parcial      | `/narrative`, relaciones manuales y tarjetas de planificación                            | Pruebas de rutas y consultas                               | Mapa estático; selector de estructura no guarda asignaciones de etapas                                |
| Editor y persistencia                     | Defectuoso   | SectionEditor, `lib/editor/{sync,drafts}.ts`, actions                                    | `sync.test.ts`, `drafts.test.ts`, actions                  | `shouldSync` impide recuperación offline; se ignora el booleano de persistencia local                 |
| Autorización del procesador               | Defectuoso   | `/api/story-analysis/process`                                                            | Permisos generales                                         | Comprueba sesión y workspace de tarea, pero no `story:manage` antes de escribir                       |
| Comentarios e historial                   | Parcial      | `lib/review`, historial/restauración por sección                                         | actions, suites de revisión                                | Comentarios no anclados; integración de restauración requiere navegador con BD                        |
| Laboratorio integrado                     | Desconectado | Herramientas repartidas entre análisis/continuidad/narrativa/editor                      | Dashboard y páginas individuales                           | No hay punto único con las diez categorías                                                            |
| Maquetación/exportación                   | Parcial      | motor compartido, preview y generadores existentes                                       | Suites de layout y exportación                             | No se modifica en esta entrega; validación end-to-end requiere entorno disponible                     |

## Dependencias y decisiones

Se reutilizan `book-schema`, Prisma, componentes de formularios y navegación, permisos centralizados, motor de reglas y motores narrativos. No se agrega proveedor de IA, servicio externo, suscripción ni trabajador permanente. El análisis debe permanecer dentro de Escribiendo. No copiar motores ya presentes.

Orden de intervención: (1) pruebas base y correcciones de integridad/autorización, (2) precisión narrativa, (3) conectar un Laboratorio por libro y análisis acotado por capítulo, (4) medir y verificar regresiones. Las ampliaciones de cronología con fechas y asignación persistente de etapas requieren un diseño aditivo posterior; no se deben anunciar como completadas por existir el selector actual.

## Criterios de verificación

Ejecutar formato, lint, tipos, Vitest y build reales. Medir fixtures de 10k/50k/100k/200k palabras sin datos privados. Ninguna prueba unitaria sustituye una prueba autenticada de guardado, historial, continuidad o exportación con PostgreSQL. No ejecutar preparación E2E destructiva sobre una base compartida o producción. No asignar puntuaciones de producción sin evidencia de ese entorno.

Sin commits ni despliegue: restricción expresa del prompt del usuario, regla 15. Los resultados medidos se documentarán al terminar las comprobaciones.

## Trabajo realizado después de la auditoría

- Integridad: recuperación de red permite reintentar; guardar un borrador no elimina un conflicto/error del servidor. La interfaz distingue almacenamiento persistente de respaldo solo en memoria, y una escritura local obsoleta no confirma una edición posterior. IndexedDB espera el commit de la transacción, no solo el éxito del `put`. Perder la red sin editar no inventa cambios pendientes.
- Seguridad: el procesador incremental exige `assertCanPerform(role, "story:manage")` antes de consultar/modificar tareas; la tarea debe pertenecer a un libro vigente del workspace.
- Precisión narrativa: el extractor de hablante usa nombres completos o un primer nombre único, conserva tildes, se abstiene ante homónimos y múltiples atribuciones. Citas interiores y guiones de lista no se transforman en intervenciones. Las comillas que abren un párrafo siguen siendo una heurística, no prueba semántica de diálogo.
- Laboratorio: `/books/[bookId]/laboratorio`, conectado desde la ficha y el manuscrito, reúne las diez categorías y datos guardados sin analizar el libro al abrirlo. Cada tarjeta lleva a una herramienta existente. Las limitaciones de cronología y estructura se muestran explícitamente.
- Análisis: selección de capítulo con descendientes, orden editorial antes del límite de 120 secciones, reglas desactivables mediante un enlace GET reproducible. Un ID ajeno nunca provoca analizar todo el libro. Las consultas de contenido conservan workspace/libro. Caché de estilo acotada a 240 secciones por proceso, por hash/versión/reglas; no persiste documentos ni datos en disco. Repeticiones, legibilidad y ritmo todavía se recalculan.
- Revisión: filtro por texto y nivel sobre los hallazgos visibles; ignorar, marcar intencional, marcar resuelta y deshacer. Las decisiones de estilo/repeticiones viven en localStorage por usuario/libro/hallazgo versionado, con respaldo en memoria si el navegador lo bloquea; no son compartidas entre dispositivos. La continuidad conserva su mecanismo existente en BD.
- Mapa: selector de personaje accesible por teclado, vínculos manuales y lista textual. Se muestran hasta 24 nodos, con aviso si se limita; la lista conserva todos los vínculos de la selección.

## Medición reproducible

Comando: `node --import tsx scripts/benchmark-linguistics.ts`. Node 24.22.1 en este sandbox, un proceso y fixtures repetitivos de 1.000 palabras por sección, con caché caliente medida inmediatamente después de la fría. RSS antes/después no es memoria máxima ni consumo exclusivo por operación; aumenta por JIT, GC y retención entre muestras. No extrapolar estas cifras a Render Free o a un móvil.

| Palabras | Secciones del fixture | Estilo frío ms | Estilo caliente ms | Resto de métricas ms | RSS antes/después MiB |
| -------- | --------------------- | -------------- | ------------------ | -------------------- | --------------------- |
| 10.000   | 10                    | 59,0           | 4,3                | 93,8                 | 85,1 / 116,0          |
| 50.000   | 50                    | 140,2          | 11,0               | 260,5                | 116,0 / 173,4         |
| 100.000  | 100                   | 241,5          | 21,8               | 342,9                | 173,5 / 259,3         |
| 200.000  | 200                   | 489,5          | 46,8               | 536,7                | 259,7 / 267,3         |

Cero errores del motor en estas muestras; todos los fixtures alcanzaron límites de repeticiones por ser deliberadamente repetitivos. El benchmark ejecuta estilo/legibilidad/ritmo sobre todas las secciones; la pantalla limita la selección a 120 y el detector de repeticiones tiene límites adicionales (120 secciones, 40.000 tokens, etc.). **No se analizó integralmente toda repetición de 200.000 palabras**. La interfaz informa omisiones. No se fija un presupuesto de producción sin medir allí.

## Verificación y alcance pendiente

La base ejecutada antes de cambios tenía 803 pruebas en 102 archivos aprobadas. Se agregaron pruebas de permisos del endpoint, commit abortado de IndexedDB, recuperación/red/conflictos, atribuciones ambiguas, selección de subárboles, filtrado de reglas, consultas acotadas por workspace y navegación del Laboratorio. El E2E `tests/e2e/laboratorio-editorial.spec.ts` se añadió y se enumeró; **no se ejecutó contra PostgreSQL**.

Se ejercitaron componentes reales en Chrome sin backend a 390 y 1440 px: buscar y filtrar hallazgos, marcar intencional/resuelta, recargar y deshacer, filtrar relaciones y operar el selector por teclado. Sin errores de JavaScript, sin desbordamiento horizontal móvil y sin violaciones serious/critical de axe (WCAG2A/AA) en el fixture. Se corrigió el acceso por teclado a regiones de tablas desplazables a partir de esa comprobación. Este fixture no verifica autenticación, acciones de servidor ni datos reales.

| Fase del prompt           | Estado tras esta entrega                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Inventario              | Completado para los módulos inspeccionados, con pruebas base; sin auditoría de producción                                             |
| 1 Motor                   | Base existente reutilizada; mejoras de integridad/permisos; aceptación en navegador de manuscritos reales pendiente                   |
| 2 Estilo y métricas       | Base existente ampliada con alcance/reglas/filtros/decisiones; cobertura lingüística heurística y decisiones locales                  |
| 3 Continuidad             | Base existente conservada; parcial en relaciones, fechas e intervalos; integración con BD no ejecutada aquí                           |
| 4 Herramientas narrativas | Mejoras de atribución y mapa; cronología con fechas/intervalos, reordenación y etapas persistentes siguen pendientes                  |
| 5 Integración             | Entrada y categorías conectadas, análisis por capítulo; resumen global de alertas vigentes y preferencias multidispositivo pendientes |
| 6 Verificación            | Medición y comprobaciones locales; E2E con BD, consumo de navegador máximo, exportaciones reales y auditoría de producción pendientes |

No se declara completado el plan íntegro ni se asignan puntuaciones ficticias de preparación para producción. No hay migraciones nuevas, cambios al motor de exportación ni nuevas dependencias. No hay commits ni despliegue.

## Comprobación manual prioritaria

1. Abrir libro → Laboratorio Editorial; probar las diez tarjetas y volver desde análisis/narrativa al mismo libro.
2. Analizar un capítulo con subsecciones y comprobar que no aparecen resultados de otro capítulo; desactivar redundancias y repetir.
3. Abrir un hallazgo, verificar el fragmento; editar/guardar y abrir el enlace anterior: el editor debe rechazar rangos obsoletos.
4. Marcar una observación como intencional/resuelta, recargar, deshacer; cambiar de cuenta/libro para comprobar separación de preferencias locales.
5. Desconectar la red, escribir, volver a conectarla y verificar confirmación en servidor; provocar un conflicto en otra pestaña y comprobar que el guardado local no lo resuelve solo.
6. Bloquear IndexedDB y verificar aviso de respaldo solo en memoria; mantener la pestaña hasta confirmar guardado en servidor.
7. Probar dos personajes Ana María/Ana Lucía: «dijo Ana» debe quedar sin hablante. Filtrar relaciones y comprobar vínculos exactos.
8. Ejecutar el E2E nuevo exclusivamente en PostgreSQL de pruebas aislado. Verificar historial/restauración, continuidad y exportaciones PDF/EPUB/DOCX con libros reales antes de declarar aceptación final.

Comprobación final de esta entrega: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test` (**827 pruebas / 107 archivos**) y `pnpm build` aprobados; `git diff --check` sin errores. El build registra la nueva ruta `/books/[bookId]/laboratorio`. La prueba autenticada se enumeró con Playwright (`--list`) sin ejecutar su preparación de datos. No se realizaron exportaciones ni validaciones externas EPUB/DOCX en esta entrega, que no modifica sus generadores.

## Continuación posterior

Los pendientes funcionales de esta instantánea se abordaron en la entrega descrita en [LABORATORIO_EDITORIAL.md](../LABORATORIO_EDITORIAL.md). Este informe conserva la evidencia y las limitaciones de la entrega inicial; consultar el nuevo documento para migración, persistencia entre dispositivos y pruebas autenticadas de cierre.

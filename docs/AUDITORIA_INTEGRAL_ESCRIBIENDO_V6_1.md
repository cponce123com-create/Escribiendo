# ESCRIBIENDO v6.1 — intervención y auditoría técnica

Fecha: 23 de octubre de 2026 (Perú). Base examinada: `main`, commit `04a42dee98e1d9ab4eb6efc9c68f6474dcb2c1f9` (PR #46).

## I. Resumen ejecutivo

Se aplicaron correcciones de integridad editorial, instantáneas históricas, reemplazo global, concurrencia, portadas, ficha del libro y coste de exportación. Se conservaron las capacidades existentes y la infraestructura gratuita. No se escribieron datos de producción, no se aplicaron migraciones y no se modificaron manuscritos reales.

La intervención es **parcial respecto al plan completo de 17 fases**, cuyo texto se conserva en `PLAN_ESCRIBIENDO_V6_1.md`. Se revisaron todos los bloques; las validaciones que requieren PostgreSQL desechable, un navegador funcional o servicios externos siguen pendientes. Este documento no certifica que toda la plataforma esté lista para producción ni que se haya alcanzado 9,5/10.

Las pruebas unitarias y de regresión, formato, ESLint, tipos y compilación de producción pasaron. La comprobación estructural previa/PDF pasó y se verificaron lecturas externas con Poppler y LibreOffice. El E2E completo no pudo ejecutarse: Docker no está instalado. El intento independiente de inspección visual con Chromium terminó en SIGSEGV antes de abrir la página; no se atribuye ese fallo a la aplicación.

## II. Estado inicial e inventario

La referencia de **7,7/10 procede del prompt y era estimativa**. No existe una auditoría anterior reproducible con notas por campo, por lo que no se inventa una variación numérica.

Inventario: aplicación web Next.js, paquetes de esquema editorial, base de datos, motor editorial, exportación, plantillas y utilidades compartidas. PostgreSQL conserva usuarios, espacios, libros, secciones, revisiones y trabajos; Cloudinary conserva imágenes. Render ejecuta una instancia web, sin Redis ni trabajadores permanentes adicionales.

La copia local inicial estaba atrasada. Se preparó un directorio aislado, se sincronizó el código con el commit indicado mediante el conector GitHub y se creó la rama `improvement/escribiendo-v6-1`. Se leyeron `apps/web/AGENTS.md` y la documentación local de Next.js sobre funciones de servidor. No se sobrescribió el directorio de trabajo previo.

La línea base unitaria pasó: **538 pruebas, 65 archivos**. Se confirmaron en código consultas que ordenaban globalmente por `sortOrder`, una instantánea vacía interpretada como ausencia de instantánea, falta de validación posterior al reemplazo y duplicación de «Editar metadatos».

## III. Problemas corregidos

| ID     | Prioridad | Problema y reproducción                                                      | Archivo principal                                                                 | Corrección y evidencia                                                                                                      | Estado                                           |
| ------ | --------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| ED-01  | P0        | Dos partes con capítulos de `sortOrder=0` se intercalaban por título         | `lib/books/reading-order.ts`, `lib/layout/preview.ts`, `lib/export/manuscript.ts` | Recorrido jerárquico común; desempate por título e ID; casos con subcapítulos, empates, huérfanos y ciclos                  | Corregido en código                              |
| ED-02  | P0        | Una estructura corrupta podía exportarse como lista plana                    | `lib/books/reading-order.ts`                                                      | Exportación estricta; navegación tolerante; pruebas negativas                                                               | Corregido en código; integración pendiente       |
| EX-01  | P0        | `[]` en el trabajo histórico recargaba el libro actual                       | `lib/export/manuscript.ts`                                                        | Vacío válido permanece vacío; documentos incompletos y trabajos antiguos con secciones ausentes se rechazan; regresiones    | Corregido                                        |
| EX-02  | P0        | La primera versión podía no tener revisión recuperable                       | `lib/export/manuscript.ts`                                                        | Nuevas instantáneas contienen contenido validado, metadatos, jerarquía y orden; reproducción sin depender de filas actuales | Corregido para trabajos nuevos                   |
| EX-03  | P1        | EPUB perdía `parentId` y `showInToc` en el adaptador web                     | `lib/export/chapter-titles.ts`                                                    | Propagación de ambos campos; subcapítulos con nivel 2 explícito; regresión                                                  | Corregido                                        |
| RP-01  | P0        | Reemplazar por texto excesivo o controles XML guardaba un documento inválido | `lib/books/manuscript-search-actions.ts`                                          | Valida el resultado antes de iniciar escrituras; pruebas con límites y controles                                            | Corregido                                        |
| RP-02  | P1        | Reemplazo confirmaba secciones antes de recalcular estadísticas              | mismo archivo, `lib/books/statistics.ts`                                          | Revisiones, CAS y totales dentro de una transacción serializable; prueba de llamada transaccional                           | Corregido; rollback real pendiente de PostgreSQL |
| RP-03  | P1        | Reemplazar `hola` por `Hola` se descartaba como operación idéntica           | mismo archivo                                                                     | Se permite corregir mayúsculas; conserva marcas; prueba                                                                     | Corregido                                        |
| DB-01  | P0        | Guardado comprobaba la versión antes de una actualización sin CAS            | `lib/books/actions.ts`                                                            | Escritura delimitada por sección, libro, espacio, versión y borrado; aislamiento serializable                               | Corregido en código; concurrencia real pendiente |
| DB-02  | P1        | Reordenamiento serializable no reintentaba abortos recuperables              | `lib/books/serializable.ts`                                                       | Máximo tres intentos solo para P2034; nunca reintenta conflictos funcionales                                                | Corregido, tres pruebas                          |
| ST-01  | P1        | Métrica «Capítulos» incluía prólogos y partes                                | `lib/books/statistics.ts`, ficha                                                  | Cuenta solo CHAPTER; ficha calcula palabras, capítulos y progreso desde sus secciones                                       | Corregido; reconciliación histórica no ejecutada |
| PDF-01 | P1        | Portada desplazaba el cuerpo sin corregir recto/verso                        | motor `pagination.ts`, vista previa y generación                                  | Desplazamiento físico independiente del folio; prueba con página en blanco y capítulo en recto                              | Corregido                                        |
| CV-01  | P1        | URL Cloudinary del mismo cloud podía no corresponder al ID declarado         | `lib/covers/asset-identity.ts`, `cover-actions.ts`                                | URL original versionada vinculada a ID/formato; firmas impiden sobrescritura; pruebas negativas                             | Corregido                                        |
| CV-02  | P1        | Exportación podía omitir una portada no recuperable                          | `lib/export/generate.ts`                                                          | Error explícito en lugar de producir un archivo sin la portada seleccionada                                                 | Corregido                                        |
| UX-01  | P1        | Acciones duplicadas y alturas mezcladas en ficha                             | ficha, `globals.css`                                                              | Cabecera editorial, portada o acceso para añadirla, acción de escritura y navegación alineada a 44 px                       | Prueba SSR pasada; visual/E2E pendiente          |
| UX-02  | P1        | Búsqueda tenía setState síncrono en efecto y errores sin manejar             | `manuscript-search-panel.tsx`                                                     | Limpieza desde el evento de entrada, límite de consulta y mensaje de error; se mantiene resaltado en vivo                   | Lint pasado; E2E pendiente                       |
| PF-01  | P2        | Deflate recomprimía JPEG/PNG/WebP en EPUB y DOCX                             | `packages/export-engine/src/zip.ts`                                               | Entradas de imágenes almacenadas sin recomprimir; texto sigue comprimido; conservación de bytes comprobada                  | Corregido y medido                               |
| CI-01  | P1        | Formato y lint bloqueaban verificaciones                                     | archivos señalados por herramientas, workflow CI                                  | Formato corregido sin cambios funcionales en esos archivos; comprobación previa/PDF añadida a CI                            | Local pasado; CI remoto por comprobar            |

## IV. Arquitectura final

Flujo editorial: secciones con `parentId` → `editorialOrder` → selección de secciones exportables → instantánea → composición y adaptadores PDF/EPUB/DOCX. La navegación conserva la recuperación tolerante de `section-tree` y comparte su comparador determinista con el orden editorial.

Vista previa y PDF continúan utilizando el paginador compartido, las mismas fuentes y el modelo de bloques existente. El desplazamiento físico por portada pasa ahora a ese paginador. EPUB/DOCX reciben la jerarquía y las opciones de índice que antes se perdían en la adaptación.

Las escrituras utilizan permisos en servidor, selección por espacio, control de versión y transacciones. El recálculo compartido de totales evita duplicar la fórmula en reemplazos y guardados. No se añadieron dependencias ni servicios.

## V. Mejoras de diseño

La ficha integra la portada con título, autoría y datos editoriales. Cuando falta portada ofrece un acceso visible para añadirla. Se conserva una única acción de metadatos y se incorpora la acción principal de escritura. Los controles de esa barra usan la altura estándar; se centralizaron las alturas estándar y compacta como variables CSS.

Se añadió una prueba del componente de servidor con datos aislados. Comprueba acción única, acceso a portada y recuentos reales de capítulos. Se preparó `tests/e2e/ficha-editorial.spec.ts` para 375, 390, 768, 1024, 1440 y 1920 px, con comprobaciones de desbordamiento, alturas, axe y capturas.

**No se completó una inspección visual de todas las pantallas ni se obtuvieron capturas válidas de esta ejecución.** Los cambios de estilo son limitados y requieren el E2E remoto antes de considerarse aceptados visualmente.

## VI. Calidad editorial

- Orden jerárquico verificado con partes, capítulos, subcapítulos, empates, huérfanos y ciclos.
- Nuevas instantáneas conservan la versión seleccionada incluso sin revisión inicial disponible. Un vacío válido no se convierte en el manuscrito actual.
- Los trabajos históricos antiguos siguen dependiendo de las revisiones y metadatos que efectivamente se guardaron. La intervención no puede reconstruir datos históricos ya perdidos.
- La exportación rechaza contenido inválido en lugar de omitir silenciosamente su texto.
- El adaptador reflowable conserva inclusión en índice y parentesco. DOCX mantiene los estilos existentes; no se certifica equivalencia visual con PDF, ni se han sustituido sus márgenes y composición por un motor nuevo.
- La comprobación estructural previa/PDF pasó con 11 páginas. No es una comparación de píxeles ni cubre por sí sola todas las combinaciones de portada, imágenes y notas.
- Se validó lectura del PDF con Poppler. LibreOffice abrió el DOCX y lo convirtió a PDF; Poppler recuperó los cuatro pasajes esperados, incluidos la nota y el pie de imagen.
- EPUBCheck no está instalado. La generación y las pruebas XML/ZIP existentes pasaron; no se declara validación EPUBCheck.
- La búsqueda/reemplazo todavía opera por hojas de texto: una frase partida entre marcas de formato puede no contarse/reemplazarse como una única coincidencia. Es un pendiente explícito.

## VII. Seguridad e integridad

Las operaciones modificadas conservan autenticación y autorización. El reemplazo rechaza un rol sin permisos antes de leer el contenido; las actualizaciones incluyen libro, espacio, versión y estado de borrado. Se prepararon diagnósticos SQL de huérfanos, padres de otro libro, ciclos y posiciones duplicadas.

`docs/sql/proposed-section-constraints.sql` es una **propuesta**, no una migración desplegable automáticamente. Añade claves compuestas y comprobación de padre propio con `NOT VALID`, incluye validación posterior y reversión. No resuelve por sí sola ciclos de múltiples filas. Antes de producción necesita ensayo en PostgreSQL desechable, análisis de bloqueos y revisión de los datos existentes. No se alteró ningún archivo de migración existente.

Mitigación actual de jerarquías inválidas: validación transaccional de movimientos y rechazo estricto al exportar. La protección equivalente frente a SQL directo sigue pendiente de completar en la base.

Las nuevas portadas deben tener URL versionada coherente con su archivo; las subidas firmadas ya no permiten sobrescribir. Esto **no constituye un archivo permanente de recursos externos**: eliminar un recurso en Cloudinary o modificarlo con otras credenciales puede impedir reproducirlo. Tampoco se han archivado todas las ilustraciones interiores.

Las instantáneas completas duplican contenido por trabajo. Debe vigilarse el almacenamiento de Neon y la retención; no se almacenan binarios en PostgreSQL. No se registró texto de manuscritos en los logs de esta intervención.

## VIII. Rendimiento

Mediciones locales sintéticas; no son tiempos observados en Render ni latencias de usuarios. Node 24.19.0 local; el proyecto configura 24.20.0 en despliegue.

| Caso: 200 000 palabras, 80 imágenes, 500 notas | Antes de optimizar ZIP |   Después | Interpretación             |
| ---------------------------------------------- | ---------------------: | --------: | -------------------------- |
| Páginas compuestas                             |                    547 |       547 | Estructura conservada      |
| Imágenes incrustadas por formato               |                     80 |        80 | Sin eliminar recursos      |
| Tiempo EPUB                                    |                1786 ms |    463 ms | Evita recomprimir imágenes |
| Tiempo DOCX                                    |                1207 ms |    335 ms | Mismo cambio               |
| Pico de memoria del proceso                    |                 478 MB |    447 MB | Sigue cerca de 512 MB      |
| Tamaño EPUB                                    |              39 513 KB | 39 507 KB | Sin pérdida de contenido   |
| Tamaño DOCX                                    |              39 500 KB | 39 494 KB | Sin pérdida de contenido   |

PDF también varió de 657 a 236 ms, pero su código de compresión no cambió: **no se atribuye esa diferencia a la optimización**. Las muestras individuales están sujetas a caché, GC y carga. No se midió un percentil de latencia ni el arranque en frío de Render.

El benchmark adicional compuso 10 000/50 000/100 000/200 000 palabras. Los estáticos y JavaScript quedaron dentro de los presupuestos del repositorio. Un libro ilustrado extremo conserva un riesgo de memoria; no se garantiza que la misma carga sobreviva dentro de un servidor Next.js de 512 MB con sus otras reservas.

## IX. Pruebas ejecutadas

Se usaron los ejecutables instalados del proyecto y sus scripts; no se rebajaron reglas ni se ocultaron errores.

| Comando o comprobación                                                      | Resultado                                                                         |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm test` en línea base                                                   | 538 pruebas, 65 archivos, pasaron                                                 |
| `node_modules/.bin/vitest run` tras intervención                            | 562 pruebas, 70 archivos, pasaron                                                 |
| `node --import tsx scripts/prisma.ts generate`                              | Cliente generado                                                                  |
| `node --import tsx scripts/prisma.ts validate` con URLs locales ficticias   | Esquema válido; no conecta a producción                                           |
| `node_modules/.bin/prettier --check .`                                      | Pasó                                                                              |
| `node_modules/.bin/eslint .`                                                | Pasó                                                                              |
| TypeScript web y raíz mediante `tsc --noEmit`                               | Pasó                                                                              |
| `next build` desde `apps/web`                                               | Producción compilada; TypeScript incluido                                         |
| `node --conditions=react-server --import tsx scripts/verify-preview-pdf.ts` | 11 páginas coincidentes                                                           |
| `scripts/validate-pdf.ts` con lector Poppler por `PDF_VALIDATOR`            | Texto esperado recuperado                                                         |
| `scripts/validate-docx-libreoffice.ts`                                      | LibreOffice abrió y convirtió; lector pdf.js ausente impidió completar ese script |
| Comprobación independiente DOCX→LibreOffice→Poppler                         | Cuatro pasajes esperados conservados                                              |
| `scripts/validate-epub.ts`                                                  | Generó archivo; código 2 por EPUBCheck ausente                                    |
| `scripts/validate-docx.ts` sin lector configurado                           | Generó archivo; código 2, no equivale a validación                                |
| `scripts/benchmark-export.ts` y `scripts/stress-export.ts`                  | Ejecutados; mediciones arriba                                                     |
| `scripts/check-size.ts`                                                     | Dentro del presupuesto                                                            |
| `scripts/test-e2e-local.ts`                                                 | Bloqueado: `spawn docker ENOENT`                                                  |
| Playwright visual con componente SSR aislado                                | Chromium terminó con SIGSEGV; no hubo inspección visual válida                    |
| Auditoría SQL y reconciliación de estadísticas                              | Preparadas, no ejecutadas contra datos reales                                     |

Un conflicto simulado en pruebas unitarias comprueba el camino de abortar; **no demuestra el rollback de PostgreSQL bajo dos sesiones reales**. Esa integración debe completarse en CI/base desechable.

## X. Puntuaciones

Rúbrica orientativa por área: implementación revisada 40 %, regresiones automatizadas 30 %, integración/validación real 20 %, operación/documentación 10 %. La falta de integración y revisión visual limita las notas. Son valoraciones técnicas provisionales, no una certificación.

| Área                               |      Peso |       Nota previa verificable | Nota actual provisional | Variación         | Evidencia y límite                                                              |
| ---------------------------------- | --------: | ----------------------------: | ----------------------: | ----------------- | ------------------------------------------------------------------------------- |
| Diseño, UX y accesibilidad         |      15 % |                           N/D |                     7,0 | N/D               | Ficha y controles corregidos; SSR; visual y axe pendientes                      |
| Integridad y seguridad editorial   |      20 % |                           N/D |                     8,0 | N/D               | Orden, snapshots, CAS y pruebas; PostgreSQL real pendiente                      |
| Editor y lógica editorial          |      20 % |                           N/D |                     8,0 | N/D               | Totales y reemplazo validados; búsqueda entre marcas pendiente                  |
| Maquetación y exportaciones        |      15 % |                           N/D |                     8,0 | N/D               | Paridad, jerarquía, lectura externa; EPUBCheck y matriz geométrica pendientes   |
| Seguridad general                  |      10 % |                           N/D |                     8,0 | N/D               | Autorización negativa y URL de portada; no pentest integral                     |
| Arquitectura y mantenibilidad      |      10 % |                           N/D |                     8,5 | N/D               | Helpers compartidos, sin nuevas dependencias; estilos globales todavía extensos |
| Rendimiento y escalabilidad        |       5 % |                           N/D |                     7,5 | N/D               | Mejora medida en ZIP; margen de RAM reducido; sin latencias reales              |
| Operación, pruebas y documentación |       5 % |                           N/D |                     7,5 | N/D               | Estáticos/build y documentación; E2E e integración pendientes                   |
| **Total ponderado**                | **100 %** | **7,7 estimado en el prompt** |             **7,85/10** | **No comparable** | **No se alcanzó ni se declara 9,5**                                             |

## XI. Estado por fases y pendientes

| Fase                   | Trabajo realizado                                                                 | Pendiente para darla por cerrada                                              |
| ---------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 0. Inventario          | Base aislada, revisión Git, mapa, línea base y riesgos                            | Inspección del despliegue y base reales                                       |
| 1. Jerarquía           | Orden compartido, validación estricta, integración en previa/exportación/búsqueda | Integración con todos los formatos sobre PostgreSQL                           |
| 2. Datos               | CAS, aislamiento y reintentos; diagnóstico y propuesta SQL                        | Ensayo de restricciones, dos sesiones, procedimiento de reparación aprobado   |
| 3. Historia            | Nuevas instantáneas completas y vacío/corrupción diferenciados                    | Archivo permanente de recursos y compatibilidad histórica completa            |
| 4. Previa/PDF          | Paridad física compartida y pruebas                                               | Matriz de geometría, fuentes, imágenes y notas; comparación visual            |
| 5. EPUB/DOCX           | Metadatos jerárquicos transmitidos; lectura DOCX externa                          | EPUBCheck y revisión editorial visual de formatos                             |
| 6. Estadísticas        | Recálculo común y capítulos reales; script por lotes, dry-run por defecto         | Simulación y reconciliación aprobada sobre base real                          |
| 7. Editor              | Revisión de sincronización existente; CAS y concurrencia reforzados               | Escenarios offline, dos pestañas y cierres mediante E2E                       |
| 8. Reemplazo           | Validación final, revisiones y totales atómicos, errores útiles                   | Coincidencias entre marcas y vista previa detallada por reemplazo             |
| 9. Diseño              | Tokens de alturas y coherencia de ficha                                           | Auditoría visual completa, componentes/estilos globales restantes             |
| 10. Ficha/biblioteca   | Cabecera, portada, acción principal, sin duplicación                              | Ejecución responsive/axe; refinamiento de biblioteca completa                 |
| 11. Narrativa/portadas | Identidad y versión de portada; análisis existente revisado                       | Corpus narrativo mayor; calidad de detección, mundos y planificación visual   |
| 12. Seguridad          | Permisos preservados, escrituras acotadas y pruebas negativas                     | Pruebas integrales de IDOR/abuso y recursos en entorno aislado                |
| 13. Rendimiento        | Benchmark, estrés, mejora ZIP y presupuesto de estáticos                          | Latencias de vistas/acciones, medición en Render y límites de cargas extremas |
| 14. Pruebas/CI         | Unitarias, lint, tipos, formato, build y E2E preparado                            | CI remoto, E2E y validadores faltantes                                        |
| 15. Entrega            | Este informe, plan original, SQL y operación documentada                          | Comprobaciones después de integrar/desplegar                                  |
| 16. Auditoría          | Revisión de correcciones y limitaciones; nota provisional                         | Reauditoría tras resolver bloqueos; sin bucle indefinido                      |

Revisión progresiva de esta ejecución: primero se corrigieron orden/snapshots; después límites, aislamiento, paridad y seguridad de portadas; finalmente formato/lint, adaptación reflowable y coste de ZIP. Las regresiones encontradas se corrigieron antes de la entrega. No se sustituyen las pruebas faltantes por una nota objetivo.

### Operación y recuperación

1. Revisar el PR, CI y capturas E2E antes de integrar. No requiere nuevas migraciones para las correcciones de aplicación.
2. Mantener aplicadas las migraciones existentes de `main`; este trabajo no cambia sus checksums ni las registra manualmente.
3. Ensayar `node --import tsx scripts/reconcile-book-statistics.ts` en una copia. Por defecto solo informa IDs y diferencias. `--apply` modifica únicamente contadores derivados, por libro y transacción; no usarlo sobre producción sin revisar el dry-run.
4. Ejecutar el SQL diagnóstico solo en un entorno autorizado. No aplicar la propuesta de restricciones antes de ensayarla y disponer de respaldo/reversión.
5. Después del despliegue, comprobar health check, edición/guardado, búsqueda, portada, vista previa y descarga de cada formato con un libro de prueba separado.
6. Reversión de aplicación: revertir el commit del PR. Las instantáneas con contenido deben conservarse; una versión vieja del código puede no aprovechar ese contenido y volver a depender de revisiones. No borrar trabajos históricos para resolver incompatibilidades.

## XII. Entrega Git

Rama de intervención: `improvement/escribiendo-v6-1`. Base remota: `04a42dee98e1d9ab4eb6efc9c68f6474dcb2c1f9`.

Los commits remotos y el enlace de revisión se registran en el PR. El directorio local preserva su commit de sincronización, que no sustituye la historia remota. El envío utiliza un commit con el `main` remoto como padre y solo archivos cuyo contenido cambió realmente frente a esa base; excluye caches, binarios y migraciones existentes.

Estado de publicación: **propuesta para revisión, sin merge ni despliegue automático por esta intervención**. Un push o PR no demuestra que Render haya actualizado la web. La URL, commit y resultados remotos deben consultarse en el PR antes de publicar.

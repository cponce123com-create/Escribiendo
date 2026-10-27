# Informe final de auditoría — ESCRIBIENDO V5.1

Fecha: 23 de octubre de 2026.

Rama: `improvement/fidelidad-editorial`.

Punto de partida: **7,1/10**.

HEAD medido: `21d9b74`, más el commit que añade este informe.

Alcance: auditoría, corrección, modernización y optimización con prioridad en la
integridad de los manuscritos. Cada hallazgo se comprobó contra el código de esta
rama antes de modificarlo; no se aceptaron como ciertas las puntuaciones de
informes anteriores.

---

## A. Veredicto

La rama queda en **8,7/10 (87,1/100)**, frente al **7,1/10** de partida. La
mejora es de **+1,6 puntos** y se apoya en correcciones ejecutadas, pruebas
verdes y una compilación de producción correcta.

Lo que cambia de forma sustantiva:

- Se cierran dos agujeros de integridad: el reordenamiento de secciones podía
  cruzar libros y las exportaciones podían reutilizar un trabajo con el
  manuscrito ya cambiado.
- La vista previa y el PDF comparten portada, letra capital, índice y orden de
  secciones.
- Los objetivos de escritura dejan de sumar palabras de otros libros y la ficha
  del libro recalcula sus totales cuando cambian el objetivo, las secciones o el
  contenido.
- El editor conserva su control de conflictos y sus borradores locales; la
  búsqueda se etiqueta por lo que realmente hace.

**No se declara 9,5/10.** La nota que falta no es retórica: no se ha ejecutado
la suite E2E contra una base de datos desechable, no hay credenciales reales de
Cloudinary, Neon ni Render y queda una migración de invariantes en base de datos
que exige auditar datos antes de aplicarla. Declarar 9,5 sin esa evidencia sería
simular éxito.

---

## B. Método y límites de la medición

Se trabajó en tres rondas de AUDITAR → CORREGIR → PROBAR → MEDIR → VOLVER A
AUDITAR. La regla fue no tocar un hallazgo sin reproducirlo en el código actual.

| Comprobación      | Comando                                | Resultado                              |
| ----------------- | -------------------------------------- | -------------------------------------- |
| Formato           | `pnpm format:check`                    | Correcto                               |
| Análisis estático | `pnpm lint`                            | Sin errores                            |
| Tipos             | `pnpm typecheck`                       | Sin errores                            |
| Pruebas unitarias | `pnpm test`                            | **63 archivos, 527 pruebas correctas** |
| Compilación       | `pnpm --filter @escribiendo/web build` | Correcta (Next.js 16.4.2)              |
| Vista previa/PDF  | `pnpm verify:preview-pdf`              | 11 páginas en ambas salidas            |

Lo que **no** se ha ejecutado y por tanto no se puntúa como verificado:

- `pnpm test:e2e`: requiere base de datos y navegador; no se ejecutó en esta
  sesión.
- Pruebas de integración contra PostgreSQL desechable: no hay credenciales y no
  se inventaron.
- Subida real a Cloudinary, despliegue en Render y comportamiento bajo carga
  contra Neon: sin acceso a esas cuentas.
- `pnpm db:generate`: puede fallar con `EPERM` si el DLL de Prisma está
  bloqueado; los tipos ya generados permiten compilar y probar.

Las pruebas unitarias mockean Prisma. Eso verifica la lógica de las acciones,
pero no sustituye una prueba de aislamiento `Serializable`, de restricciones
únicas o de concurrencia real.

---

## C. Integridad de datos (P0)

### C.1. Reordenamiento y aislamiento entre libros

**Hallazgo confirmado.** El movimiento de secciones usaba SQL crudo con una
columna `parent_id` que no existe en el modelo; el padre se aceptaba sin
comprobar que perteneciera al mismo libro; el borrado de descendientes no estaba
acotado por libro; y `getSectionTree` no filtraba por el espacio de trabajo de la
sesión. En el peor caso, una sección podía quedar bajo un padre de otro libro o
aparecer en el árbol de otro estudio.

**Corrección** (`035c1e7`):

- `moveSectionWithinBook` usa una transacción interactiva `Serializable` con
  reintento ante `P2034`.
- El padre se valida por `bookId`; se rechazan anticiclos; el orden es
  determinista con `[{ sortOrder: "asc" }, { id: "asc" }]`.
- Las escrituras se acotan con `updateMany` por `bookId` y `deletedAt: null`.
- `createSectionAction` exige que el padre sea del mismo libro.
- `deleteSectionAction` recolecta descendientes y borra acotado por `bookId`.
- `getSectionTree` filtra por el workspace de la sesión.
- El permiso `book:submitForReview` entra en el catálogo.

**Evidencia**: `apps/web/src/lib/books/actions.ts`, `queries.ts`,
`actions.test.ts` (regresión de mover, crear, borrar y filtro de workspace), y
la suite completa en verde.

**Límite que sigue abierto**: la invariante vive en el backend. No hay una
restricción compuesta en PostgreSQL para `(bookId, parentId, sortOrder)` ni para
el padre del mismo libro. Añadirla exige auditar primero los datos existentes y
preparar una migración segura; no se hizo una migración destructiva.

### C.2. Exportaciones reproducibles

**Hallazgo confirmado.** `manuscriptHash` no incluía título, tipo, orden ni
opciones de composición. Renombrar o reordenar una sección podía reutilizar un
trabajo anterior y devolver el archivo viejo. Además, la generación y la
descarga no siempre partían de la misma fuente: la descarga podía regenerar sin
portada.

**Corrección** (`2760796`):

- La huella incluye título, tipo, orden, flags y contenido.
- Cada trabajo guarda una instantánea completa por sección (metadatos y
  versión), no solo `{ id, version }`.
- `loadManuscriptFromSnapshot` y `loadManuscriptForJob` reconstruyen desde la
  instantánea.
- `ExportLayoutSnapshot` captura portada, autor, título y maqueta.
- `resolveExportJobInput` es la fuente común para generar y descargar.
- La descarga firmada está acotada por workspace y solo sirve trabajos
  `COMPLETED`.
- Los trabajos antiguos siguen reproduciéndose con los datos actuales
  (compatibilidad hacia atrás).

**Evidencia**: `apps/web/src/lib/export/jobs.ts`, `reproduce.ts`, `generate.ts`,
`manuscript.test.ts`, `reproduce.test.ts`, `layout-snapshot.test.ts` y la ruta
`api/exports/[jobId]/download/route.ts`.

**Límite que sigue abierto**: un trabajo antiguo sin portada en la instantánea
se reproduce con la portada actual. Es compatibilidad deliberada, no
reproducibilidad byte a byte de esos trabajos históricos.

---

## D. Exportaciones y paridad vista previa/PDF

**Hallazgo confirmado.** La vista previa no respetaba la opción de letra
capital, no incluía la portada como página 1, no desplazaba el índice y podía
desempatar el orden de secciones de forma distinta a la exportación. El PDF, por
su parte, estiraba la portada para llenar la página.

**Corrección** (`190dbec`):

- `buildPreview(session, bookId, { dropCaps })` propaga la opción; la página
  admite `?dropCaps=true` y ofrece enlaces “Sin inicial” / “Con inicial”.
- `PreviewBlock` dibuja la inicial al triple del cuerpo y descuenta la primera
  letra de la línea, con la misma corrección de línea base que el PDF.
- La portada abre la vista previa como página 1, con el mismo recorte
  (`object-fit: cover`, punto focal y zoom); índice y numeración se desplazan.
- `coverPlacement` es geometría pura compartida: escala uniforme, punto focal y
  zoom. `ExportImage` admite `crop` y `reproduce.ts` propaga el recorte de la
  instantánea.
- La vista previa ordena con `{ id: "asc" }`, igual que la exportación.

**Evidencia**: `apps/web/src/lib/export/cover-placement.ts` y su test,
`apps/web/src/lib/layout/preview.ts` y su test, `drawing.test.ts`,
`reproduce.test.ts`, y `pnpm verify:preview-pdf` con 11 páginas en vista previa y
PDF.

**Límites que siguen abiertos**:

- La composición recto/verso no cambia al anteponer la portada; vista previa y
  PDF comparten esa limitación.
- Si la portada no carga en el PDF pero sí en el navegador, el PDF omite esa
  página y no desplaza el índice, mientras la vista previa sí. Es un caso límite.
- EPUB y DOCX ignoran el recorte de portada por diseño; no comparten la
  geometría del PDF.

---

## E. Lógica editorial y ficha del libro

### E.1. Objetivos aislados por libro

**Hallazgo confirmado.** `wordsWrittenInPeriod` sumaba las palabras de todo el
workspace, aunque el objetivo perteneciera a un libro. Un objetivo de una novela
podía progresar con las palabras de otro manuscrito.

**Corrección** (`d3a4470`): `wordsWrittenInPeriod` recibe `bookId`; `listGoals`
agrupa los objetivos por libro y usa `computeGoalProgress`, que protege los
objetivos no positivos. Los objetivos generales (`null`) siguen contando todo el
workspace.

**Evidencia**: `apps/web/src/lib/writing/goals.ts`, `goals.test.ts`.

### E.2. Totales derivados del contenido

**Hallazgo confirmado.** Cambiar el objetivo de palabras no recalculaba
`writingProgress`, y crear un capítulo no actualizaba `chapterCount`. La ficha
podía mostrar un porcentaje o un número de capítulos viejo hasta el siguiente
guardado.

**Corrección** (`d3a4470`):

- `updateBookAction` actualiza metadatos y recalcula `wordCount`, `chapterCount`
  y `writingProgress` en la misma transacción.
- `createSectionAction` recalcula los totales al crear la sección.
- `recomputeBookTotals` cuenta solo secciones `deletedAt: null` y tipos
  capítulo-like; se llama al guardar, crear, borrar y cambiar metadatos.

**Evidencia**: `apps/web/src/lib/books/actions.ts` y las pruebas nuevas de
`actions.test.ts` (cambio de objetivo, creación de sección, borrado).

**Límites que siguen abiertos**:

- Los libros que ya tenían totales desfasados no se corrigen solos al desplegar.
  Hace falta un backfill idempotente, con copia de seguridad y validación previa.
- La caché de estadísticas usa `desde.getTime()` en la clave, así que no acierta
  entre peticiones normales. Es un problema de rendimiento, no de
  funcionalidad.
- El histórico de estadísticas filtra `bookSection.deletedAt: null`: las
  secciones borradas desaparecen también del pasado. Es una decisión semántica
  pendiente de validar con producto.

---

## F. Editor, búsqueda y recuperación

**Lo que se confirmó sano**:

- El guardado usa `expectedVersion` y devuelve un conflicto con la versión del
  servidor y el contenido para comparar.
- El editor ignora respuestas viejas, mantiene el borrador local si el guardado
  se limita (`throttled`) y no borra el borrador hasta confirmar que no quedaron
  cambios locales.
- El panel de conflicto permite conservar la versión propia o la del servidor.
- Las revisiones son inmutables y restaurar una versión crea una revisión nueva.

No se encontró en esta ronda un defecto nuevo de pérdida de datos en ese flujo.

**Corrección** (`606d029`): el campo de búsqueda decía “Buscar en el manuscrito”,
pero el editor solo recorre el documento de la sección abierta. La etiqueta y el
marcador ahora dicen “capítulo actual”. No se promete una búsqueda que no existe.

**Límites que siguen abiertos**:

- No hay reemplazo de texto en el editor.
- No hay búsqueda en todo el manuscrito desde ese campo.
- El centro de notificaciones sigue siendo un placeholder “pendiente de
  implementación”.

---

## G. Diseño, accesibilidad y rendimiento

**Corrección** (`b2e3133`): la ficha y el listado usaban `toFixed(2)`, que produce
`83.33%` con punto decimal. `formatPercent` usa `Intl.NumberFormat("es-ES")` y
conserva dos decimales con coma (`83,33%`). Hay una prueba propia.

**Accesibilidad**: se revisaron etiquetas `aria-label`, `role="search"`,
`aria-live` del resultado de búsqueda y los enlaces de letra capital. No se
ejecutó una auditoría automatizada con axe en esta sesión; no se declara
conformidad WCAG.

**Rendimiento**:

- La compilación de producción termina correctamente.
- No se ejecutaron `bench:export`, `stress:export` ni una prueba de carga contra
  Render/Neon.
- La caché de estadísticas es ineficaz entre peticiones por la clave exacta
  de milisegundos; corregirla exige alinear la ventana temporal y volver a medir.
- El recálculo de totales añade un `aggregate`, un `count` y un `update` por
  guardado; es acotado por `bookId` y aceptable, pero no se ha medido con un
  manuscrito de gran tamaño en base real.

---

## H. Pruebas y evidencia ejecutada

| Comprobación      | Resultado                                                    |
| ----------------- | ------------------------------------------------------------ |
| Formato           | `pnpm format:check` correcto                                 |
| Lint              | `pnpm lint` sin errores                                      |
| Tipos             | `pnpm typecheck` sin errores                                 |
| Unitarias         | **63 archivos, 527 pruebas correctas**                       |
| Compilación       | `next build` correcto, rutas dinámicas y estáticas generadas |
| Paridad preview   | **11 páginas** en vista previa y en PDF                      |
| E2E               | No ejecutadas en esta sesión                                 |
| Integración real  | No ejecutada: sin PostgreSQL desechable                      |
| Cloudinary/Render | No verificado: sin credenciales ni acceso al despliegue      |

Pruebas añadidas o reforzadas en esta auditoría:

- `actions.test.ts`: aislamiento de secciones, reintento `P2034`, borrado
  acotado, recálculo al crear y al cambiar el objetivo.
- `goals.test.ts`: palabras por libro y progreso de objetivos.
- `cover-placement.test.ts`: geometría de portada.
- `preview.test.ts`: letra capital, portada, índice y orden.
- `reproduce.test.ts`: instantánea, portada y descarga.
- `format.test.ts`: coma decimal española.
- `drawing.test.ts`: corrección de la inicial capitular.

---

## I. Riesgos residuales, bloqueos y conclusión

| #   | Riesgo                                                              | Severidad | Estado / siguiente paso                                                         |
| --- | ------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------- |
| 1   | Invariantes de sección solo en backend, sin restricción compuesta   | Alta      | Auditar datos y preparar migración aditiva; no aplicar a ciegas                 |
| 2   | Totales ya guardados pueden estar desfasados tras el despliegue     | Alta      | Script de backfill idempotente con copia de seguridad y validación              |
| 3   | Borrado y movimiento concurrentes pueden dejar una sección huérfana | Media     | Envolver el borrado en la misma estrategia `Serializable` o bloquear el subtree |
| 4   | Sin E2E ni integración real en esta sesión                          | Alta      | Base PostgreSQL desechable + Playwright; no usar Neon de producción             |
| 5   | Cloudinary, Render y Neon sin verificar                             | Alta      | Credenciales de staging y prueba de subida, despliegue y carga                  |
| 6   | Caché de estadísticas ineficaz                                      | Media     | Clave por periodo estable y medición antes/después                              |
| 7   | Secciones borradas desaparecen del histórico                        | Media     | Decidir semántica con producto y documentarla                                   |
| 8   | Paridad física recto/verso tras la portada                          | Media     | Componer la primera página y desplazar la paridad si el diseño lo exige         |
| 9   | Portada que falla solo en PDF                                       | Baja      | Alinear la omisión/desplazamiento entre preview y PDF                           |
| 10  | Sin búsqueda/reemplazo global; notificaciones placeholder           | Baja      | Funcionalidad futura; la etiqueta actual ya no promete de más                   |
| 11  | `db:generate` puede fallar por DLL bloqueada                        | Baja      | Ejecutar en CI limpio; los tipos generados permiten trabajar                    |

### Puntuación por criterio

Se usan los mismos pesos que la auditoría anterior para que la comparación sea
útil. La nota es una estimación fundamentada, no una medición de laboratorio; la
base de 7,1 no publicó su desglose, así que la comparación directa es aproximada.

| Criterio                |  Peso | Nota | Aportación | Razón                                                                 |
| ----------------------- | ----: | ---: | ---------: | --------------------------------------------------------------------- |
| Funcionalidad real      |  25 % |   87 |      21,75 | P0/P1 cerrados; quedan reemplazo global y notificaciones              |
| Seguridad y resiliencia |  20 % |   88 |      17,60 | Scoping, permisos, firmas y transacciones; faltan staging y 2FA       |
| Pruebas y evidencia     |  20 % |   90 |      18,00 | 527 unitarias, lint, tipos, build y paridad; faltan E2E e integración |
| Rendimiento             |  15 % |   79 |      11,85 | Sin carga real; caché de estadísticas ineffective                     |
| Mantenibilidad          |  10 % |   89 |       8,90 | Módulos claros y pruebas; `actions.ts` sigue siendo grande            |
| Documentación           |  10 % |   90 |       9,00 | Auditorías y este informe; falta consolidar la documentación de rama  |
| **Total**               | 100 % |      |  **87,10** | **8,7/10**                                                            |

### Conclusión

La rama pasa de **7,1** a **8,7/10** con evidencia reproducible. El salto no
viene de una reescritura: viene de cerrar fallos que podían corromper o falsear
el manuscrito y de igualar lo que el usuario ve con lo que se exporta.

Para reclamar 9,5 falta, como mínimo:

1. Cerrar la migración de invariantes con datos auditados.
2. Ejecutar E2E e integración contra PostgreSQL desechable.
3. Probar Cloudinary, Render y Neon en staging, incluida una carga real.
4. Repetir la medición de rendimiento y corregir la caché de estadísticas.
5. Resolver la paridad física de la portada y el caso de portada ausente en PDF.

Hasta entonces, **9,5 no se declara**.

---

## Anexo: commits de esta auditoría

| Commit    | Contenido                                                          |
| --------- | ------------------------------------------------------------------ |
| `035c1e7` | Integridad del reordenamiento, aislamiento por libro y workspace   |
| `2760796` | Instantánea editorial completa y descarga reproducible             |
| `190dbec` | Portada, letra capital e índice alineados entre vista previa y PDF |
| `d3a4470` | Objetivos por libro y recálculo de totales de la ficha             |
| `606d029` | Búsqueda del editor acotada al capítulo actual                     |
| `b2e3133` | Progreso con coma decimal española                                 |
| `06266fe` | Formato de las pruebas de acciones                                 |
| `84d949a` | Lint de pruebas: sin `any` ni variables sin uso                    |
| `21d9b74` | Prettier en los archivos pendientes                                |

Todos los commits están publicados en `origin/improvement/fidelidad-editorial`
sin `force push`.

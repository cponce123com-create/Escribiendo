# Laboratorio Editorial: uso, cierre y despliegue

Entrega del 24 de octubre de 2026. Continúa el inventario y la integración publicados en PR 57. El importador no se modifica.

## Funciones conectadas

Desde la ficha del libro o el manuscrito, abrir **Laboratorio Editorial**. Las diez categorías reutilizan editor, motores locales, biblia de personajes, continuidad y planificación existentes; no existe una segunda aplicación ni un proveedor de IA. Los análisis no envían manuscritos a terceros y nunca corrigen el texto sin decisión del autor.

- **Estilo, repeticiones, legibilidad y ritmo:** analizar el manuscrito o un capítulo con sus descendientes, seleccionar reglas, filtrar hallazgos y abrir fragmentos con comprobación de versión. Las métricas describen forma y no califican calidad literaria.
- **Revisión por cuenta:** reglas omitidas y decisiones abierta/ignorada/intencional/resuelta se guardan por usuario y libro en `LaboratoryReviewState`. Se leen en otros navegadores al abrir/recargar el análisis, sin prometer colaboración en tiempo real. Las decisiones se identifican con SHA-256 de la clave versionada del hallazgo; no se guarda el manuscrito en esa tabla. Un cambio de texto/regla produce otro hallazgo.
- **Decisiones anteriores:** la opción «Decisiones de la versión anterior» copia explícitamente las de localStorage, en lotes de 100. Solo acepta claves de la cuenta/libro y no sustituye estados ya existentes, ni siquiera una observación reabierta. No borra el respaldo local. El límite es de 5.000 decisiones por usuario/libro; no se eliminan decisiones silenciosamente para liberar espacio.
- **Resumen global:** «Actualizar resumen del manuscrito» calcula pendientes de estilo/repeticiones y posibles inconsistencias vigentes, e informa cobertura de continuidad y omisiones. No presenta capítulos aún sin analizar como comprobados sin problemas. Las decisiones privadas y las compartidas de continuidad se distinguen.
- **Cronología:** registrar/editar acontecimientos asociados con personajes del mismo libro y opcionalmente una sección; guardar fecha exacta, aproximada, solo año o intervalo. «Solo año» usa una fecha auxiliar introducida explícitamente por el autor y solo muestra el año. Se valida calendario gregoriano, años bisiestos e inicio/final. Subir/bajar cambia exclusivamente `sequence`, no el manuscrito. Las fechas exactas incompatibles con ese orden generan una advertencia; el orden narrativo puede diferir legítimamente.
- **Estructura:** guardar modelo libre, tres actos, cinco actos o doce etapas del viaje del héroe; asignar y retirar una etapa por sección. Cambiar de modelo conserva las etiquetas anteriores y las señala para reasignación explícita. No se mueve ni exige completar capítulos.
- **Continuidad 1.1:** agrega filiación explícita padre/madre con dos personajes inequívocos, apellidos declarados en un mismo año y fechas numéricas de nacimiento/fallecimiento (ISO o día/mes/año). Detecta fechas imposibles y fallecimiento anterior al nacimiento. No crea parentescos por coaparición ni fusiona fichas. Diálogo, recuerdo e hipótesis continúan separados del canon hasta confirmación del autor.
- **Guardado:** se corrigió una regresión del respaldo local: publicar un estado idéntico cada 700 ms reiniciaba continuamente el debounce de servidor. El evento es idempotente y la recuperación real de red se comprueba en E2E, incluyendo la espera restante del throttling de 45 s.

Las acciones comprueban origen, sesión, permiso central y workspace/libro. Planificación usa `story:manage`; decisiones privadas de revisión usan `comment:create` (incluye al revisor y no concede escritura del manuscrito). El control optimista de versión impide reemplazar cambios concurrentes de planificación; la revisión reintenta conflictos conservando decisiones ajenas al cambio. La auditoría contiene operación y referencias, no texto del manuscrito.

## Migración aditiva

`packages/database/prisma/migrations/20261024130000_complete_editorial_laboratory/migration.sql` añade:

| Tabla                    | Campos                                                       |
| ------------------------ | ------------------------------------------------------------ |
| books                    | narrativeStructure (FREE), narrativeVersion (0)              |
| book_sections            | narrativeStage opcional                                      |
| story_character_events   | startsOn/endsOn opcionales, datePrecision (UNDATED)          |
| laboratory_review_states | cuenta, workspace, libro, preferencias, decisiones y versión |

No borra secciones, revisiones, acontecimientos ni decisiones previas. Se actualizó `expected-schema.ts`: una instancia sin migrar debe ir al estado de migración pendiente. La CLI `db:migrate:create` se cambió a `node --import tsx` para no depender del socket IPC de la CLI tsx.

Se intentó `pnpm db:migrate:create --name complete_editorial_laboratory --create-only` contra una dirección de pruebas local. El entorno no disponía de PostgreSQL nativo/shadow accesible. El SQL se generó con la CLI instalada de Prisma mediante `migrate diff --from-schema-datamodel /tmp/lab-schema-before.prisma --to-schema-datamodel packages/database/prisma/schema.prisma --script`. Se aplicó la cadena completa de once migraciones sobre una instancia PostgreSQL embebida PGlite aislada y se verificaron las columnas nuevas. Esa herramienta de comprobación se instaló solo fuera del repositorio; no se añade una dependencia ni un servicio al producto.

Antes de desplegar el código en Render/Neon:

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm build
```

Las variables DATABASE_URL/DIRECT_URL deben corresponder al entorno de destino. **No ejecutar el setup E2E sobre producción:** vacía todas las tablas. La revisión de migración en PGlite no equivale a ejecutarla en Neon; el despliegue y su comprobación final pertenecen al operador. Reanalizar la continuidad de libros existentes para usar reglas 1.1; sus evidencias anteriores quedan conservadas.

## Verificación

Los comandos, cifras y resultados finales se registran debajo tras completar las ejecuciones. El E2E nuevo usa las acciones reales, sesión real y compilación de producción. Se ejecuta con una base efímera, sin manuscritos ni credenciales de producción. PGlite es PostgreSQL embebido: su multiplexer no reproduce todas las condiciones de concurrencia de un servidor PostgreSQL nativo. Los conflictos optimistas tienen además pruebas unitarias dirigidas.

Fixture de rendimiento: `node --import tsx scripts/benchmark-linguistics.ts`, Node 24.22.1, diez párrafos por sección de 1.000 palabras, texto sintético repetitivo. La caché se mide inmediatamente después de su ejecución fría. RSS antes/después no es pico ni consumo exclusivo de una operación.

| Palabras | Estilo frío ms | Estilo en caché ms | Otras métricas ms | RSS después MiB |
| -------- | -------------- | ------------------ | ----------------- | --------------- |
| 10.000   | 53,7           | 3,3                | 91,5              | 115,7           |
| 50.000   | 121,3          | 10,5               | 229,4             | 174,0           |
| 100.000  | 257,9          | 22,2               | 404,2             | 244,9           |
| 200.000  | 419,9          | 44,1               | 497,2             | 260,8           |

Cero errores del motor. Todos los fixtures alcanzaron límites de repeticiones: no se afirma cobertura exhaustiva de 200.000 palabras. La pantalla limita a 120 secciones/16 MB/25.000 bloques; la repetición tiene límites adicionales de tokens y candidatos. La planificación muestra hasta 1.000 acontecimientos y avisa si se limita. No se garantizan esos tiempos en Render Free ni en dispositivos móviles.

## Límites de diseño y comprobación en producción

Las reglas lingüísticas y de continuidad son heurísticas explicables; no interpretan toda contradicción semántica, narradores no fiables o calendarios ficticios. Los cambios de filiación o apellido pueden ser deliberados. Se prioriza abstenerse ante ambigüedad y permitir confirmar, ignorar o marcar intencional. No se ofrece un corrector gramatical general ni una evaluación objetiva del mérito literario.

Los libros reales del autor no se adjuntaron para esta verificación. Tras aplicar la migración y desplegar: abrir un libro antiguo, comprobar fechas sin inventar, escoger estructura, asignar etapas, crear/reordenar dos acontecimientos, comprobar revisión desde otro navegador y repetir guardado/restauración/exportación sobre una copia del libro. El libro original no debe alterarse silenciosamente.

## Resultado del cierre

- `pnpm test`: **844 pruebas aprobadas en 110 archivos**.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build` y validación del esquema Prisma: aprobados. Un primer build encontró caché Turbopack inconsistente; una compilación desde caché limpia pasó y las siguientes compilaciones también.
- Playwright, `tests/e2e/laboratorio-editorial.spec.ts`: preparación autenticada y tres escenarios de producto. Cubren selección de capítulo/reglas sin alterar el manuscrito; decisiones y reglas leídas en un segundo contexto sin compartir localStorage; estructura/etapas tras recargar; creación y reordenación de acontecimientos; continuidad y resumen; recuperación real de red (incluido throttling), restauración y exportaciones descargadas PDF/EPUB/DOCX. El PDF descargado tiene el mismo número de páginas que la composición de vista previa del libro de prueba.
- En los archivos realmente descargados: EPUBCheck 5.3.0 sin errores ni advertencias; Mammoth abrió el DOCX y recuperó el texto; `pdftotext` recuperó el texto del PDF. Además, `pnpm validate:epub` y `pnpm validate:docx` pasaron con sus fixtures. Mammoth advierte sobre el estilo de cita `Quote` del fixture; no se cambió el motor de exportación para ocultarlo.
- Planificación real revisada visualmente a 390 px, sin desbordamiento horizontal. La entrega inicial ya incluía verificación de filtros/mapa y axe en un fixture; esto no constituye una certificación universal de accesibilidad.

Los tests detectaron y permitieron corregir la regresión de debounce que no habían cubierto las pruebas unitarias previas. También se unificaron las fechas de las dos vistas de cronología y se usa orden editorial para las apariciones y el orden narrativo. No se declara probado en todos los libros ni en producción.

## Auditoría final acotada

Valoración técnica subjetiva del código y la evidencia local, no una métrica automática ni una nota del texto literario. No se fija una nota objetivo ni se repiten auditorías para inflar puntuaciones.

| Categoría                   | Valoración / 100 | Evidencia y límite principal                                                                                              |
| --------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Arquitectura                | 88               | Motores y componentes existentes, una tabla aditiva para revisión y campos de planificación; sin servicios nuevos         |
| Calidad del código          | 86               | Tipos, lint, validación, funciones puras y pruebas de conflictos; la regresión encontrada demuestra la necesidad de E2E   |
| Corrección lingüística      | 74               | Segmentación, Unicode, rangos y reglas probadas; sin análisis gramatical/semántico general                                |
| Análisis narrativo          | 78               | Evidencia explícita versionada, abstención y cronología manual; cobertura deliberadamente limitada                        |
| Rendimiento                 | 82               | Fixtures 10k–200k y límites; faltan mediciones de carga y memoria en Render con libros reales                             |
| Seguridad                   | 87               | Origen/sesión/workspace/permisos y concurrencia probados; sin pentest externo ni revisión de la instalación de producción |
| Experiencia de usuario      | 84               | Navegación real, formularios, estados y móvil revisados; sin estudio con usuarios ni auditoría universal de accesibilidad |
| Integración editorial       | 86               | Revisión → fragmento versionado, continuidad, planificación, historial y exportación comprobados                          |
| Pruebas automatizadas       | 86               | 844 unitarias y E2E autenticado focal aprobado; no se afirma que toda la suite histórica E2E haya pasado                  |
| Preparación para producción | No evaluada      | Hace falta aplicar la migración en Neon, desplegar y comprobar la instancia real                                          |

## Comprobación del operador tras desplegar

1. Aplicar la migración con respaldo habitual, fusionar y desplegar; abrir un libro anterior y confirmar que capítulos, revisiones y acontecimientos permanecen.
2. Guardar estructura y etapas, crear dos acontecimientos con fechas/intervalos y reordenarlos. Verificar que el manuscrito y su orden no cambian.
3. Marcar intencional/resuelta, guardar reglas y abrir desde otro navegador con la misma cuenta. En otra cuenta, la revisión privada debe ser independiente.
4. Copiar una decisión local de la versión anterior y verificar que una decisión ya existente en servidor se conserva.
5. Reanalizar continuidad 1.1, comprobar evidencias y decisiones compartidas. Un diálogo o hipótesis sin confirmar no debe generar canon automáticamente.
6. Desconectar/reconectar mientras se escribe; comprobar confirmación en servidor y restaurar una revisión de una copia del libro.
7. Comparar vista previa y PDF, y abrir EPUB/DOCX con lectores habituales del autor. Los resultados locales son evidencia de regresión para el fixture, no garantía de identidad universal de cualquier documento.

## Cierre de integración: verificación de personajes

La entrega incorpora el verificador `personal-names-2.0` y la migración aditiva
`20261024200000_character_name_verification`, además de la migración del laboratorio.
Los detalles, límites y uso del script están en [Detección de personajes](./DETECCION_PERSONAJES.md).
Tras incorporar los cambios recientes de main, pasaron 929 pruebas en 120 archivos,
además de lint, typecheck y formato. El E2E de personajes verificó la propuesta entre
dos capítulos, la aceptación única y la presentación móvil. Los resultados anteriores
de 844 pruebas corresponden al estado previo a esa integración.

La repetición final de las cinco pruebas E2E pasó. Se comprobó también la descarga
real de PDF, EPUB y DOCX, y la igualdad de páginas entre vista previa y PDF en el
libro de prueba. El selector E2E del formato usa su título exacto, porque el texto
descriptivo del PDF de imprenta menciona también el PDF digital.

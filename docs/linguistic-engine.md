# Motor lingüístico local

## Propósito y ubicación

El núcleo vive en `packages/book-schema/src/linguistics/` y se exporta desde `@escribiendo/book-schema`. Esta ubicación reutiliza el contrato Tiptap ya compartido por web y los paquetes editoriales; no agrega dependencias externas ni una segunda representación del manuscrito. `apps/web/src/lib/editor/linguistic-rules.ts` adapta las reglas que ya usa el corrector local, y el botón «Revisar» de `SectionEditor` llama ahora al motor.

El motor es síncrono por sección, determinista y sin acceso a red, base de datos, DOM o almacenamiento. La única operación criptográfica del adaptador de navegador calcula localmente SHA-256 sobre el snapshot JSON para anclar/cachear el resultado.

## Entrada desde los modelos reales

`LinguisticSectionInput` refleja `BookSection` y, cuando está disponible, `SectionRevision`:

- `bookId`, `sectionId`, `sectionTitle` y `sectionType` identifican la sección real.
- `contentVersion` recibe la versión del contenido; `revisionId` es opcional cuando el análisis parte de un borrador sin revisión persistida.
- `contentHash` identifica exactamente el JSON analizado. Los consumidores que leen la base de datos deben pasar un digest del contenido de esa revisión. El adaptador del editor calcula SHA-256 del snapshot actual antes de analizar.
- `document` es el JSON Tiptap y se valida con `parseTiptapDocument`, con los límites de tamaño y nodos ya definidos por el proyecto.

El análisis de un libro recibe una lista de secciones, conserva su pertenencia a `bookId` y calcula resultados por sección. `sectionType` y el título siguen la jerarquía editorial real; los nodos `heading`, `paragraph` y `codeBlock` se segmentan como bloques internos.

## Texto, Unicode y rangos

El motor **no normaliza el texto fuente antes de generar posiciones**. Solo normaliza claves de comparación a NFC y minúsculas españolas, conservando tildes: `Cafe\u0301` y `Café` comparan igual, pero `si` y `sí` siguen siendo distintos. Los conteos usan el mismo tokenizador compartido (`countSpanishWords`), que reconoce marcas combinantes, palabras con guion y números decimales como un token. `countWords` de `book-schema` y el motor narrativo existente reutilizan esa implementación.

`EditorialFinding.startOffset/endOffset` declara explícitamente `coordinateSystem: "prosemirror-utf16"`. Son posiciones del documento ProseMirror, no offsets sobre una cadena NFC aplanada. El recorrido de JSON cuenta longitudes UTF-16, nodos vacíos, bloques, saltos duros y átomos. Las marcas de formato no alteran los rangos; texto contiguo con distintas marcas se combina. Las notas al pie se excluyen de las anclas porque su texto vive en un atributo del átomo y no en posiciones editables del documento; el agregado `words`, en cambio, delega en `countWordsInDocument` y conserva el conteo existente que sí incluye esas notas. Los hallazgos deben apuntar a texto editable de una sola secuencia.

La segmentación española maneja abreviaturas frecuentes, decimales, puntuación final, comillas de cierre, párrafos y etiquetas de diálogo con raya. Es una heurística editorial, no un analizador sintáctico ni una garantía sobre todos los usos ambiguos (por ejemplo, una abreviatura al final de oración o prosa experimental). Cada bloque mantiene offsets de la fuente original.

## Contrato de reglas y hallazgos

Cada `EditorialRule` declara `id`, `version`, categoría, severidad, confianza por defecto, `defaultEnabled` y una función `analyze(context)` pura. Una regla devuelve rangos, mensaje, explicación y, opcionalmente, texto observado y sugerencias. El motor:

1. ejecuta reglas separadas en orden estable;
2. aplica `LinguisticRulePreferences.enabledByRuleId`, respetando el default de cada regla cuando no hay override;
3. valida los offsets contra el tamaño real del documento y la confianza contra `[0, 1]`;
4. captura el fallo de una regla sin cancelar las otras;
5. genera un `EditorialFinding` con libro, sección, revisión/versión, hash, rango, regla, severidad, confianza y estado;
6. usa `open`, salvo que el consumidor pase un estado previo para el mismo ID versionado (`resolved`, `ignored` o `intentional`).

Los IDs incluyen regla, libro, sección, revisión o versión, hash y rango. Por eso un estado solo reaparece para el mismo snapshot/ancla; no se transfiere silenciosamente a texto cambiado. El esquema es un contrato del motor, no una nueva tabla Prisma: en el editor actual «Ignorar» retiene `ignored` en memoria mientras el snapshot siga igual; «Aplicar» cambia el texto y elimina esa propuesta visible. No se guarda historial `resolved`/`intentional` ni hay persistencia multi-dispositivo de hallazgos o migración de estados.

`LOCAL_PROOFREADER_RULES` no reimplementa el corrector: adapta sus grupos existentes (palabras repetidas, espacios, puntuación, mayúsculas y erratas frecuentes) como reglas independientes. El panel de Preferencias guarda los overrides en el `localStorage` existente, únicamente en el navegador.

## Incrementalidad y planificación

`LinguisticAnalysisEngine` mantiene una caché en memoria por instancia y sección. La clave incluye libro, sección, revisión, versión, hash, título/tipo y firma de reglas/preferencias. Si cambia el hash/versionado o una regla, el resultado se recalcula; al llegar una versión nueva se retira el resultado anterior de esa sección. La caché predeterminada es de 500 secciones y puede limpiarse o invalidarse explícitamente. No almacena el documento fuente.

`analyzeBookInBatches` permite elegir el tamaño del lote (por defecto, cinco secciones), reportar progreso e inyectar una cesión de control. La ruta del editor analiza ahora solo la sección abierta y limita el panel a 100 propuestas.

### Decisión sobre Web Workers

No se crea un Worker ahora: las reglas actuales son locales, pequeñas y ya operan sobre una sola sección abierta; añadir protocolo, bundle y sincronización de preferencias sumaría complejidad sin evidencia de bloqueo. Como comprobación inicial se analizó un fixture sintético de **50 secciones y 117.000 palabras**, con las cinco familias actuales: **183,7 ms en total (3,67 ms/sección)** en el sandbox, con JSON de aproximadamente 13,4 KB por sección. Es una referencia de Node local, no un benchmark de navegador ni de un manuscrito máximo. La ruta del editor analiza solo la sección abierta y limita el panel a 100 propuestas, por lo que se pospone el Worker; antes de habilitar análisis de libros completos se debe medir en dispositivos modestos y moverlo a un Worker si aparecen tareas largas. Para ese uso, `analyzeBookInBatches` permite ceder control entre lotes. El contrato de entrada es serializable y no depende del DOM; las funciones de regla deberán importarse dentro del bundle del Worker, ya que los closures no se transfieren por `postMessage`.

## Verificación y límites

Cobertura específica:

- abreviaturas, decimales, diálogo, NFC/NFD, tildes y rangos UTF-16;
- nodos con marcas, caracteres astrales, párrafos vacíos y notas al pie;
- ejecución independiente de reglas, preferencias, errores, límites de rango, versión/hash, caché, estados previos y procesamiento por lotes;
- integración del motor con las reglas locales, cálculo SHA-256 y estado ignorado.

Comandos de validación:

```bash
pnpm exec vitest run packages/book-schema/src/linguistics/text.test.ts packages/book-schema/src/linguistics/engine.test.ts packages/book-schema/src/tiptap.test.ts apps/web/src/lib/editor/linguistic-rules.test.ts apps/web/src/lib/editor/local-proofreader.test.ts apps/web/src/lib/story/engine/engine.test.ts apps/web/src/components/writing/writing-preferences.test.ts
pnpm --filter @escribiendo/book-schema typecheck
pnpm --filter @escribiendo/web typecheck
```

El motor proporciona infraestructura determinista para herramientas posteriores, no un corrector gramatical general. Las reglas heurísticas pueden producir falsos positivos y nunca reescriben el documento por sí solas; una propuesta requiere aceptación explícita de quien escribe.

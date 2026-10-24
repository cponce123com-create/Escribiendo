# Fase 3 — Continuidad narrativa local

## Alcance de esta entrega

El detector es determinista y se ejecuta dentro de Escribiendo. No llama a modelos ni APIs externas y nunca modifica el manuscrito. Prioriza abstenerse antes que convertir una coincidencia ambigua en contradicción.

La primera versión extrae afirmaciones explícitas asociadas con nombres únicos de la biblia del libro:

- Color de ojos/iris y cabello, a partir de un vocabulario limitado de colores.
- Edad numérica expresada con verbos explícitos o en aposición con coma.
- Año de nacimiento y año narrativo explícitos.
- Posibles grafías cercanas a personajes y lugares ya registrados. Se requiere una diferencia ortográfica de una edición para nombres suficientemente largos, o solo una diferencia diacrítica; si más de una entidad coincide, el motor se abstiene. No fusiona entidades.

La comparación señala colores incompatibles para un mismo atributo; edades distintas atribuidas al mismo año; y edades incompatibles con un año de nacimiento, considerando que el cumpleaños puede no haber ocurrido todavía. Las edades de años distintos no se marcan como contradicción por el mero hecho de diferir.

Cada extracto conserva la cita literal, capítulo, versión del documento, SHA-256 del contenido, versión de las reglas y offsets absolutos UTF-16 del documento Tiptap/ProseMirror. El editor recibe capítulo, inicio, fin y versión; verifica que la versión y el rango sigan vigentes antes de seleccionar el texto.

## Evidencia y decisiones

El extractor etiqueta narración, diálogo, recuerdo e hipótesis. Una afirmación en diálogo/recuerdo/hipótesis no alimenta el canon ni genera una contradicción automática hasta que el autor la confirma. El estado de revisión del hecho queda persistido por separado del texto fuente. El autor puede confirmar/descartar una afirmación y guardar un valor canónico propio sin sobrescribir la cita ni la detección original.

Las alertas permiten guardar «confirmar contradicción», «texto corregido manualmente», «ignorar», «intencional» y «registro actualizado». Las decisiones se guardan asociadas a las pruebas concretas; cada cambio genera un evento append-only y el historial es consultable. Las fechas del historial se muestran en `America/Lima`. Si una sección cambia, su snapshot anterior se conserva, pero deja de participar en el análisis actual hasta reanalizar la nueva versión. Se guarda también una fila de análisis por hash aunque no se encuentre ningún hecho.

La pantalla vive en `/books/[bookId]/continuity`, enlazada desde el dashboard editorial. El selector de capítulos está a la izquierda y se puede plegar.

## Límites actuales

Esta entrega no extrae todavía relaciones familiares, cambios de apellido, lugares no presentes en la biblia, intervalos de fechas completos ni orden de acontecimientos narrativos. Tampoco interpreta edades escritas con palabras, fechas ambiguas, sujetos elípticos, narradores no fiables, cambios de identidad o transformaciones sobrenaturales. Los cambios detectados son «posibles» y requieren criterio editorial.

El año narrativo se lee del propio texto y no depende de zona horaria. Las fechas locales de interfaz de la plataforma deben seguir usando `America/Lima`.

## Verificación y despliegue

Pruebas: `pnpm exec vitest run packages/book-schema/src/linguistics`; tipos: `pnpm --filter @escribiendo/book-schema typecheck` y `pnpm exec tsc --noEmit -p apps/web/tsconfig.json`.

La migración nueva está en `packages/database/prisma/migrations/20261024101800_narrative_continuity/`. Validar y aplicar en el entorno configurado con `pnpm --filter @escribiendo/database db:validate` y `pnpm --filter @escribiendo/database db:migrate`. La migración no se aplica automáticamente en una instancia remota.

# Auditoría de referencia (línea base)

Fecha: 20 de octubre de 2026.
Rama: `audit/optimization-95`.
Base: `babac78` (Fase 5, ya subida a `main`).

> **Documento histórico.** Es la fotografía de la línea base, con las cifras y
> las carencias de aquel momento. No describe el software actual: el estado
> vigente está en [AUDIT_BASELINE_95.md](AUDIT_BASELINE_95.md) y en
> [AUDIT_FINAL.md](AUDIT_FINAL.md), y las correcciones están en
> [AUDIT_CORRECTIONS.md](AUDIT_CORRECTIONS.md).

Esta auditoría **no** acepta las puntuaciones de referencia como ciertas: cada
punto se ha comprobado contra el código. La columna «Referencia» recoge la
evaluación estática previa; la columna «Comprobado» es el resultado de leer el
código y ejecutar las pruebas.

## Puntuaciones

| Área                         | Referencia | Comprobado | Motivo de la comprobación                                                                                                             |
| ---------------------------- | ---------: | ---------: | ------------------------------------------------------------------------------------------------------------------------------------- |
| Arquitectura                 |         89 |         88 | Capas bien separadas, pero el motor de exportación y el de maquetación no comparten modelo de contenido.                              |
| Organización del repositorio |         90 |         92 | Paquetes con responsabilidad única; la Fase 5 añadió `export-engine` y `templates` con código real.                                   |
| Prisma ORM                   |         86 |         87 | Esquema con índices y restricciones sólidas; faltan índices compuestos en las consultas de auditoría.                                 |
| Autenticación                |         82 |         84 | Argon2id, sesiones opacas, bloqueo de cuenta; sin verificación en dos pasos ni aviso de sesiones nuevas.                              |
| Seguridad                    |         77 |         80 | CSP con nonce, comprobación de origen, aislamiento por espacio de trabajo; la descarga firmada llegó tarde.                           |
| Biblioteca                   |         87 |         90 | Búsqueda, filtros, árbol de secciones y metadatos validados.                                                                          |
| Editor                       |         70 |         78 | Tiptap con extensiones controladas; sin imágenes ni notas al pie, que es lo esperable en esta fase.                                   |
| **Guardado y recuperación**  |     **53** |     **48** | **Autoguardado de 60 s, sin persistencia local y con un `setDirty(false)` que marcaba como guardado lo escrito durante la petición.** |
| Historial                    |         85 |         88 | Revisiones inmutables con trigger; la numeración se ha vuelto confusa al distinguir contenido y revisión.                             |
| Revisión editorial           |         85 |         88 | Comentarios, resolución y aprobación condicionada a cero comentarios abiertos.                                                        |
| Maquetación                  |         67 |         72 | Geometría y paginación reales, pero el modelo de contenido no conserva formato en línea.                                              |
| PDF                          |         48 |         55 | PDF propio y válido, con fuentes estándar; sin Unicode completo ni métricas reales de fuente.                                         |
| EPUB                         |         75 |         78 | EPUB 3 con la estructura correcta; sin portada, sin imágenes y sin validación con EPUBCheck.                                          |
| DOCX                         |         70 |         72 | Paquete OOXML válido; sin imágenes, notas ni numeración de páginas.                                                                   |
| Exportaciones                |         59 |         72 | Cola idempotente sin worker, descarga firmada y metadatos; sin límites de tamaño ni de duración.                                      |
| UX/UI                        |         82 |         85 | Identidad visual coherente; el estado de guardado era ambiguo («todo guardado» sin confirmación real).                                |
| Render Free                  |         71 |         80 | Sin procesos permanentes; la exportación generaba el archivo entero en la memoria de la petición.                                     |
| Pruebas                      |         83 |         86 | 187 unitarias y 56 E2E; no había pruebas de resiliencia ni de pérdida de datos.                                                       |
| Documentación                |         91 |         93 | ROADMAP, arquitectura, base de datos, seguridad, pruebas y despliegue al día.                                                         |
| Escalabilidad                |         69 |         72 | Consultas bien acotadas por espacio de trabajo; la exportación y la vista previa no tienen límites.                                   |

**Media ponderada de referencia: 75,7.** La media comprobada es 77,3: el
proyecto está mejor de lo que sugería la referencia, pero el área de guardado
y recuperación estaba **muy por debajo** de la media, y es la que más afecta a
la promesa del producto.

## Hallazgos del área crítica (guardado y recuperación)

| #   | Archivo                               | Función             | Problema                                                                                                  | Causa raíz                                                             | Severidad | Impacto                                                                        | Solución                                                                                           | Prueba necesaria                                                   |
| --- | ------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | `components/books/section-editor.tsx` | `persist`           | El autoguardado esperaba 60 s: hasta un minuto de trabajo se perdía al cerrar la pestaña.                 | Temporizador de intervalo en lugar de rebote tras la última pulsación. | Crítica   | Pérdida silenciosa de texto.                                                   | Rebote corto (700 ms) con persistencia local inmediata.                                            | E2E: escribir y comprobar el estado local sin esperar al servidor. |
| 2   | `components/books/section-editor.tsx` | —                   | No existía ninguna copia local: sin red, sin servidor o con el equipo suspendido, el texto no sobrevivía. | El editor solo sabía hablar con el servidor.                           | Crítica   | Todo el trabajo de la sesión, hasta 60 s, se perdía.                           | Borradores locales en IndexedDB, con recuperación al abrir la sección.                             | E2E: servidor caído, recargar y recuperar el texto.                |
| 3   | `components/books/section-editor.tsx` | `persist`           | `setDirty(false)` tras la respuesta marcaba como guardado el texto escrito **durante** la petición.       | No se comparaba la versión local con la enviada.                       | Crítica   | Pérdida silenciosa: la interfaz decía «todo guardado» y el texto no lo estaba. | Número de versión local: si cambia durante el envío, el estado sigue siendo «pendiente».           | E2E: escribir durante una petición lenta y comprobar el estado.    |
| 4   | `components/books/section-editor.tsx` | `persist`           | Dos respuestas fuera de orden podían dejar la versión del servidor desfasada.                             | No había control de orden de las peticiones.                           | Alta      | El editorCreation puede pisar el texto de otra persona.                        | Contador de petición: se ignoran las respuestas que no son la última.                              | E2E: dos pestañas y peticiones solapadas.                          |
| 5   | `lib/books/actions.ts`                | `saveSectionAction` | Ante un conflicto solo se informaba: la persona solo podía recargar, perdiendo su texto.                  | Faltaba devolver la versión del servidor para poder comparar.          | Alta      | El conflicto se resolvía perdiendo trabajo.                                    | El servidor devuelve su versión; la interfaz ofrece conservar la propia o adoptar la del servidor. | E2E: dos pestañas, conflicto y resolución por las dos vías.        |
| 6   | `components/books/section-editor.tsx` | —                   | Sin detección de conexión: se intentaba guardar y se perdía el error real.                                | No se escuchaban los eventos `online`/`offline`.                       | Media     | Mensajes engañosos y reintentos a ciegas.                                      | Estado «sin conexión» y reintento con espera exponencial.                                          | E2E: modo sin conexión.                                            |
| 7   | `lib/books/actions.ts`                | `saveSectionAction` | Un autoguardado pospuesto por el servidor se respondía como éxito, y el editor lo tomaba por guardado.    | La respuesta de «pospuesto» no se distinguía de un guardado real.      | Alta      | La interfaz confirmaba un guardado que no se había hecho.                      | La respuesta lleva `throttled`; el editor mantiene el texto pendiente.                             | Unitarias de la máquina de estados.                                |
| 8   | `components/books/section-editor.tsx` | —                   | `localStorage` no se usaba para el manuscrito, pero tampoco había alternativa: no había copia local.      | El almacenamiento local no estaba contemplado.                         | Alta      | Sin redeterminismo del trabajo.                                                | IndexedDB con respaldo en memoria.                                                                 | Unitarias del almacén de borradores.                               |

## Hallazgos de otras áreas (pendientes de lotes posteriores)

| #   | Área          | Archivo                                  | Problema                                                                                                     | Severidad | Lote |
| --- | ------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- | ---- |
| 9   | PDF           | `packages/export-engine/src/pdf.ts`      | Los caracteres fuera de Latin-1 se sustituyen por `?`; no hay Unicode completo ni métricas reales de fuente. | Alta      | 3    |
| 10  | Maquetación   | `apps/web/src/lib/layout/blocks.ts`      | La maquetación aplana el documento: se pierden imágenes, separadores y formato en línea.                     | Alta      | 2    |
| 11  | Exportaciones | `apps/web/src/lib/export/generate.ts`    | El archivo se genera entero en la memoria de la petición, sin límite de tamaño ni de duración.               | Media     | 5    |
| 12  | Equipo        | `packages/database/prisma/schema.prisma` | No hay modelo de invitación ni campos de asignación: la Fase 6 necesita migración.                           | Media     | 6    |

## Cómo se ha medido

- **Código**: lectura directa de los archivos citados, con el esquema de
  Prisma y las migraciones como fuente de verdad.
- **Pruebas**: `pnpm test` (187 unitarias), `pnpm test:e2e` (56 de extremo a
  extremo contra la compilación de producción) y `pnpm typecheck`, `pnpm lint` y
  `pnpm build` en verde.
- **Lo que no se ha medido**: el comportamiento en el despliegue real de Render
  no se ha podido verificar desde la máquina de trabajo: la salida de red está
  filtrada y `https://escribiendo-6yep.onrender.com` no responde. Ninguna
  puntuación de este documento presume ese extremo.

## Estado posterior

Las cifras de 187 pruebas unitarias y 56 E2E son la fotografía histórica de la
línea base. El estado vigente de la rama `improvement/escribiendo-95`, con
imágenes, notas al pie, fuentes TTF incrustadas y sus límites, está en
[AUDIT_BASELINE_95.md](AUDIT_BASELINE_95.md). La última ejecución registrada es
de **333 pruebas unitarias en 35 archivos y 81 pruebas E2E en Chromium**. La
puntuación de 95 no se ha declarado alcanzada.

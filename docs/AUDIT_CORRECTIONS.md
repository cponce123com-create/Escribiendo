# Correcciones de la auditoría

Registro cronológico de lo que se ha corregido, con su evidencia. Cada
corrección va acompañada de las pruebas que la sostienen.

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

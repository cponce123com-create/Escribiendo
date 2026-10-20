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

| Archivo                                        | Qué hace                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/lib/editor/drafts.ts`            | Almacén de borradores en **IndexedDB** (no `localStorage`), con respaldo en memoria cuando el navegador no lo ofrece. Clave por cuenta, libro y sección. |
| `apps/web/src/lib/editor/sync.ts`              | Máquina de estados pura: `idle`, `local`, `syncing`, `synced`, `offline`, `error`, `conflict`. Espera de reintento exponencial con dispersión. |
| `apps/web/src/lib/editor/sync.test.ts`         | 20 pruebas unitarias de las transiciones, del reintento y de las invariantes.                                                              |
| `apps/web/src/lib/editor/drafts.test.ts`       | 7 pruebas unitarias del almacén, incluida la caída a memoria sin IndexedDB.                                                               |
| `apps/web/src/components/books/section-editor.tsx` | Reescrito: rebote de 700 ms al equipo, envío al servidor a los 3 s, detección de conexión, reintentos, control de orden de respuestas y recuperación al abrir. |
| `apps/web/src/components/books/section-conflict.tsx` | Panel de conflicto con **comparación por palabras** (reutiliza el diff de la Fase 3) y dos salidas: conservar la versión local o adoptar la del servidor. |
| `apps/web/src/lib/books/actions.ts`            | `saveSectionAction` devuelve la versión del servidor en caso de conflicto, distingue un guardado pospuesto (`throttled`) y acepta un guardado forzado y explícito (`force`). |
| `apps/web/src/app/(app)/books/[bookId]/sections/[sectionId]/page.tsx` | Pasa el libro y la cuenta al editor, que los necesita para identificar el borrador.                            |

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

| Suite                              | Resultado                                                     |
| ---------------------------------- | ------------------------------------------------------------- |
| `pnpm test` (unitarias)           | 216 en verde (24 archivos), 29 nuevas de este lote            |
| `pnpm test:e2e` (extremo a extremo) | 64 en verde contra la compilación de producción, 9 nuevas de este lote |
| `pnpm typecheck`                   | Sin errores                                                    |
| `pnpm lint`                        | Sin errores                                                    |
| `pnpm build`                       | Correcto                                                       |

Las nueve pruebas nuevas están en `tests/e2e/manuscrito.spec.ts` y cubren:
guardado local inmediato, escritura sin conexión, servidor caído con
recuperación al recargar, escritura durante una petición en curso, dos
pestañas con conflicto, resolución del conflicto conservando la versión local
y persistencia tras recargar.

El detalle de cada escenario está en [RECOVERY_TESTS.md](RECOVERY_TESTS.md).

### Falso positivo detectado y corregido durante el lote

El `beforeunload` solo avisa; no salva. En un primer momento se/confundió el
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

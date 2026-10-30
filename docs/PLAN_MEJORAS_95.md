# Plan de mejoras hacia 95/100

Base y rama: ver `AUDITORIA_95.md`. Se priorizan pérdidas y duplicaciones de manuscritos antes de aspectos cosméticos. Cada fase requiere diagnóstico, cambio pequeño, prueba, revisión de seguridad, commit y medición. `NC` significa que falta evidencia para puntuar; no equivale a cero ni a aprobado.

1. **Integridad de importación (avance verificable):** IMP-01 e IMP-04 corregidos con clave única y extracción desde el nodo fuente. Se probaron reenvíos, colisión simulada, modificación del plan y un DOCX sintético de 200 000 palabras; se muestran evidencias de detección. Siguen pendientes la concurrencia en PostgreSQL nativo, corpus real complejo, preservación de imágenes y OCR de PDF. Evitar atribuir precisión estadística a la puntuación heurística.
2. **Guardado/editor (avance):** renombrado repetido corregido y verificado en Chromium. La suite también ensaya desconexión, CAS y notas; falta comparar letra capital en fuentes y estilos distintos y medir recuperación en condiciones reales.
3. **Personajes y laboratorio:** medir precisión con nombres compuestos/homónimos y contradicciones explícitas frente a hipótesis; preservar decisiones del autor.
4. **Composición/índice/exportación:** unificar pruebas de vista previa/PDF y folios estabilizados con títulos largos; verificar fuentes, dimensiones, notas e imágenes. EPUBCheck y lectura DOCX separadas de la igualdad visual estricta del PDF.
5. **Preliminares, portadas y UX:** completar campos faltantes, avisos de desbordamiento, DPI efectivo y recorridos accesibles con teclado/móvil.
6. **Seguridad y rendimiento:** ensayar permisos entre espacios, carga de 200 000 palabras y consumo pico en una base/servicio aislados. Nunca usar datos o infraestructura de producción para pruebas.
7. **Cierre:** repetir lint, typecheck, test, build, suites E2E, validadores y auditoría por criterio. Registrar cifras reales y tareas bloqueadas. No asignar 95 por aspiración.

Bloqueo operativo actual: el entorno no ofrece PostgreSQL nativo ni Docker. Las 16 migraciones se aplicaron en PGlite desechable y la E2E corre sobre ese servidor local; el comportamiento de bloqueo y concurrencia con PostgreSQL nativo requiere una instancia desechable independiente. Esto no justifica tocar Neon de producción.

## Ejecución del plan actualizado — 29 de octubre de 2026

Referencia: [revisión por módulos](audits/revision-2026-10-29.md). La rama `fix/export-reservas-20261029` parte de main `92c5ba3`; no incluye ni presupone integrado el PR 83. Conserva el informe de auditoría y su referencia en el índice.

| Fase | Trabajo                                                     | Estado de esta intervención                                                                                                                                          |
| ---- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Exclusión de exportaciones largas y propiedad de la reserva | Implementada; siete regresiones dedicadas y 1145 pruebas globales aprobadas. Formato, lint, typecheck y build locales aprobados; CI por verificar antes de integrar. |
| 2    | Presupuesto de imágenes y memoria del servidor completo     | Pendiente. La medición aislada del PR 83 no incluye Next/Prisma/red/normalización. Este entorno no tiene Docker; no se utilizará Neon de producción como sustituto.  |
| 3    | Paginación estable y revisión del dashboard                 | Pendiente; R03 del informe.                                                                                                                                          |
| 4    | Corpus independiente de importación y conservación          | Pendiente; mantener las regresiones existentes y las advertencias sobre imágenes/OCR.                                                                                |
| 5    | Evaluación de personajes y continuidad                      | Pendiente; medir con datos separados de las reglas de desarrollo.                                                                                                    |
| 6    | Matriz visual y reproducción de exportaciones               | Pendiente; R06/R08, sin prometer igualdad de bytes entre versiones del motor.                                                                                        |
| 7    | Safari/iOS, teclado virtual y accesibilidad                 | Pendiente de dispositivo real además de ampliar automatización.                                                                                                      |
| 8    | Backup/restore, diagnóstico Render y auditoría final        | Pendiente; requiere entorno aislado y logs del incidente para las comprobaciones correspondientes.                                                                   |

### Fase 1: comportamiento corregido y límites

La reserva ahora devuelve una identidad única. Generación y descarga la conservan y la liberan en `finally` solo si siguen siendo sus propietarias. Se elimina la caducidad por reloj: diez minutos transcurridos no prueban que el trabajo anterior haya terminado. Una liberación duplicada o tardía no afecta a una reserva posterior. La exclusión se conserva al volver a cargar el módulo dentro del mismo proceso.

Regresiones dedicadas: trabajo activo durante 24 horas simuladas, liberación ajena/tardía, recarga del módulo, generación y descarga compitiendo entre sí, y recuperación después de errores en ambos recorridos. Las pruebas de integración usan persistencia y generación simuladas, con la reserva real; no acceden a producción.

Una tarea que nunca termina mantiene el hueco ocupado; se requiere terminar/reiniciar su proceso para cancelar realmente ese trabajo. No se libera por un temporizador mientras pueda seguir consumiendo recursos. El límite sigue siendo por proceso, sin cola distribuida. La prevención de solapamientos no garantiza por sí sola que una exportación individual quepa en memoria.

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

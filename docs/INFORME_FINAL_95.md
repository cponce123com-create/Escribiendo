# Informe de avance hacia ESCRIBIENDO 95/100

**Estado: parcial; 95/100 no certificado.** Fecha: 26 de octubre de 2026. Este informe debe actualizarse tras cada fase estable. La auditoría inicial, las rutas y la matriz de módulos están en `AUDITORIA_95.md`; el plan pendiente en `PLAN_MEJORAS_95.md` y la evidencia ejecutada en `RESULTADOS_PRUEBAS_95.md`.

## Puntuación con el alcance realmente revisado

| Módulo            |           Inicial |            Actual | Cambio | Evidencia y límite                                                                                                                                                 |
| ----------------- | ----------------: | ----------------: | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Importador        | 63/100 preliminar | 72/100 preliminar |     +9 | F23/30, R14/20, C11/15, T10/15, U7/10, S7/10. Las pruebas unitarias y SQL de IMP-01 e IMP-04 pasan; falta PostgreSQL nativo y corpus real para otorgar más puntos. |
| Los demás módulos |                NC |                NC |      — | No se asigna una puntuación numérica por presencia de archivos o pruebas únicamente. Ver inventario y riesgo por módulo en la auditoría.                           |
| Global ponderado  |                NC |                NC |      — | Falta evaluación dinámica y evidencia suficiente para ponderar los módulos críticos. La meta 95 sigue abierta.                                                     |

## Cambios implementados

- Renombrado repetido de capítulos: la clave React ahora usa el ID estable y una respuesta optimista antigua cede ante el título confirmado por el servidor. La regresión E2E que lo detectó pasó en Chromium tras la nueva compilación.
- Biblioteca: la opacidad de las tarjetas degradaba el contraste de metadatos; se retiró y se añadió foco visible. La comprobación Axe del editor y la ficha pasó tras recompilar.
- PDF: el índice automático y el cuerpo muestran correctamente el mismo título. La prueba E2E cuenta ambas apariciones y una prueba unitaria vigila que el cuerpo componga un solo bloque de título.
- Reenvíos de una confirmación de importación ligados a UUID y hash del plan exacto; índice único por espacio de trabajo. El reintento devuelve el libro original y no recrea secciones. Una revisión alterada o un libro ya eliminado exige una nueva revisión.
- División de secciones extensas basada en el nodo fuente, para impedir duplicación cuando se omiten párrafos vacíos del resumen.
- Evidencias de detección de capítulos (estilo, separador, numeración y rótulo) visibles en la revisión; advertencia de límites de confianza débil. La puntuación no es una probabilidad calibrada.
- Regresiones de DOCX, EPUB y PDF con fixtures reproducibles y medición local de 200 000 palabras.

Archivos principales: `apps/web/src/lib/books/import-{actions,detection,types}.ts`, `importer.ts`, `components/books/book-import-form.tsx`, sus pruebas unitarias, `tests/e2e/importacion.spec.ts`, `packages/database/prisma/schema.prisma`, `packages/database/src/expected-schema.ts`, migración `20261026190000_import_idempotency` y documentación `docs/*95.md` / `IMPORTACION_LIBROS.md`.

## Verificación y trazabilidad

`pnpm build`, `pnpm typecheck`, `pnpm lint` y `pnpm test` (1058/1058) pasaron. La suite E2E de importación pasó 3/3; la de exportación, manuscrito y seguridad pasó 39/39 en Chromium con una base PGlite aislada. EPUBCheck informó cero errores y avisos; Mammoth extrajo el texto DOCX, con advertencia sobre el estilo «Cita». La vista previa y el PDF sintéticos coincidieron en 11 páginas. Los tiempos observados en fixtures locales fueron 49 ms (DOCX 10 000 palabras) y 877 ms (DOCX 200 000 palabras); falta una línea base anterior comparable, por lo que no se calcula mejora porcentual.

Commits: `c1fb0e9` (integridad del importador) y `a72623a` (editor, contraste y regresión de exportación). El commit de los informes y el estado de push se registran al cerrar la rama de trabajo.

## Pendientes y riesgo

Las fases de editor, personajes, laboratorio, maquetación, índice, preliminares, exportación visual, portadas, seguridad transversal y rendimiento en Render requieren medición adicional. No se ha aplicado la nueva migración a Neon ni se ha desplegado. Antes de desplegar se debe integrar la rama, aplicar `pnpm db:migrate` con `DIRECT_URL` válida y ejecutar la verificación operativa. El SQL pasó en PGlite; PostgreSQL nativo con dos confirmaciones concurrentes sigue pendiente. Los datos reales de libros existentes no se modificaron.

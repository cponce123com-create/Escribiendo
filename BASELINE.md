# BASELINE — ESCRIBIENDO v10

**Fecha:** 24 de octubre de 2026
**Rama:** `fix/auditoria-editorial-nucleo-tipografico`
**Commit de partida:** `ad53444` (la Fase 1 de este informe queda sin commit al redactar esta línea base).
**Entorno:** Node `v24.20.0`, pnpm `12.14.0`, Linux. El proyecto declara `node >=24.11 <25` y `pnpm@12.14.0`.

## Puertas de calidad ejecutadas

| Comando                       | Resultado       | Duración           | Observaciones                                                                                                                                                                                                                                                        |
| ----------------------------- | --------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                   | ✅              | 34 s               | `eslint .` sin errores.                                                                                                                                                                                                                                              |
| `pnpm typecheck`              | ✅              | 27 s               | Paquetes y `tsconfig.json` raíz.                                                                                                                                                                                                                                     |
| `pnpm test`                   | ✅              | 40 s               | Línea base: **876 pruebas / 113 archivos**. Tras la Fase 1: **888 / 113**.                                                                                                                                                                                           |
| `pnpm db:validate`            | ✅              | 7 s                | El esquema Prisma es válido; no necesita conexión.                                                                                                                                                                                                                   |
| `pnpm format:check`           | ⚠️              | 23 s               | Falla solo por `Escribiendo_v10_prompt_maestro.md` (archivo de entrada sin formatear). El resto del repositorio pasa.                                                                                                                                                |
| `pnpm build`                  | ✅              | 17 s (en caliente) | Con `NODE_ENV=production`. Con el `NODE_ENV=development` heredado del shell, el prerender de `/_global-error` falla con `Cannot read properties of null (reading 'useContext')`; no es un defecto del código de la aplicación, sino del entorno que fija `NODE_ENV`. |
| `pnpm test:e2e`               | ⛔ No ejecutado | —                  | Requiere PostgreSQL y servidor; el puerto 5432 está cerrado.                                                                                                                                                                                                         |
| `pnpm validate:pdf/docx/epub` | ⛔ No ejecutado | —                  | Requiere archivos generados y, para DOCX, LibreOffice (no instalado).                                                                                                                                                                                                |
| `pnpm verify:preview-pdf`     | ⛔ No ejecutado | —                  | Requiere base de datos y un libro real.                                                                                                                                                                                                                              |

## Mapa de flujos reales

- **Editor → bloques:** `apps/web/src/lib/layout/blocks.ts` (`sectionToBlocks`, `bookToBlocks`) con `inline.ts` para marcas y saltos.
- **Paginación:** `packages/editorial-engine/src/pagination.ts` + `measure.ts`; una sola geometría para vista previa y PDF.
- **Vista previa:** `apps/web/src/lib/layout/preview.ts` → `PaginatedPreview`.
- **Materias:** `packages/templates/src/legal-page.ts`, `matter-content.ts` → `apps/web/src/lib/editorial/matter-blocks.ts` → `composeMatter` en `book-matter.ts`.
- **Índice:** `composeMatter` + `toc-stabilization.ts`; folios medidos en `pagination.ts`.
- **Exportación:** `apps/web/src/lib/export/jobs.ts` (instantánea) → `generate.ts` → `pdf-layout.ts` / `docx.ts` / `epub.ts`.
- **Importación:** `apps/web/src/lib/import/*` (`importer.ts`, `import-detection.ts`, `import-word.ts`, `import-pdf-layout.ts`) y `import-actions.ts`.
- **Persistencia editorial:** `book_editions.settings` (legal, TOC, dedicatoria, inicial) sin migración de base de datos.

## Fixtures y referencias

- Existentes: helpers de `pagination.test.ts`, `blocks.test.ts`, `matter-blocks.test.ts`, `preview.test.ts`, `reference-pages.golden.test.ts` y `toc-stabilization.test.ts`.
- Las tres capturas de _El Silencio de la Auvernia_ **no están en el repositorio**; no se han creado fixtures de imagen para no publicar datos personales. La referencia se reproduce con geometría y texto sintético.

## Limitaciones de esta línea base

- No hay PostgreSQL local ni Neon de producción accesible desde este entorno.
- No hay LibreOffice para validar DOCX.
- No se han ejecutado exportaciones reales, E2E, benchmarks de memoria/CPU ni diff visual de píxeles.
- Las cifras de duración son de esta máquina y sirven como referencia relativa, no como promesa de rendimiento en Render Free.

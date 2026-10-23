# Auditoría editorial — Fase 0

**Fecha:** 2026-10-23
**Alcance:** módulo de preliminares, índices, derechos y plantillas profesionales.
**Estado:** auditoría del repositorio antes de introducir cambios.

---

## 1. Arquitectura existente

Monorepo pnpm con separación estricta entre dominio puro y aplicación:

| Paquete                     | Responsabilidad                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/editorial-engine` | Medición tipográfica, saltos de línea, paginación, validación de geometría. Sin base de datos. |
| `packages/export-engine`    | PDF, EPUB 3, DOCX y ZIP. Sin base de datos.                                                    |
| `packages/book-schema`      | Esquema Tiptap, metadatos básicos y límites de documento.                                      |
| `packages/templates`        | Configuración tipográfica de plantillas y catálogo de sistema.                                 |
| `packages/database`         | Cliente Prisma, esquema y comprobación de columnas.                                            |
| `apps/web`                  | Next.js: rutas, Server Actions, composición y UI.                                              |
| `workers/export-worker`     | Procesamiento asíncrono de exportaciones.                                                      |

## 2. Flujo de composición actual

```
BookSection[] (orden canónico: editorialOrder)
        │
        ▼
bookToBlocks()  ──►  LayoutBlock[]
        │
        ▼
paginate()  ──►  LaidOutPage[]  ──►  vista previa
        │                    └────►  toPdfPages() ──► buildPdf()
        │
        └──► EPUB / DOCX usan ExportSection (reflowable)
```

Hallazgos relevantes:

- **Orden de lectura único:** `apps/web/src/lib/books/reading-order.ts` (`editorialOrder`) se usa en vista previa, exportación y árbol del manuscrito. Es el punto canónico que debe respetar el índice.
- **Vista previa y PDF comparten paginación:** ambas llaman a `paginate()` con la misma geometría y tipografía. Cualquier cambio de índice debe entrar en `bookToBlocks`, no en un camino paralelo.
- **El PDF ya genera marcadores** desde `outlineFromPages`, pero no existe un índice impreso con páginas reales.
- **El folio es numérico y continuo** (`firstPageNumber`, `physicalPageOffset`). No existe numeración romana por bloques ni etiqueta de página independiente del folio físico.
- **EPUB y DOCX** reciben secciones planas; no hay modelo de navegación jerárquica ni TOC EPUB generado desde la estructura editorial.
- **Plantillas:** `EditorialTemplate.config` solo describe tipografía y encabezados. No describe estructura editorial ni materias.
- **Metadatos:** `Book` solo guarda título, subtítulo, autor, seudónimo, género, idioma y descripción. No hay titular de derechos, sello, ISBN, depósito legal, colaboradores ni datos por edición.

## 3. Reutilización decidida

| Necesidad            | Solución                                                                           |
| -------------------- | ---------------------------------------------------------------------------------- |
| Orden editorial      | Reutilizar `editorialOrder`; no crear otro orden.                                  |
| Composición          | Extender `bookToBlocks` con materias estructuradas; misma ruta para preview y PDF. |
| Tipografía           | Reutilizar `EditorialTemplate` y `TypographyConfig`.                               |
| Geometría            | Reutilizar `LayoutProfile` y `PageGeometry`.                                       |
| Exportadores         | Alimentar `ExportSection` con las materias compuestas; no duplicar PDF/EPUB/DOCX.  |
| Secciones narrativas | Seguir usando `BookSection` + Tiptap.                                              |
| Páginas automáticas  | Nuevo `EditorialMatter` con datos estructurados, nunca Tiptap duplicado.           |

## 4. Modelo de datos propuesto

Se añaden entidades nuevas solo donde no existe equivalente:

- `BookEditorialMetadata` (1:1 con libro): datos de obra que faltan y titularidad de derechos.
- `EditorialProfile`: ficha reutilizable de sello editorial.
- `BookContributor`: colaboradores acreditados.
- `BookIdentifier`: ISBN/DOI/depósito legal con estado explícito.
- `EditorialMatter`: configuración y datos de cada elemento preliminar/final estructurado.
- Ampliación de `BookEdition`: sello responsable, fecha, impresor, tiraje, estado de depósito legal y ajustes de numeración/índice.

No se crea una tabla de plantillas: las plantillas de sistema viven versionadas en `packages/templates`; `EditorialMatter` guarda `templateSlug` y `templateVersion`. Las plantillas propias podrán persistirse en el futuro sobre `EditorialTemplate.config.structure`.

## 5. Archivos previstos

**Nuevos**

- `docs/EDITORIAL_MATTER_AUDIT.md` (este documento)
- `docs/EDITORIAL_MATTER_ARCHITECTURE.md`
- `docs/EDITORIAL_TEMPLATES.md`
- `docs/AUTOMATIC_TABLE_OF_CONTENTS.md`
- `docs/PERU_PUBLICATION_METADATA.md`
- `docs/EDITORIAL_EXPORT_VERIFICATION.md`
- `packages/templates/src/editorial-structure.ts`
- `packages/templates/src/legal-page.ts`
- `packages/templates/src/table-of-contents.ts`
- `packages/templates/src/matter-content.ts`
- `packages/database/prisma/migrations/20261023120000_editorial_matter/migration.sql`
- `apps/web/src/lib/editorial/*` (consultas, acciones, composición)
- `apps/web/src/components/editorial/*` (UI)
- `apps/web/src/app/(app)/books/[bookId]/estructura/page.tsx`

**Modificados**

- `packages/database/prisma/schema.prisma`
- `packages/database/src/expected-schema.ts`
- `packages/templates/src/index.ts`
- `apps/web/src/lib/layout/blocks.ts`
- `apps/web/src/lib/layout/preview.ts`
- `apps/web/src/lib/export/generate.ts`
- `apps/web/src/lib/export/manuscript.ts`
- `apps/web/src/components/books/manuscript-sidebar.tsx`
- Navegación de la ficha del libro.

## 6. Riesgos identificados

1. **Circularidad del índice:** el TOC ocupa páginas y desplaza capítulos. Se resolverá con iteración acotada y bloqueo si no converge.
2. **Numeración romana:** el motor actual solo maneja folios numéricos. Se añadirá etiqueta de folio sin romper `folio`.
3. **Migración:** los libros existentes no deben recibir datos ficticios. Los campos nuevos quedan nulos y se marcan como pendientes.
4. **EPUB:** no debe heredar números de página fijos. La navegación será semántica.
5. **DOCX:** los campos TOC de Word requieren actualización manual; se advertirá en lugar de mostrar números falsos.
6. **Cumplimiento:** la página legal se compone con plantillas documentadas; no se afirma validez oficial ni se inventan números.

## 7. Orden de implementación

1. Esquema y migración.
2. Lógica pura de estructura, página legal, índice y materias.
3. Pruebas unitarias de dominio.
4. Composición integrada (preview + PDF + EPUB + DOCX).
5. Server Actions y UI.
6. Revisión editorial y documentación.

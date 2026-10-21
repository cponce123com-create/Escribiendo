# @escribiendo/templates

Plantillas **editoriales**: la representación declarativa de cómo se compone un
libro (tipografía, estilos de bloque, viudas y huérfanas, encabezados de página
y posición del folio).

## Estado

Este paquete ya contiene código. Lo que vive aquí:

- `editorialTemplateConfigSchema`: la forma de una plantilla, validada con Zod.
- `SYSTEM_TEMPLATES`: el catálogo de plantillas de sistema (Novela, Ensayo,
  Poesía y Manual). Es un catálogo cerrado que acompaña al código.
- `withTemplateDefaults`: completa una configuración guardada con los valores
  por defecto, de modo que una plantilla escrita antes de una versión nueva
  siga funcionando.

## Geometría predeterminada

Cada plantilla de sistema lleva un `page: TemplatePagePreset` con la página,
los márgenes, el sangrado y las opciones de composición. La aplicación usa ese
preset para crear o reutilizar el perfil de página que necesitan la vista
previa y la exportación: quien escribe solo elige la plantilla.

`templatePagePreset(slug, isSystem)` devuelve el preset de una plantilla de
sistema o la geometría neutra (`DEFAULT_TEMPLATE_PAGE_PRESET`) para una
plantilla propia. Las plantillas propias no tienen un preset asociado en el
código y reciben esa geometría neutra.

## Plantillas de sistema y propias

El modelo de datos ya distingue las dos: `EditorialTemplate` usa `workspaceId`
nulo para las plantillas de sistema, que son las mismas para todos los
espacios de trabajo, y el índice único parcial garantiza un único `slug` por
espacio de trabajo para las propias.

La instalación de las plantillas de sistema es idempotente y se hace al abrir
la maquetación de un estudio (`ensureSystemTemplates`, en la aplicación). No
hace falta migración de datos: la base de datos ya tenía la tabla y el índice.

## Validación contra la geometría

La validación de la plantilla se apoya en `@escribiendo/editorial-engine`: la
geometría de la página se valida con `validateLayoutGeometry` y la
tipografía, con los esquemas de `typography.ts`.

Consulta [docs/ROADMAP.md](../../docs/ROADMAP.md) para el orden previsto de las
fases y qué queda para las siguientes.

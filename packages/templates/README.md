# @escribiendo/templates

Espacio reservado para las **plantillas editoriales** que se incorporan en una
fase posterior.

## Estado en la Fase 1

Este directorio **no contiene código**. La Fase 1 entrega los cimientos: modelo
de datos, acceso privado, integridad referencial y despliegue. Las plantillas
editoriales necesitan el motor de maquetación y el documento Tiptap, que aún
no existen.

## Qué habrá aquí

- Representación declarativa de una plantilla (tipografía, estilos de
  bloque, Widow/orphan,NOTES de página y elementos gráficos de la cubierta).
- Plantillas de sistema (compartidas por todos los espacios de trabajo) y
  plantillas propias de cada espacio, según el modelo de datos ya preparado:
  `EditorialTemplate` distingue `workspaceId` nulo (plantilla de sistema) de
  una plantilla propia, y el índice único parcial garantiza un único `slug`
  por espacio de trabajo.
- Validación de la plantilla contra la geometría de la página, apoyándose en
  `@escribiendo/editorial-engine`.

## Por qué no hay código todavía

El repositorio no incluye funciones simuladas ni datos de demostración. Un
módulo de plantillas vacío o con stubs obligaría a mantener una API que
todavía no tiene consumidor real, y su modificación posterior rompería las
fases venideras.

## Estado del modelo de datos

El soporte ya está en la base de datos (`EditorialTemplate`, `config` en JSON)
y en el motor de maquetación (`@escribiendo/editorial-engine`). Lo que falta
es la capa que traduce una plantilla a un documento maquetado, que depende del
editor y de la biblioteca, es decir, de las fases 2 y 3.

Consulta [docs/ROADMAP.md](../../docs/ROADMAP.md) para el orden previsto.

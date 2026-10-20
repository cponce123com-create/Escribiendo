# workers/export-worker

Espacio reservado para el **worker de exportación** de libros (PDF, EPUB y
DOCX), previsto para una fase posterior.

## Estado en la Fase 1

Este directorio **no contiene código**. La Fase 1 no incluye exportaciones ni
procesos en segundo plano.

## Por qué no hay un worker permanente

El despliegue previsto es **Render Free**, que no ofrece un plan de worker
permanente. Un proceso de fondo continuo consumiría recursos de un servicio
que ya está limitado y añadiría un punto de fallo más.

Por tanto, el diseño previsto para las exportaciones es:

1. La aplicación web **encola** el trabajo en `ExportJob` con una clave de
   idempotencia, el hash del manuscrito y las versiones de las secciones
   involucradas (el modelo de datos ya lo recoge).
2. El trabajo se ejecuta **a demanda** desde el propio servicio web, por
   ejemplo con una ruta de API protegida que reclama trabajos pendientes, o
   desde una tarea programada de Render, si en el futuro el proyecto dispone
   de ese recurso.
3. El progreso y el resultado se registran en `ExportJob`, de modo que un
   trabajo interrupted pueda detectarse y reintentarse sin duplicar
   archivos.

Este diseño evita un worker permanente y mantiene el consumo de recursos
acotado al plan gratuito.

## Qué habrá aquí

- Conversores de `BookEdition` + `BookSection` a los formatos de
  `ExportFormat` (`PDF_DIGITAL`, `PDF_PRINT`, `EPUB3`, `DOCX`).
- Recuperación ante fallos: reintento, reanudación y marca de `errorCode`.
- Limpieza de archivos parciales y control de tamaño de las imágenes.

Consulta [docs/ROADMAP.md](../../docs/ROADMAP.md) y
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) para más detalle.

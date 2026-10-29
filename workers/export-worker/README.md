# workers/export-worker

Espacio reservado para un futuro **worker de exportación** independiente de
libros (PDF, EPUB y DOCX).

## Estado actual

Las exportaciones ya están implementadas **dentro de la aplicación web**
(`apps/web/src/lib/export`): el trabajo se genera a demanda, se guarda la
instantánea de versiones en `ExportJob` y la descarga va firmada y caduca.

Este directorio no contiene código. Se conserva como punto de extensión para
mover la generación pesada a un proceso aparte si Render deja de caber en una
sola instancia o si se necesita una cola persistente.

## Por qué no hay un worker permanente

El despliegue previsto es **Render Free**, que no ofrece un plan de worker
permanente. Un proceso de fondo continuo consumiría recursos de un servicio
que ya está limitado y añadiría un punto de fallo más.

## Qué habrá aquí si se implementa

- Conversores de `BookEdition` + `BookSection` a los formatos de
  `ExportFormat` (`PDF_DIGITAL`, `PDF_PRINT`, `EPUB3`, `DOCX`).
- Recuperación ante fallos: reintento, reanudación y marca de `errorCode`.
- Limpieza de archivos parciales y control de tamaño de las imágenes.

Consulta [docs/ROADMAP.md](../../docs/ROADMAP.md) y
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) para más detalle.

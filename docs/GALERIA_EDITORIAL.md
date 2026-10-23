# Galería editorial

Las plantillas legales son informativas y no constituyen asesoría legal. El usuario debe revisar la titularidad, licencia, datos de publicación y obligaciones aplicables antes de publicar. Ninguna plantilla inventa números de ISBN o depósito legal. Las cláusulas adicionales y la página propia permiten editar el texto que se exporta.

Fuentes oficiales consultadas el 23 de octubre de 2026:

- https://creativecommons.org/cc-licenses/
- https://creativecommons.org/chooser/
- https://creativecommons.org/publicdomain/zero/1.0/deed.es
- https://www.gob.pe/institucion/pcm/normas-legales/1670023-822
- https://www.bnp.gob.pe/servicios/deposito-legal/

La referencia al Decreto Legislativo 822 identifica la Ley sobre el Derecho de Autor; no equivale a afirmar el cumplimiento del depósito legal. Su número solo se imprime si lo aporta el usuario.

La elección se guarda en `BookEdition.settings`. Como `EditorialMatter` no tiene columna de edición, `data.editionId` delimita la fila de cada edición; se conservan las filas antiguas sin esa clave. Las escrituras son transaccionales y comprueban libro y espacio de trabajo. No es necesaria una migración de esquema.

Las nuevas exportaciones capturan las materias y los bloques legales ya generados, incluyendo su versión, en `options.layout.matter`. Cambiar el libro o la plantilla no altera su reproducción. Los trabajos anteriores sin instantánea de materias conservan su comportamiento histórico y no pueden reconstruir datos que nunca guardaron.

Las miniaturas y el diálogo escalan las hojas del motor real, con las mismas métricas y composición del PDF. Los avisos de datos ausentes se muestran fuera de la hoja: no se insertan marcadores ficticios en el libro. El modo propio enlaza una sección existente y conserva su contenido; cambiar el modo no elimina manuscrito.

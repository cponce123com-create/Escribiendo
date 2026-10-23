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

## Índice automático

Los seis diseños usan `composeMatter`, los bloques compartidos y los folios medidos del libro. Los encabezados H1–H3 se enlazan mediante sus ids de bloque; `showInToc` e `includeInExport` se respetan antes de componer. EPUB exporta un `nav` con jerarquía y enlaces, sin folios físicos. DOCX incluye un índice legible con los mismos niveles y sin inventar páginas de Word.

El diseño compacto usa cuerpo de 9 puntos y espaciado reducido. Si las entradas no caben, continúa en otra página: no se trunca el índice ni se promete una única página para cualquier longitud de libro.

El catálogo versiona los diseños. Las materias están incluidas en la huella de exportación: cambiar su diseño genera un trabajo distinto. Las lecturas repetidas de las galerías se comparten solo dentro de la petición de render, sin caché entre usuarios.

La dedicatoria se alinea a la derecha en vista previa, PDF, EPUB y DOCX; el manuscrito no se modifica. Es una decisión de composición literaria, no un formato legal obligatorio.

## Libros antiguos

La existencia de una sección `TABLE_OF_CONTENTS` no desactiva el índice automático. Solo una fila explícita `MANUAL` conserva el índice manual como salida de esa edición. El texto antiguo permanece en el manuscrito al elegir una plantilla automática.

Antes de activar el cambio en libros antiguos, ejecutar con las credenciales administrativas de la base de datos y revisar primero la simulación:

```sh
pnpm exec tsx scripts/migrate-manual-toc.ts
pnpm exec tsx scripts/migrate-manual-toc.ts --apply
```

El script registra filas `MANUAL` por sección antigua; no elimina ni modifica contenido y no duplica filas ya registradas. No se ha ejecutado contra la base de producción desde este trabajo. No cambia el esquema de Prisma ni `expected-schema.ts`.

## Comprobación manual

1. En Maquetación, abrir «Página legal e índice». Recorrer las siete tarjetas legales con Tab y flechas; abrir la hoja, cerrar con Escape y comprobar que vuelve el foco.
2. Elegir cada plantilla legal y guardar. Recargar; comprobar la selección, la vista previa y el PDF. Probar un libro sin año, titular, ISBN y depósito: los avisos deben llevar al formulario correspondiente y nunca imprimir valores ficticios.
3. Añadir cláusulas con tildes y saltos de línea. Comprobar que aparecen en PDF, EPUB y DOCX. Probar el máximo de 4000 caracteres y el rechazo de controles ilegales.
4. En Creative Commons elegir cada licencia. Comprobar nombre y URL oficiales y ausencia de «Todos los derechos reservados». En la plantilla Perú–Ley, comprobar la referencia al DL 822 y el número real de depósito.
5. Activar «Sin página legal» y comprobar que no aparece en preview/PDF. En «Página legal propia», enlazar una sección, editarla desde el manuscrito y verificar que su contenido se conserva al alternar modos.
6. Elegir los seis índices. Probar título, alineación, folios, puntos, profundidad y preliminares/finales. Guardar, recargar y verificar que siguen elegidos. Cambiar `showInToc` e `includeInExport` por sección y comprobar el resultado.
7. Con un libro de varias páginas, comparar cada folio anunciado en el índice con el impreso en preview y PDF. Añadir texto hasta que el índice ocupe dos páginas y repetir. Abrir EPUB y seguir sus enlaces; comprobar niveles en DOCX, sin números físicos inventados.
8. En un libro antiguo, ejecutar la simulación y conversión del índice manual. Verificar que conserva íntegro el contenido y la salida manual. Activar una plantilla automática y comprobar que el texto original sigue accesible en la sección.
9. Exportar, cambiar plantilla y datos legales, y volver a descargar el trabajo anterior: debe conservar sus materias capturadas. Solicitar un trabajo nuevo y comprobar los cambios.
10. Probar con rol REVIEWER: puede leer las hojas, pero las escrituras deben rechazarse. Probar vista móvil de 390 px, dedicatoria a la derecha y un libro sin cuerpo (aviso `INDICE_SIN_CUERPO`).

## Validación

La tarea A se verificó con lint, tipos y 660 pruebas. La tarea B aprobó lint, tipos, formato, compilación y 669 pruebas en 82 archivos. Añade pruebas de diseños, profundidad, folios estabilizados, permisos, conservación de settings, navegación semántica y alineación en formatos refluibles. Se ejecutan además `validate:epub` con EPUBCheck 5.3.0 y `validate:docx` con Mammoth 1.11.0; los validadores viven fuera del repositorio y no añaden dependencias de producción. También se validó un EPUB con página Creative Commons y navegación anidada: cero errores y avisos. La revisión visual local usa los componentes reales renderizados con datos de prueba; no sustituye las comprobaciones con sesión y base de datos de esta lista.

## Acceso desde el manuscrito

«Página legal · Plantillas» e «Índice (automático) · Diseños» son enlaces en Preliminares. Las filas antiguas de tipo COPYRIGHT y TABLE_OF_CONTENTS también abren su galería, tanto en la barra lateral como en la ficha del libro. Las URL antiguas de sección redirigen después de comprobar el libro y el espacio de trabajo. No se borra contenido: el aviso de la galería ofrece «Ver o editar contenido anterior» y abre el editor con `?editLegacy=1`. Las búsquedas con `find` siguen abriendo el texto anterior para mostrar la coincidencia. «Volver al manuscrito» permite regresar sin pasar por Maquetación.

Prueba de regresión: abrir un capítulo, pulsar ambos enlaces en Preliminares y verificar que aparecen las tarjetas en lugar de un editor vacío. Abrir una URL antigua de Copyright/Índice, comprobar la redirección y volver a su contenido anterior; los capítulos y las dedicatorias deben conservar su editor habitual.

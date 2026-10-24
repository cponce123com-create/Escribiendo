# Importación revisable de libros

El importador usa reglas locales y metadatos del archivo, sin servicios de IA ni envío a terceros. Admite EPUB, DOCX y PDF con texto seleccionable, hasta 15 MB. El archivo original no se conserva: los libros ya importados no se reconstruyen automáticamente y deben volver a importarse desde su original si perdieron estructura.

## Flujo

1. Seleccionar el archivo y pulsar **Analizar archivo**. No se escribe en la base de datos.
2. Revisar metadatos, avisos, cantidad de secciones, palabras aproximadas e inicio de cada sección.
3. Corregir títulos/tipos y desmarcar únicamente las secciones que se quieran excluir. La autoría es obligatoria si no aparece en el archivo; no se inventa.
4. Confirmar. El servidor vuelve a analizar y validar el archivo y comprueba su huella contra la revisión. Crea libro, secciones, materias manuales y revisiones `IMPORT` en una transacción.

Las acciones comprueban origen, sesión y `book:create`. La revisión no permite enviar contenido arbitrario del cliente: solo índices, títulos, tipos y selección sobre el archivo validado. Se mantienen los límites de ZIP, tamaño de texto, secciones y documento del editor.

## Detección y conservación

- **DOCX:** conserva el orden de párrafos, tablas y vínculos; reconoce estilos de título en español/inglés, herencia de estilos y niveles de esquema. Conserva negrita, cursiva, subrayado, tachado, saltos, enlaces seguros y notas. Omite texto eliminado y códigos de campo de Word. Las tablas pasan a párrafos en orden de celdas; su geometría no se conserva.
- **EPUB:** respeta el spine, títulos y navegación EPUB 3 o NCX de EPUB 2. Las anclas pueden delimitar capítulos dentro de una misma página XHTML. Conserva texto y formato básico. Si falta una página del orden de lectura se rechaza el libro en lugar de completarlo silenciosamente sin ese capítulo.
- **PDF:** ordena las líneas según posición, reúne renglones y continuaciones entre páginas, separa párrafos por espacio/sangría y detecta cabeceras. Omite encabezados/folios repetidos solo en márgenes. No necesita ni ejecuta IA u OCR. Las columnas, imágenes y fuentes extrañas pueden producir resultados ambiguos; se advierte y deben revisarse.
- Reconoce partes, prólogos, epílogos, dedicatorias y otros tipos; un subtítulo no se convierte sistemáticamente en otro capítulo. Un rótulo numerado y su título consecutivo se reúnen. Las partes sin cuerpo conservan su título.
- Las páginas legales e índices originales se guardan con una materia `MANUAL` explícita para evitar duplicarlos automáticamente; siguen editables y pueden sustituirse después mediante las galerías.
- Los bloques muy grandes se dividen respetando UTF-8 y los límites del editor. El formato se conserva entre continuaciones; un bloque individual excepcional puede simplificarse a texto, con aviso.

## Límites

No reconstruye una maqueta idéntica al original ni importa imágenes incrustadas. No recupera texto de escaneos sin OCR. Las notas finales se convierten en notas al pie del editor; notas que exceden su límite se conservan como texto. Las heurísticas no garantizan acertar cada división: por eso se revisan antes de crear el libro. No modifica otros libros ni añade migraciones de esquema.

## Comprobación manual

- DOCX con prólogo, capítulos, subapartados y cursivas: verificar títulos, tipos, orden, contenido y formato después de guardar y recargar.
- DOCX con tablas entre párrafos y con notas: verificar que conserva el texto en orden y permite editar las notas.
- EPUB 2 y EPUB 3 con varias anclas en un archivo: verificar que no falta ningún capítulo y que respeta el orden.
- PDF de varias páginas: comprobar los párrafos, capítulos y avisos, incluidos encabezados/folios repetidos. PDF escaneado: esperar un mensaje que pide OCR.
- Desmarcar una sección, renombrar otra y cambiar su tipo; comprobar que solo se aplica la selección confirmada.
- Cambiar de archivo tras analizar: la revisión se reinicia y no se permite confirmar la anterior. Rechazar una revisión manipulada o sin autoría, sin crear libros parciales.
- Abrir un libro recién importado y comprobar el historial inicial `IMPORT`, las estadísticas y la exportación. Con índices/derechos originales, verificar modo manual y ausencia de duplicados automáticos.

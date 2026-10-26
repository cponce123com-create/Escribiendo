# Buscar y reemplazar

Herramienta por libro, en `/books/<bookId>/search-replace`, accesible desde la
ficha del libro. Sirve para renombrar personajes, corregir erratas repetidas o
cambiar una expresión en todo el manuscrito con revisión previa.

## Alcance

- Recorre **todas las secciones** del libro y busca solo en los nodos de texto de
  Tiptap. La estructura, las marcas (negrita, cursiva, enlaces) y los atributos
  (notas al pie, imágenes, notas al margen) quedan intactos.
- La búsqueda es **literal** por defecto. Con «Expresión regular» se interpreta
  como regex; en ese modo el reemplazo admite referencias `$1`.
- Opciones: distinguir mayúsculas y palabra completa (con límites Unicode, así
  que «Ana» no coincide dentro de «Anabel»).
- Límite de **5 000 coincidencias** por operación. Si se alcanza, la vista
  previa lo avisa y el reemplazo se rechaza: hay que acotar la búsqueda.

## Seguridad

- Permiso `section:update`.
- El reemplazo se calcula en el servidor: no se confía en el recuento del
  cliente.
- Cada sección modificada guarda una **revisión manual** (`reason: MANUAL`) con
  su contenido anterior y el nuevo recuento de palabras.
- El guardado usa comprobación de versión dentro de una transacción serializable:
  si alguien editó una sección mientras se revisaba el resultado, la operación
  completa se cancela.
- Se registra en la auditoría como `BOOK_SEARCH_REPLACE` con consulta, reemplazo,
  opciones, secciones y número de cambios.

## Flujo

1. Escribir la búsqueda y pulsar «Buscar».
2. Revisar las coincidencias por sección, con extractos y enlace a cada sección.
3. Escribir el reemplazo, marcar la confirmación y pulsar «Reemplazar N
   coincidencias».
4. Si hace falta deshacer, restaurar la revisión desde el historial de cada
   sección.

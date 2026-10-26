# Referencias cruzadas

Un autor puede citar otra sección del libro sin escribir el folio a mano. El
texto final se resuelve al componer, porque el número de página todavía no
existe cuando se escribe.

## Cómo se usa

En la barra del editor, «Referencia cruzada» (menú «Más»):

1. Elige la sección de destino.
2. Elige qué se muestra: **número de página** o **título de la sección**.
3. La referencia se inserta en la posición del cursor.

El nodo `crossReference` guarda `targetId`, `label` (para el editor) y
`format`. No guarda el folio: se calcula.

## Resolución

- La composición se repite mientras cambie el mapa `sección → folio`, igual que
  el índice. La vista previa y el PDF usan el mismo bucle.
- Sin mapa de páginas —EPUB, DOCX— la referencia cae al **título** de la
  sección: un número inventado sería peor que el nombre.
- Si la sección destino no existe, se muestra la etiqueta guardada o
  «sección».

## Límites

- Solo apunta a secciones, no a anclas dentro de un párrafo.
- No hay formato «capítulo 3»: el autor escribe el sustantivo alrededor
  («véase el capítulo ») y la referencia aporta el número o el título.
- En EPUB/HTML el texto es plano; un enlace al destino queda como mejora
  futura.

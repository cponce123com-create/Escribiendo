# Glosario del libro

Cada libro puede mantener su propio glosario de términos y volcarlo en una
sección del manuscrito. Página: `/books/<bookId>/glossary`, accesible desde la
ficha del libro.

## Por qué una sección y no un formato aparte

Los términos se guardan en `book_glossary_terms` y, al generar el glosario, se
crean o actualizan en una sección `GLOSSARY` normal. Así el glosario:

- se revisa y corrige como cualquier sección;
- entra en la vista previa y en el índice;
- se exporta igual en PDF, EPUB, DOCX, Markdown, HTML y TXT, sin casos
  especiales en el motor.

El autor puede retocar la sección después de generarla. Si vuelve a pulsar
«Actualizar sección de glosario», se guarda una **revisión manual** antes de
reemplazar el contenido.

## Datos

| Campo        | Regla                             |
| ------------ | --------------------------------- |
| `term`       | 1–160 caracteres, único por libro |
| `definition` | 1–2000 caracteres                 |

Los términos se ordenan alfabéticamente con la configuración regional española
al construir la sección.

## Seguridad

- Permiso `section:update`; crear la sección exige además `section:create`.
- El libro se comprueba contra el espacio de trabajo de la sesión.
- El duplicado se detecta por la restricción única y se devuelve un mensaje
  claro.
- La sincronización queda auditada como `BOOK_GLOSSARY_SYNCED`.

## Migración

`20261026150000_book_glossary` crea la tabla y su índice único. Es aditiva y se
aplica con `pnpm db:migrate` (el build de Render ya lo ejecuta).

## Marcas en línea

La barra del editor ofrece **«Término de glosario»** en el menú «Más». Con texto
seleccionado, pide el término y aplica la marca `glossaryTerm`, que guarda solo
el nombre: la definición sigue viviendo en el glosario del libro.

- En el editor y en la vista previa el término aparece con subrayado punteado.
- **HTML y EPUB** lo envuelven en
  `<span class="glossary-term" data-term="…">` con el mismo subrayado.
- **PDF, DOCX, Markdown y TXT** conservan el texto sin marcado especial: no hay
  pérdida de contenido.

La marca no enlaza todavía a la definición ni muestra tooltip; eso queda como
siguiente paso, junto con la detección automática de términos presentes en el
manuscrito.

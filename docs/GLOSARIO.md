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

## Pendiente

- Marcas en línea del término dentro del texto y tooltip en EPUB/HTML.
- Detección automática de términos presentes en el manuscrito.

# Resultados reproducibles · auditoría 95

Fecha: 26 de octubre de 2026. Rama `feat/auditoria-95-20261026`, base `main` `54d5cf9`. No se utilizó Neon de producción ni un manuscrito privado.

## Importación y migración

| Prueba                                   | Resultado observado                                                                     | Alcance                                                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unidad importación, detección y acciones | 31/31 después de las correcciones                                                       | DOCX, EPUB, PDF, idempotencia por clave y colisión simulada, título dudoso, fragmentación de texto.                                               |
| DOCX 10 capítulos, 10 000 palabras       | 49 ms, RSS del worker 201 MiB                                                           | Una ejecución sintética local.                                                                                                                    |
| DOCX 50 capítulos, 200 000 palabras      | 877 ms, RSS del worker 270 MiB                                                          | Una ejecución sintética local; cada capítulo conserva 4 000 palabras. No incluye escrituras a PostgreSQL ni carga web.                            |
| EPUB 50 capítulos                        | Orden y texto marcador de las 50 secciones verificados                                  | Fixture generada con spine.                                                                                                                       |
| PDF diez páginas                         | Marcadores seleccionables en orden, sin OCR                                             | Fixture vectorial generada; no prueba PDF escaneado ni columnas.                                                                                  |
| E2E importador en Chromium               | 3/3 (incluye preparación de cuenta)                                                     | Compilación de producción y PGlite aislada; confirma DOCX y advierte encabezado débil.                                                            |
| 16 migraciones completas                 | Se aplicaron en PGlite desechable y se comprobó el índice único y ambas columnas nuevas | Valida SQL y dependencias de migraciones; no certifica rendimiento ni bloqueo en PostgreSQL nativo.                                               |
| Prisma schema diff                       | Dos columnas aditivas y exactamente un índice único                                     | Comparación desde el esquema de `main` con Prisma 6.19.3.                                                                                         |
| E2E exportación, manuscrito y seguridad  | 39/39 en Chromium sobre compilación de producción                                       | Base aislada en PGlite; cubre PDF digital/imprenta, EPUB, DOCX, Axe en editor y ficha, guardado sin conexión, conflictos, autenticación y origen. |

EPUBCheck 5.4.0: 0 errores y 0 avisos en el libro sintético. Mammoth 1.11.0 abrió el DOCX sintético y recuperó el texto esperado; advirtió que no reconoce el estilo de párrafo «Cita», por lo que la fidelidad de ese estilo sigue sin certificarse en otros procesadores. La composición sintética tuvo 11 páginas en vista previa y PDF.

La tentativa `pnpm db:migrate:create --name import_idempotency --create-only` con URL local desechable falló porque no había servidor PostgreSQL nativo. Se revisó la migración aditiva contra `prisma migrate diff` y se ejecutó toda la cadena en PGlite. No se ejecutó `db:migrate` sobre producción.

## Comprobaciones generales

La primera ejecución de `pnpm typecheck` encontró un cliente Prisma anterior a la última migración de `main`, con errores en `aliases`. Después de `pnpm db:generate`, pasó. La primera compilación tropezó con la caché persistente de Turbopack trasladada entre entornos; se apartó `.next`, se recompiló en limpio y pasó. Una primera suite de pruebas comenzó mientras se editaban las fixtures y falló en tres casos de importación; las 31 pruebas dirigidas pasaron después de estabilizar el cambio. No se interpreta la primera suite contaminada como línea base del código original.

Comprobación completa tras la última corrección: `pnpm lint` correcto (una advertencia de un archivo temporal del controlador E2E que luego se retiró), `pnpm typecheck` correcto, `pnpm test` **1058/1058** en 132 archivos, `pnpm build` correcto con caché nueva. La segunda suite E2E pasó **39/39**. La primera ejecución unitaria estabilizada, antes de ampliar las fixtures, había pasado 1054/1054.

## Limitaciones de la medición

No se dispone de tiempo «antes» comparable de importación ni de memoria de producción. No se publica una mejora porcentual inventada. La medición de RSS es la del proceso de prueba, con otras pruebas, caché y dependencias cargadas. Faltan percentiles, varios tamaños/formas de PDF real, ensayos de concurrencia en PostgreSQL nativo y una comparación visual pixel a pixel de PDF/vista previa para la rama actual.

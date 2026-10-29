# Validación externa y rendimiento — 29 de octubre de 2026

## Estado y alcance

Base inicial: main `92c5ba3`, árbol limpio, rama de trabajo `fix/export-validacion-20261029`. No se utilizaron credenciales, manuscritos ni base de producción. Los datos son fixtures sintéticos reproducibles; no son una certificación de todos los libros.

## Validación externa

- EPUBCheck 5.4.0: fixture ampliado de 5032 bytes, cero errores y cero avisos. CI aprobado: https://github.com/cponce123com-create/Escribiendo/actions/runs/40919914506
- LibreOffice 26.2.6.3 en CI: DOCX de 4575 bytes, 3 páginas al convertir a PDF, 21 textos conservados, incluida la nota y el pie de imagen. CI aprobado: https://github.com/cponce123com-create/Escribiendo/actions/runs/40919914299
- Localmente se ejecutó LibreOfficeDev 26.8.0.0.alpha0; la evidencia de CI usa una distribución estable independiente.
- Fixture: página legal mínima desde buildLegalPage, índice semántico de tres niveles, enlace, formatos, dedicatoria, imagen y nota. Las pruebas de paquete verifican las anclas y las partes de la nota; los lectores externos comprueban conformidad EPUB y conservación de textos del DOCX.
- `pnpm validate:docx` usa LibreOffice y pdf.js por defecto, conservando DOCX_VALIDATOR. El lector aislado se instala con --ignore-workspace. Los workflows conservan archivos y, en EPUB, informe JSON; amplían sus disparadores a plantillas y composición.

MOD-03 queda resuelto para este fixture y estas herramientas. La revisión visual con lectores comerciales y libros reales continúa pendiente. EPUB adaptable, DOCX editable y PDF no se certifican como visualmente idénticos.

## Banco de rendimiento

El banco anterior acumulaba PDF, EPUB y DOCX en un único proceso, generaba una cantidad ligeramente superior a 200 000 palabras, utilizaba ruido aleatorio y posicionaba simplificadamente los textos e imágenes del PDF. Su ejecución llegó a 461 MB, pero no representa una comparación equivalente con el banco corregido.

El banco corregido ejecuta cada caso y formato en procesos separados, con semilla 20261029. Mide RSS máximo real con process.resourceUsage().maxRSS, conserva heap y memoria externa por separado y usa paginate → toPdfPages → buildPdf. Los tipos de tramo de exportación y maquetación se convierten explícitamente; las llamadas de nota deben conservar su marcador y sus marcas. El banco falla si desaparecen notas del PDF o imágenes de cualquier formato.

Casos mixtos: 10 capítulos/10 000 palabras; 50 capítulos/50 000 palabras/8 imágenes/50 notas; 100 capítulos/200 000 palabras/20 imágenes/200 notas; 100 capítulos/200 000 palabras/80 imágenes/500 notas. Las palabras se cuentan en el cuerpo, sin títulos ni notas. Las imágenes son JPEG de ruido determinista de 1200 × 800, calidad 70; no se descargan de Cloudinary.

Presupuesto de ensayo: 384 MB por proceso. Es un umbral de planificación, no una medición de memoria disponible en Render. El benchmark excluye Next.js, Prisma, red, concurrencia y estabilización de materias del libro completo. El JSON registra plataforma, CPU, Node y cantidades exactas. Una ejecución por caso no caracteriza percentiles ni variación entre máquinas.

Resultados previos a optimizar la representación PDF: [JSON completo](metrics/export-mixto-antes-20261029.json).

| Caso                                                    | PDF RSS pico MB | EPUB RSS pico MB | DOCX RSS pico MB |
| ------------------------------------------------------- | --------------: | ---------------: | ---------------: |
| 10 capítulos, 10 000 palabras                           |           131,7 |             79,4 |             79,4 |
| 50 capítulos, 50 000 palabras, 8 imágenes, 50 notas     |           222,1 |            133,2 |            134,1 |
| 100 capítulos, 200 000 palabras, 20 imágenes, 200 notas |           410,1 |            190,0 |            191,8 |
| 100 capítulos, 200 000 palabras, 80 imágenes, 500 notas |           518,4 |            276,9 |            284,1 |

El PDF supera el presupuesto en los dos casos grandes. MOD-06 permanece abierto hasta evaluar y verificar una corrección, y no podrá certificarse la instancia de producción con estas mediciones aisladas.

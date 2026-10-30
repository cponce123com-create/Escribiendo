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

## Optimización y verificación posterior

La corrección agrupa tramos adyacentes con el mismo estilo después de decidir los saltos de línea, conserva límites de notas y marcas, y agrupa también los tramos de dibujo PDF contiguos. Los JPEG se ensamblan por segmentos hasta la copia final, y los buffers de normalización se exponen mediante una vista propia sin otra copia completa. La prueba del ensamblado JPEG conservó el PDF de control byte por byte. Se comprueban offsets xref y que modificar el buffer de entrada después no altere el PDF terminado.

La comparación visual detectó inicialmente una deriva subpíxel al agrupar texto: los anchos CID de /W se redondean a enteros mientras hmtx se mide sin redondeo. Se compensa esa diferencia en cada espacio con TJ, conservando el inicio medido de las palabras. Hay regresión para texto normal y justificado. No se elevó la tolerancia para aprobar.

Resultados finales: [casos mixtos](metrics/export-mixto-despues-20261029.json), [solo texto](metrics/export-texto-20261029.json) y [comparación visual](metrics/export-pdf-visual-20261029.json). Las cifras son muestras individuales del mismo equipo y configuración; no son percentiles ni garantías de consumo en producción.

| Caso             | PDF RSS pico MB | EPUB RSS pico MB | DOCX RSS pico MB |
| ---------------- | --------------: | ---------------: | ---------------: |
| 10-capitulos     |           108.3 |             80.2 |             79.4 |
| 50-capitulos     |           158.4 |            130.3 |            130.7 |
| 100-capitulos    |           313.8 |            184.4 |            183.4 |
| 200k-80-imagenes |           364.3 |            255.7 |            258.6 |

En el caso de 200 000 palabras, 80 imágenes y 500 notas, el PDF pasó de **518.4 a 364.3 MB** de RSS pico (29.7% menos). El tiempo total de esa muestra pasó de 3.64 a 2.70 s. Conserva 799 páginas, 80 imágenes incrustadas y 500 notas compuestas. Los doce casos mixtos aprobaron con BENCHMARK_ENFORCE_BUDGET=1 y umbral 384 MB.

### Equivalencia visual

Se comparó un fixture independiente con estilos, dos imágenes y cuatro notas: 8 páginas antes y después, texto idéntico por página. Poppler a 96 dpi: error absoluto medio máximo 0,028 sobre 255 y fracción máxima de píxeles con diferencia mayor de 16 de 0,054%. Umbrales declarados: media ≤0,5 y fracción ≤0,5%. Se inspeccionaron también las imágenes renderizadas. El test independiente de vista previa/PDF conservó sus 11 páginas y coincidencia textual por página.

Esta comparación es entre PDF anterior/posterior, no una certificación visual universal de la vista previa del navegador. La cobertura de todos los libros y fuentes sigue pendiente.

### Reproducción

- `pnpm stress:export`: matriz mixta; `pnpm bench:export`: solo texto. Se escriben JSON en artifacts/export-benchmark.
- `BENCHMARK_ENFORCE_BUDGET=1 pnpm stress:export`: falla si se excede el presupuesto. BENCHMARK_RSS_BUDGET_MB permite declarar otro presupuesto explícito; no se cambia para ocultar un exceso. BENCHMARK_KEEP_FILES=1 conserva los archivos exportados.
- `.github/workflows/export-performance.yml`: ejecución manual del mismo banco con presupuesto obligatorio. No añade una espera a cada cambio de interfaz.
- `node --import tsx scripts/generate-export-visual-fixture.ts artifacts/export-visual/actual.pdf`: genera el fixture de 8 páginas por la ruta compartida.
- `python -m pip install -r scripts/requirements-export-visual.txt`: dependencias opcionales solo de QA; se requiere Poppler y el lector aislado scripts/pdfjs.
- `python scripts/compare-pdf-renders.py anterior.pdf actual.pdf --output artifacts/export-visual`: compara texto, número/tamaño de páginas y rasterización, conserva PNG e informe JSON, y falla si supera los umbrales.

La línea base del banco corregido, previa a optimizar, es el commit `4734c73b8728af177b2599da55658bba2840a9b0`. Para regenerar el PDF anterior se puede crear un worktree aislado de ese commit, copiarle scripts/generate-export-visual-fixture.ts desde la revisión final, instalar sus dependencias con pnpm install --frozen-lockfile y ejecutar allí el generador. Así se comparan los mismos parámetros, fuentes e imágenes con el código anterior, sin cambiar el árbol activo.

## Pendiente real

MOD-06 mejora y queda cubierto por mediciones reproducibles, pero continúa **parcial** para el despliegue: falta medir el proceso Next.js completo, normalización de fotos reales, descarga de Cloudinary, consultas Prisma, exportaciones concurrentes y recuperación tras errores en un entorno equivalente a Render. No se garantiza que un libro arbitrario quepa en Render Free. No hay migraciones ni cambios de datos de producción.

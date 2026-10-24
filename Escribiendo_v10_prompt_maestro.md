# PROMPT MAESTRO — Corrección, optimización y mejora de ESCRIBIENDO

**Entrada:** repositorio `Escribiendo` en su estado actual, correspondiente a `Escribiendo-main (10).zip` (24 de octubre de 2026).  
**Rol:** actúa como un equipo senior de arquitectura de software, ingeniería TypeScript/Next.js, edición de libros, tipografía y maquetación profesional, QA, rendimiento y seguridad.  
**Objetivo:** mejorar la plataforma de escritura **sin reescribirla, sin perder datos y sin romper funciones actuales**. Prioriza precisión editorial, integridad, UX y compatibilidad con Render Free + Neon Free + Cloudinary Free.

## Mandato general

1. **Audita el repositorio real antes de cambiar nada.** No confíes ciegamente en documentos de auditoría o comentarios que dicen «corregido»: confirma cada afirmación en la ruta de producción, pruebas y salida real.
2. Identifica la versión y la rama; registra la línea base con `git status`, archivos existentes, dependencias, scripts, esquema Prisma, flujos de edición, importación, vista previa, exportación y CI. No presupongas que los defectos previos siguen abiertos: detecta y protege las correcciones de la versión 10.
3. **Prohibido** `prisma migrate reset`, `prisma db push` contra producción, borrados masivos, cambios destructivos no autorizados, perder documentos, modificar el texto del autor automáticamente, inventar datos legales o usar credenciales en logs. Las migraciones, si son imprescindibles, serán aditivas y reversibles cuando proceda.
4. Nunca manipules producción ni publiques información personal. No consumas APIs de IA sin una decisión explícita del propietario. Mantén funcionando la solución con planes gratuitos.
5. El libro del autor es la fuente de verdad del contenido. El índice, números de página, páginas legales, estilos y dedicatorias son **vistas derivadas o configuraciones editoriales**. No los incrustes en el texto del manuscrito ni dupliques secciones.
6. Conserva las referencias visuales del usuario: tres capturas de _El Silencio de la Auvernia_ (página legal con aviso superior y créditos inferiores; dedicatoria alineada hacia la derecha en el tercio superior; índice con folios en columna perfectamente derecha). Construye fixtures sin publicar datos personales contenidos en las capturas. Nunca introduzcas información ficticia en la obra.
7. Cada corrección requiere prueba regresiva, validación visual cuando corresponda, análisis de performance y comprobación de que el PDF imprimible reproduce fielmente la vista previa final. EPUB y DOCX son refluibles y no deben prometer folios de PDF idénticos.
8. Trabaja **por fases**, con cambios pequeños, revisión de diff y sin acumular fallos pendientes. No anuncies éxito de pruebas no ejecutadas. Si no hay infraestructura disponible, registra la limitación, prepara las pruebas y no finjas resultados.

## Situación comprobada al comienzo de esta tarea

La versión 10 YA incorporó: columna derecha de folios en el índice (`pagination.ts`), líderes geométricos, detector de estabilización del índice, dedicatoria persistida por edición, plantilla `copyright-peru-classic-reference`, panel de letra capital, pruebas de geometría y previsualización parcial cacheada. **Conservar y reforzar** esas funciones, no sustituirlas por enfoques peores.

**Investigar y corregir primero los siguientes hallazgos de auditoría estática, confirmándolos con pruebas reproducibles:**

- **P0/P1 — Letra capital y puntuación:** `dropCapGrapheme()` salta signos iniciales, pero `paginated-preview.tsx` y `pdf-layout.ts` suprimen el primer grafema del primer segmento. Con `«Aquella…`, `“Había…”`, `¿Dónde…?`, `¡Era…!` o raya de diálogo se podría eliminar el signo y duplicar la letra. Conservar la puntuación, medir solo el grafema correcto y quitar exactamente el grafema usado como inicial; respetar marcas y runs. Añadir pruebas PDF + preview con caracteres acentuados, dígrafos, marcas combinadas y grafemas Unicode.
- **P1 — Página legal inválida omitida:** `buildLegalPage` establece `ready=false` ante errores (p. ej. ISBN inválido), mientras `legalPageToBlocks` devuelve una lista vacía; `composeMatter` puede omitir la página sin un bloqueo o diagnóstico claro en exportación. Hacer explícito el error, mostrar acciones de corrección y bloquear exportación cuando una página legal habilitada esté inválida o permitir exclusión consciente. Jamás omitirla silenciosamente.
- **P1 — Resolución del logotipo:** `roleBlocksToBlocks` admite `resolveImage`, pero `composeMatter` no lo conecta en la ruta ordinaria de páginas legales; un logo configurado puede omitirse. Implementar resolvedor seguro, dimensiones y fallback diagnosticado, tanto en preview como exportación, sin peticiones arbitrarias a URLs privadas.
- **P1 — DOCX variable:** `packages/export-engine/src/docx.ts` usa `DOCX_TEXT_WIDTH_TWIPS=9070` fijo para tabulación del índice y `w:lines="3"` fijo para letra capital. La edición ya admite perfiles y capitales de dos/tres líneas. Hacer configurables/mapeables estilos y geometría según el formato de Word; verificar en Word/LibreOffice cuando estén disponibles. Si un comportamiento no es reproducible fielmente en DOCX, comunicarlo como tal.
- **P1 — Pruebas visuales insuficientes:** `reference-pages.golden.test.ts` compara geometría, NO captura de píxeles contra el render final. Añadir tests de navegador/imagen, extracción de texto y verificación del PDF exportado. Detectar clipping, solapamientos, folios desviados, blancos imprevistos y capitulares flotantes.
- **P1/P2 — Doble generación de exportación:** `jobs.ts` genera bytes al completar y `api/exports/[jobId]/download/route.ts` los regenera al descargarlos. Medir CPU, latencia, memoria y estabilidad en Render Free, especialmente 100, 300 y 600 páginas. Diseñar entrega fiable sin dependencias de pago y sin almacenar documentos sin protección. No asumir persistencia de disco de Render Free.
- **P2 — Jerarquía del índice:** `matter-blocks.ts` aún usa espacios em para la sangría de niveles. Sustituir la alineación por propiedades geométricas de nivel/indentación del modelo; permitir títulos largos de 2–3 líneas sin cruzarse con la columna del folio.
- **P2 — Importación:** documentación y código limitan a EPUB/DOCX/PDF con texto, 15 MB/200 secciones, sin importación de imágenes integradas ni OCR. Mantener límites preventivos hasta evaluar memoria/seguridad; optimizar y hacer visibles avisos y opciones. No prometer fidelidad de PDF escaneados sin OCR implementado y pruebas.

## Fase 0 — Baseline, mapa funcional y protección del manuscrito

A. Levanta mapa de carpetas, responsabilidades y dependencias: `apps/web`, `packages/editorial-engine`, `packages/templates`, `packages/export-engine`, `packages/book-schema`, `packages/database`, `workers` y scripts. Localiza las rutas reales editor → bloques → paginación → preview → PDF / EPUB / DOCX; las páginas legales, dedicatorias, TOC y pipeline de importación.
B. Haz inventario de las configuraciones persistidas y compatibilidad histórica (`BookEdition.settings`, materiales manuales, snapshots de exportación y versiones de sección). Crea backup reproducible de pruebas, usa una base de datos **local desechable**, prohíbe pruebas contra Neon de producción.
C. Toma medidas de referencia: cold/warm build, duración de previsualización y exportación, memoria pico, resultados de `lint`, `typecheck`, `test`, `build`, `format:check`, validadores DOCX/EPUB/PDF y E2E. No bloquees todo el trabajo por falta de una dependencia externa: documenta el bloqueo.
D. Crea fixtures de novelas cortas, medianas y largas, y copia tipográfica de las tres capturas referenciales.
**Criterio:** registro BASELINE.md que distinga pruebas realizadas, pendientes y dependencias disponibles.

## Fase 1 — Integridad, casos críticos y validación legal

A. Corrige el bug de puntuación de la capitular mediante índices de grafema o rangos exactos; elimina la duplicación / pérdida en `preview` y `PDF` y revisa `drop-cap.ts`.
B. Diseña validación editorial **no destructiva**: una página legal activa pero no lista no debe desaparecer sin explicación. Vincula el aviso a su campo, preserva lo introducido y distingue error bloqueante de dato opcional/advertencia.
C. Resuelve el logotipo con validación del origen, formato, dimensiones, límites de tamaño y fallback accesible. No crees un punto de SSRF. Garantiza paridad en exportación.
D. Revisa dedicatorias largas, espacios verticales, cambios de papel, saltos de página, contenido vacío y firmas.
E. Añade tests unitarios, integración y E2E de cada caso.
**Criterio:** cero pérdidas de contenido o páginas habilitadas por errores de composición.

## Fase 2 — Índice automático profesional

A. Mantén modelo semántico: id único de sección, título, nivel, grupo, número de página definitivo, etiquetas impresas y preferencias por edición. Evita calcular folios por cuenta propia con fórmulas que ignoren páginas en blanco o portada.
B. Sustituye espacios em y padding textual por sangrías tipográficas medidas. Alinea _todos_ los folios al mismo ancla derecha por caja; separa título/leader/folio. Implementa líder de puntos con longitud segura y ritmo uniforme; admite líderes sin puntos por plantilla.
C. Títulos extensos y anidados deben envolver sin montar el texto sobre el número. Prueba títulos con signos, números romanos, 1–4 dígitos, nombres largos y 250 capítulos; índices de 2+ páginas, prologuillos, epílogos y subtítulos.
D. Mantén estabilización con convergencia verificada, informe de ciclos y diagnóstico concreto; si no converge, nunca exportes un índice evidentemente falso.
E. Actualiza al insertar/eliminar/reordenar capítulos, cambiar tamaño de página, portada, márgenes, cuerpo, tipografía o secciones visibles.
F. Crea regresiones visuales a partir de la captura de referencia: números perfectamente alineados, título centrado, interlínea constante, mínimo desbordamiento y puntos guía profesionales.
**Aceptación:** diferencia del borde derecho de folios **≤0,5 mm** en PDF y vista previa, número impreso igual al inicio real de sección, sin desbordamientos.

## Fase 3 — Página legal: plantilla de referencia fiel y reutilizable

A. Preserva y mejora `copyright-peru-classic-reference` en lugar de crear una plantilla inconexa. Distribuye derechos/reserva en la zona superior y título/autor/editorial/edición/depósito/contacto/impresión en zona inferior según la referencia, con márgenes medidos, espacios configurables y vista previa idéntica al PDF.
B. Campos automáticos tomados de metadatos guardados: título, autor o seudónimo, editor/responsable legal, dirección, ciudad, año, número de edición, ISBN, depósito legal y correo si existen. **No inventes ninguno.** No confundas titularidad de derechos con cumplimiento de trámites.
C. Panel de edición con autocompletar controlado, modo personalizado/manual, restablecimiento del preset, ayuda contextual, validaciones no destructivas, selector de licencia cuando corresponda y verificación de contraste tipográfico.
D. No impongas fórmulas legales universales; las plantillas deben permitir revisión. Mantén la distinción entre recomendación editorial y obligación jurídica.
E. Logotipo de sello editorial, crédito de cubierta, aviso de ficción, tiraje y crédito de imágenes opcionales, sin deformaciones ni casillas vacías.
**Aceptación:** edición y exportación de plantilla con datos completos e incompletos; no hay campos inventados ni páginas omitidas silenciosamente.

## Fase 4 — Dedicatoria, epígrafe y preliminares

A. La dedicatoria debe conservar los saltos de línea escritos, ser editable desde el manuscrito, configurable por plantilla, alineación, posición vertical y firma, y permanecer íntegra con cada actualización de perfil.
B. Plantilla de la captura: dedicatoria en el tercio superior alineada a la derecha, sin ornamentos obligatorios; guarda como preset identificable.
C. Si supera límites recomendados, mostrar avisos no destructivos y sugerir acomodación; jamás truncar el texto del autor.
D. Unifica estilos editoriales de portadilla, prólogo, epígrafe, agradecimientos, nota de autor y colofón, con páginas nuevas según reglas configuradas.
E. Interfaz con previsualización real y restauración segura.
**Aceptación:** posiciones estables y sin renglones cortados en formatos físicos habituales.

## Fase 5 — Letra capital con calidad de imprenta

A. Permitir activación global y por capítulo, opción de 2 o 3 líneas, familia disponible, separación horizontal razonable y excepciones al comienzo de diálogo o signos. Mantener distinción entre estilos editorialmente recomendados y configuraciones avanzadas.
B. Calcular grafema, puntuación conservada, tamaño, anchura, baseline, descendentes, sangría de las líneas afectadas, altura y ajuste a la primera línea real, de forma centralizada para paginación, preview y PDF.
C. Comprobar `«Aquella»`, `“Había”`, `—¿Quién…?`, `¡Hola!`, vocal acentuada, guion, emojis y ligaduras; no eliminar ningún carácter de la obra.
D. Revisar exportación DOCX/EPUB: el formato refluible debe preservar contenido y conseguir una inicial razonable allí donde sea compatible, sin prometer ubicación fija.
E. Prueba visual y extracción de texto: el primer párrafo exportado debe conservar exactamente su contenido al recomponer capitular y resto.
**Aceptación:** cero letras duplicadas, omitidas o superpuestas; fidelidad tipográfica del PDF comprobada.

## Fase 6 — Exportaciones: calidad, reproducción y recursos

A. Un único contrato para el modelo editorial compartido, con representaciones específicas por formato. PDF de pantalla/PDF de imprenta coinciden en geometría con vista previa, incluyendo encabezados, folios, márgenes espejo, saltos, imágenes y símbolos.
B. Para DOCX revisa ancho útil/tabulaciones dependientes del tamaño de página y `w:lines` de capitulares; ajusta la implementación según evidencia y validación en lectores. Para EPUB, navegación real, enlaces, estilo de capitulares y semántica sin folios físicos falsos.
C. Medir doble generación y diseñar alternativa viable en plan gratuito. Evaluar cache efímera protegida, entrega directa o proceso de una sola fase; cuidar permisos, caducidad, limpieza y privacidad. No guardar archivos de usuario sin política de retención.
D. Validar metadatos, hashes, imágenes, fuentes, caracteres Unicode, tamaños, pruebas impresoras y PDFs largos. No tratar un trabajo `COMPLETED` como descargable si el generador puede fallar por causas conocidas sin señalización.
E. Comparaciones automáticas: baseline screenshot → representación paginada del navegador y raster de PDF; tolerancias geométricas documentadas, además de comprobación de texto y estructura.
**Aceptación:** resultado estable, descarga correcta, sin cambios silenciosos y reducción medible de CPU/memoria si se decide optimizar.

## Fase 7 — Importador robusto y revisable

A. Audita `importer.ts`, `import-detection.ts`, `import-word.ts`, `import-pdf-layout.ts`, UI y `import-actions.ts`. Construye corpus realista de DOCX, EPUB 2/3 y PDF seleccionable, archivos corruptos, tablas, notas, prólogos, índices originales, encabezados repetidos, palabras partidas, capítulos largos y estilo mixto.
B. Clasifica secciones con reglas y puntajes explicables, muestras de texto por capítulo y avisos de baja confianza. El usuario debe poder unir/dividir, reclasificar, renombrar, excluir, corregir orden y **confirmar expresamente** antes de importar.
C. Preserva contenido y formato donde sea viable; en los casos no soportados emite avisos precisos y conserva el original en manos del usuario. Si añades imágenes de DOCX/EPUB, revisa licencias, seguridad ZIP, límites de tamaño y almacenamiento permitido. No actives OCR remoto por defecto.
D. Evita importaciones dobles/parciales, verifica huella, revalida en servidor y usa transacciones. No sobrepases la memoria en Render Free; analiza flujo streaming donde sea apropiado.
E. Permite archivos mayores solo tras benchmarks y defensas frente a ZIP bombs, XML malicioso, adjuntos excesivos y agotamiento de recursos.
**Aceptación:** datos originales preservados, estructura revisable y ninguna operación irreversible sin consentimiento.

## Fase 8 — Rendimiento, accesibilidad e interfaz intuitiva

A. Profila renderizado por plantilla, iteraciones del índice, lectura de secciones, React renders, consultas Prisma, uso de memoria y tiempos de generación.
B. Cache por contenido y usuario con aislamiento, invalidación segura y límites; no cachear información de un libro de un workspace en otro. Evita recomponer todo el manuscrito al tocar un control visual cuando una vista acotada sea suficiente.
C. Rediseña la pantalla editorial en dos paneles: controles claros a la izquierda y hoja fiel a la derecha, con plantillas visuales, advertencias accionables, cambios guardados y modo antes/después.
D. Estados vacíos y errores comprensibles, navegación de teclado, foco, contrastes, aria, móvil y zoom. No mostrar botones decorativos sin función.
E. Priorizar la experiencia de libros largos en Render Free; no introducir workers permanentes obligatorios o servicios de pago.
**Aceptación:** mejoras sustentadas en medidas antes/después; tests a11y y E2E de flujos críticos.

## Fase 9 — Auditoría transversal de seguridad y calidad

Revisar autenticación/sesiones, permisos de workspace y libro, CSRF/origen, Rate Limit, abuso de importación, carga de imágenes, SSRF, XSS en XHTML/XML/DOCX/EPUB, cookies, CSP, almacenamiento de revisiones, fuentes, URLs firmadas, exportación de registros, logs y errores públicos. Inspeccionar secretos en Git y dependencias. Respetar compatibilidad con Next/TypeScript/Prisma/pnpm declarados y migraciones existentes. Crear pruebas reproducibles sin producción ni datos reales.

## Fase 10 — Auditoría de cierre y bucle controlado

1. Ejecuta: `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm db:validate`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`, `pnpm build`, `pnpm test:e2e`, `pnpm validate:pdf`, `pnpm validate:docx`, `pnpm validate:epub`, `pnpm verify:preview-pdf`, si sus precondiciones están disponibles. Documenta _no ejecutado_ cuando aplique. Comprueba compatibilidad con versión Node y pnpm del repositorio.
2. Ejecuta corpus visual real y compara capturas de vista previa con PDF renderizado. Incluye escenarios con portada, dedicatoria y página legal de referencia, índice largo, letras capitales, capítulos reordenados y cambios de tipografía/márgenes.
3. Contrasta pruebas de integridad: cambios guardados, recuperación, versiones, autoría, seudónimo, enlaces internos, roles y exportaciones antiguas reproducibles.
4. Audita otra vez: funcionalidad, estructura, UX, maquetación, tipografía, índice, dedicatoria, legal, importación, exportación, rendimiento, seguridad, accesibilidad, calidad de pruebas y operación gratuita. Da notas 0–10 **con evidencia y límites**.
5. Si quedan errores críticos/altos verificables, regresa a la fase afectada, corrige, añade tests y repite. No reescribas módulos sanos. Si la meta de 9,5/10 no es defendible o no se ejecutaron pruebas, informa el resultado real: **está prohibido inventar el 9,5**.
6. Entrega resumen por fase, tabla de hallazgos antes/después, rutas modificadas, pruebas con cantidades reales, muestras visuales, diferencias de benchmarks, riesgos residuales, lista de pendientes y plan de despliegue en Render.
7. Realiza commits atómicos con mensajes descriptivos después de verificar cada fase. Haz `push` solo si tienes permisos y autorización para el repositorio, sin `force push`; detente ante conflictos y documenta cómo resolverlos.

## Indicadores de aceptación cuantificables

- **Contenido:** cero caracteres o bloques del manuscrito perdidos, duplicados o alterados por una transformación automática sin consentimiento.
- **Índice PDF:** folios con alineación derecha a ≤0,5 mm; 100 % coinciden con las páginas de inicio reales; títulos largos no invaden la columna.
- **Plantillas:** reproducibles en A5, 6×9 pulgadas y al menos otro formato admitido; sin texto fuera de caja ni colisiones. La referencia del usuario se usa como guía visual, no se finge una coincidencia de píxeles si el formato difiere.
- **Capitular:** pruebas de puntuación y Unicode, y coincidencia del texto íntegro extraído desde PDF respecto al origen.
- **Paridad PDF:** mismo número de páginas, saltos y disposición que la vista previa generada desde el mismo snapshot; validar mediante comparación visual y semántica.
- **Exportaciones:** cada formato debe abrirse en su validador/lector compatible; no se declaran aprobaciones sin ejecución real.
- **Importación:** reporte por archivo de contenido importado, simplificaciones, omisiones, límites y confianza de estructura, previo al guardado definitivo.
- **Rendimiento:** registrar p50/p95 de tiempos y memoria pico para libros de diferentes tamaños; no afirmar aceleraciones sin datos.
- **Seguridad:** ninguna operación editorial o de descarga cruza el límite de workspace; sin secretos en logs ni URLs inseguras.

**Formato obligatorio de respuesta final de la herramienta:** «Estado del repositorio», «Hallazgos críticos», «Qué se corrigió», «Pruebas ejecutadas y no ejecutadas», «Comparación visual de la plantilla legal, dedicatoria e índice», «Rendimiento antes/después», «Puntajes por área», «Riesgos pendientes», «Commits», «Estado del despliegue». Proporcionar evidencias, no solo afirmaciones.

**Empieza ahora por Fase 0 y Fase 1; continúa automáticamente por las demás mientras sea seguro y verificable.**

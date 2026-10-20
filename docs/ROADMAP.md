# Hoja de ruta

La hoja de ruta es deliberadamente secuencial. Cada fase debe quedar operativa,
probada y documentada antes de abrir la siguiente. No se implementan pantallas
simuladas para fases futuras.

## Fase 1 — Fundaciones y acceso privado

**Estado:** implementada y verificada. La migración inicial está aplicada en
PostgreSQL local y en Neon, y el flujo de instalación, acceso y panel se ha
verificado en navegador, tanto en las pruebas de extremo a extremo como en el
despliegue real.

Incluye:

- Monorepo pnpm con TypeScript estricto, ESLint, Prettier, Vitest y Playwright.
- Esquema PostgreSQL completo, migración inicial y constraints.
- Instalación inicial con `SETUP_TOKEN`.
- Login, logout, sesiones opacas, bloqueo de cuenta y limitación de intentos.
- Cambio de contraseña, revocación de sesiones y recuperación por CLI.
- Panel privado con datos reales, cuenta y auditoría.
- Firma de subidas Cloudinary.
- Health checks, CSP con nonce, cabeceras y blueprint de Render.
- Documentación de arquitectura, seguridad, base de datos y despliegue.

Criterio de cierre: build, lint, typecheck y pruebas unitarias en verde; una
migración real aplicada en una base de pruebas; flujo de instalación y login
verificado en navegador; `SETUP_TOKEN` eliminado tras la instalación.

Verificación registrada:

| Punto del criterio                                  | Estado                                                                                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build, lint, typecheck y pruebas unitarias en verde | Cumplido                                                                                                                                                 |
| Migración real aplicada en base de pruebas          | Cumplido: 16 tablas, 10 `CHECK`, 3 índices únicos parciales y trigger, comprobados con consultas de comportamiento                                       |
| Instalación y login verificados en navegador        | Cumplido: 16 pruebas E2E en Chromium y, además, en el despliegue real de Neon                                                                            |
| `SETUP_TOKEN` eliminado tras la instalación         | Corresponde a la operación: la ruta `/setup` queda cerrada por código en cuanto existe una cuenta, pero la variable debe retirarse del entorno de Render |

Fuera del alcance de la Fase 1 y sin bloquear su cierre: la subida real a
Cloudinary (la firma está implementada y verificada contra el vector publicado
por el proveedor, pero no se ha ejecutado una subida con credenciales
reales) y el envío de correo, que no existe en ninguna fase hasta que se
contrate un proveedor.

## Fase 2 — Biblioteca y manuscritos

Objetivo: crear libros reales y editar su estructura sin tocar todavía la
maquetación final.

Alcance previsto:

- CRUD de libros con metadatos validados.
- Estructura jerárquica de secciones (partes, capítulos, escenas).
- Editor Tiptap con extensiones controladas y guardado explícito.
- Revisiones inmutables, restauración como revisión nueva y autoguardado
  limitado.
- Recuento de palabras y progreso por libro.
- Búsqueda y filtros de biblioteca.
- Autorización por workspace y rol en cada consulta.

No incluye exportación ni maquetación.

**Estado: implementada y verificada.** La biblioteca, la estructura de
secciones, el editor, las revisiones y el progreso funcionan contra la
compilación de producción, con 27 pruebas de extremo a extremo.

Implementado:

- Biblioteca con búsqueda por título, autoría o género, filtro por estado y
  orden por modificación, título o extensión. Los filtros son un formulario
  `GET`: funcionan sin JavaScript y la URL es compartible.
- Alta y edición de metadatos con el esquema `bookMetadataSchema` existente.
- Ficha del libro con árbol de secciones, totales, progreso y cambio de
  estado limitado a las transiciones permitidas.
- Editor de manuscrito con Tiptap y extensiones controladas. El guardado es
  explícito; además hay un autoguardado acotado a una vez por minuto, y el
  servidor lo vuelve a limitar.
- Control de concurrencia por versión: si la sección cambió desde que el
  editor cargó el contenido, se pide recargar en lugar de pisar el trabajo de
  otra persona.
- Historial de revisiones inmutables. Restaurar una versión anterior la
  copia como una versión nueva; el trigger de la base de datos rechaza
  cualquier `UPDATE` sobre una revisión.
- Recuento de palabras y progreso derivados del contenido, nunca escritos a
  mano.
- Autorización por rol del espacio de trabajo en cada consulta y en cada
  mutación: `OWNER`/`ADMIN` escriben y eliminan, `EDITOR`/`AUTHOR` escriben,
  `REVIEWER` solo lee.

Fuera de alcance y pendiente para fases posteriores: búsqueda a texto completo
dentro del manuscrito, arrastrar y soltar para reordenar, subida de imágenes
dentro del texto, notas, comentarios editoriales, maqueta y exportación.

## Fase 3 — Escritura asistida y notas

Objetivo: herramientas de trabajo diario para autoría y edición.

Alcance previsto:

- Notas privadas por libro y sección.
- Objetivos de escritura y estadísticas por periodo.
- Comentarios editoriales y flujo de revisión.
- Historial de cambios con comparación de revisiones.
- Atajos de teclado y preferencias de escritura.

**Estado: implementada y verificada.** Las notas, los objetivos, las
estadísticas, los comentarios editoriales, el flujo de revisión y el
comparador de revisiones funcionan contra la compilación de producción, con
37 pruebas de extremo a extremo.

Implementado:

- Notas privadas por libro, anclables a una sección y fijables. Cada consulta
  y cada mutación filtran por `userId`: nadie puede leer ni borrar la nota de
  otra persona aunque conozca su identificador. Se borran en cascada lógica
  (`deletedAt`), sin perder el histórico.
- Objetivos de palabras por periodo, propios de cada persona y opcionalmente
  anclados a un libro. El objetivo por libro sigue viviendo en
  `books.targetWordCount`.
- Estadísticas por periodo **derivadas del historial de revisiones**: las
  palabras escritas son la diferencia entre cada revisión y la anterior de su
  sección. No hay tabla de actividad, de modo que las cifras no pueden
  desviarse del manuscrito real. Editar no cuenta como escribir: solo se
  suman las diferencias positivas.
- Comentarios editoriales visibles para todo el espacio de trabajo, a
  diferencia de las notas, que son privadas. Se anclan a un libro y,
  opcionalmente, a una sección, y se resuelven o reabren.
- Flujo de revisión: enviar a revisión, pedir cambios y aprobar. **Aprobar
  exige que no queden comentarios abiertos**, que es la garantía de que la
  edición ha sido tenida en cuenta. Aprobar queda reservado a `OWNER`, `ADMIN`
  y `EDITOR`; publicar y resolver comentarios, a los roles de escritura.
- Comparador de revisiones por palabras (subsecuencia común más larga) con
  el texto añadido resaltado y el eliminado tachado. El diff se calcula en el
  servidor: el cliente no carga dos versiones completas del manuscrito. Por
  encima de 4 000 palabras por versión se devuelve una sustitución completa,
  porque el coste cuadrático deja de ser aceptable.
- Preferencias de escritura (tamaño de letra, interlineado y modo
  concentración) guardadas en el navegador, no en el servidor: son ajustes de
  quien escribe y no viajan a ningún sitio. Se leen con `useSyncExternalStore`
  para no desajustar la hidratación.
- Atajo `Ctrl`/`Cmd`+`S` en el editor para guardar el manuscrito, que evita el
  diálogo de «guardar página» del navegador.

Fuera de alcance y pendiente para fases posteriores: notas compartidas entre
personas, menciones y notificaciones de comentarios, objetivos por proyecto
(no por periodo), plantillas de objetivos y comparador entre libros.

Verificación registrada:

| Punto del criterio                                                  | Estado                                                                                                                                                                                         |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build, lint, typecheck y pruebas unitarias en verde                 | Cumplido: 117 pruebas unitarias en 17 archivos, `lint` y `typecheck` limpios                                                                                                                   |
| Migración real aplicada en base de pruebas                          | Cumplido: 18 tablas, 14 `CHECK` y el enum `CommentStatus`, comprobados con consultas de comportamiento (los 4 casos inválidos fallan y los 2 válidos pasan)                                    |
| Migración aplicada en Neon                                          | Cumplido: `20261020180000_add_writing_goals_and_comments` aplicada y registrada en `_prisma_migrations` con el checksum del archivo; definiciones de las restricciones idénticas a las locales |
| Notas, objetivos, estadísticas, comentarios y revisión en navegador | Cumplido: 37 pruebas E2E en Chromium contra la compilación de producción                                                                                                                       |
| Comparación de revisiones                                           | Cumplido: diff por palabras con subsecuencia común más larga, verificado en unitarias y en E2E                                                                                                 |

## Fase 4 — Maquetación

Objetivo: convertir el manuscrito en una maqueta interior coherente.

Alcance previsto:

- Perfiles de página con geometría validada por `editorial-engine`.
- Plantillas editoriales y estilos tipográficos.
- Numeración, encabezados, folios, aperturas de capítulo y páginas pares.
- Vista previa paginada en el navegador.
- Diagnóstico de desbordes, viudas, huérfanas y líneas demasiado largas.

**Estado: implementada y verificada.** La maquetación se compone contra la
compilación de producción, con 46 pruebas de extremo a extremo. No ha hecho
falta migración: el modelo de datos (`LayoutProfile`, `EditorialTemplate` y
`BookEdition`) se preparó en la Fase 1 y esta fase lo pone en uso.

Implementado:

- **Perfiles de página** por espacio de trabajo: tamaño, márgenes interior y
  exterior, medianil, sangrado y distancias de encabezado y pie. La geometría
  se valida con `validateLayoutGeometry` **antes** de escribir: un perfil con
  márgenes que se comen el área de texto no llega a guardarse, y el motivo se
  explica en la interfaz.
- **Plantillas editoriales** de sistema (Novela, Ensayo, Poesía y Manual) y
  propias de cada estudio. Una plantilla define el estilo: cuerpo, títulos,
  cita, sangría de primera línea y control de viudas y huérfanas. Se instalan
  de forma idempotente la primera vez que se abre la maquetación.
- **Motor de paginación** en `editorial-engine`: mide el texto con un modelo
  de anchos medios por tipo de carácter, parte los párrafos en líneas y
  compone las páginas **por altura**, de modo que conviven en la misma página
  un cuerpo de 11 pt y un título de 20 pt.
- **Aperturas de capítulo en página par**: si el capítulo caería en una página
  impar, se inserta una página en blanco y se avisa en el diagnóstico.
- **Folios y encabezados de página**: el folio numerado correlativamente (con
  número inicial configurable) y el encabezado con el título de la sección o
  con el texto que fije la plantilla, que admite los marcadores `{libro}` y
  `{capitulo}`. Los márgenes se reflejan en páginas pares e impares.
- **Vista previa paginada a escala real**: un milímetro del perfil es un
  milímetro en pantalla (96 dpi), comprobado con una prueba que mide la
  geometría en el navegador. Las líneas se dibujan tal como las decidió el
  motor, con el texto justificado y la última línea suelta.
- **Diagnóstico de composición**: viudas, huérfanas, desbordes, palabras más
  anchas que la caja de texto y páginas en blanco insertadas, cada uno con su
  página y su explicación.

Fuera del alcance y pendiente para fases posteriores: paginación con métricas
reales de la fuente, que corresponde a la exportación, generación de PDF,
cubiertas y contraportadas, y ajustes de línea por sección.

Verificación registrada:

| Punto del criterio                                  | Estado                                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Build, lint, typecheck y pruebas unitarias en verde | Cumplido: 155 pruebas unitarias en 19 archivos, `lint` y `typecheck` limpios                                                             |
| Geometría validada por el motor                     | Cumplido: un perfil con márgenes que consumen todo el ancho se rechaza con un motivo explícito, comprobado en el navegador               |
| Vista previa paginada a escala real                 | Cumplido: la prueba mide la geometría en el navegador y comprueba que un milímetro del perfil es un milímetro en pantalla                |
| Diagnóstico de composición                          | Cumplido: viudas, huérfanas, desbordes y palabras más anchas que la caja se detectan y se explican con su página                         |
| Sin migración de datos                              | Cumplido: el modelo de datos se preparó en la Fase 1; las plantillas de sistema se instalan de forma idempotente al abrir la maquetación |
| Maquetación en el navegador                         | Cumplido: 46 pruebas E2E en Chromium contra la compilación de producción                                                                 |

## Fase 5 — Exportación

Objetivo: generar archivos utilizables por imprenta y distribución digital.

Alcance previsto:

- PDF digital y PDF de impresión con marcas y sangrado.
- EPUB 3 validado.
- DOCX cuando el flujo editorial lo requiera.
- Cola de trabajos idempotente, sin workers permanentes en Render Free.
- Metadatos de resultado y descarga firmada.

**Estado: implementada y verificada.** La exportación genera archivos reales
—PDF, EPUB y DOCX— que se descargan desde el propio navegador, con 56 pruebas
de extremo a extremo. No ha hecho falta migración: el modelo `ExportJob` se
preparó en la Fase 1.

Implementado:

- **PDF digital y PDF de imprenta** escritos sin dependencias externas, con las
  fuentes estándar (Times-Roman, Times-Bold y Times-Italic), que no hay que
  incrustar. El PDF de imprenta lleva la caja acabada (`TrimBox`), la caja de
  sangre (`BleedBox`), la caja de recorte (`CropBox`) y las marcas de corte y
  de registro fuera de la hoja acabada. El texto se compone con el mismo motor
  de paginación que la vista previa, de modo que el archivo y la pantalla
  cuentan las mismas páginas.
- **EPUB 3**: paquete completo con `mimetype` sin comprimir y en primer lugar,
  `META-INF/container.xml`, el paquete OPF con sus metadatos, la navegación
  (`nav.xhtml`) y un capítulo XHTML por sección.
- **DOCX**: paquete de Word con tipos de contenido, relaciones, estilos,
  propiedades y el documento con los saltos de página respetados.
- **Cola idempotente y sin worker**: la clave de un trabajo es el formato más
  la huella del manuscrito, así que pedir dos veces la misma exportación
  devuelve el mismo trabajo en lugar de generar dos archivos. El trabajo se
  genera en el momento en que se pide o en el de la descarga: **no hay ningún
  proceso permanente** que consuma el plan de Render.
- **Exportaciones reproducibles**: el trabajo guarda las versiones de las
  secciones que exportó. Como las revisiones son inmutables, el archivo se
  regenera byte a byte aunque el manuscrito haya cambiado después.
- **Metadatos de resultado**: tamaño, huella SHA-256, número de páginas,
  palabras y secciones del archivo generado.
- **Descarga firmada**: exige sesión y una firma HMAC de diez minutos, de modo
  que la dirección caduca y no sirve para siempre. La clave es
  `EXPORT_SIGNING_SECRET`; si no se define, se deriva de las credenciales de
  la base de datos, que ya son un secreto.

Fuera del alcance y pendiente para fases posteriores: incrustación de fuentes
reales en el PDF, que daría una paginación exacta y un justificado fiel;
PDF/X con salida preflight; control de color y perfil de imprenta; y
exportaciones por lotes de varios libros.

Verificación registrada:

| Punto del criterio                                  | Estado                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Build, lint, typecheck y pruebas unitarias en verde | Cumplido: 187 pruebas unitarias en 22 archivos, `lint` y `typecheck` limpios                                             |
| PDF digital y de imprenta                           | Cumplido: los dos se generan y se descargan; el de imprenta lleva `TrimBox`, `BleedBox`, `CropBox` y las marcas de corte |
| EPUB 3 válido                                       | Cumplido: `mimetype` sin comprimir y en primer lugar, contenedor, OPF, navegación y un XHTML por sección                 |
| DOCX                                                | Cumplido: paquete de Word con tipos de contenido, relaciones, estilos y documento                                        |
| Cola idempotente y sin worker                       | Cumplido: pedir dos veces la misma exportación reutiliza el trabajo; no hay ningún proceso permanente                    |
| Descarga firmada                                    | Cumplido: sin sesión o con una firma caducada la descarga se rechaza con `401` o `403`                                   |
| Metadatos de resultado                              | Cumplido: tamaño, huella SHA-256, páginas, palabras y secciones del archivo generado                                     |

`workers/export-worker` **sigue sin ser necesario**: la exportación bajo
demanda no requiere ningún proceso permanente. El directorio queda reservado
para el caso en que una fase posterior necesite un trabajo largo en segundo
plano, y no debe convertirse en un proceso que consuma el plan Free sin
control.

## Fase 6 — Equipo y gobernanza

Objetivo: incorporar más personas sin perder privacidad ni trazabilidad.

Alcance previsto:

- Invitaciones y alta de cuentas por administración.
- Roles por workspace y permisos comprobados en servidor.
- Asignación de secciones y comentarios.
- Registro de auditoría ampliado y exportación.
- Política de retención y borrado.

## Fase 7 — Operación editorial

Objetivo: cubrir el ciclo completo de un libro.

Alcance previsto:

- Cubiertas, contraportada y lomo con validación de dimensiones.
- Pruebas de imprenta y control de versiones de edición.
- Catálogo interno y estados de publicación.
- Copias de seguridad verificadas y restauración ensayada.
- Endurecimiento final: MFA, revisión de dependencias y monitorización.

## Reglas permanentes

- Ninguna fase introduce datos de demostración en producción.
- Ninguna acción de la interfaz puede ser un botón sin efecto.
- Las migraciones se revisan y se aplican de forma controlada.
- Los secretos viven en el entorno, nunca en el repositorio.
- Las funciones que dependan de un plan de pago se documentan como tales o no
  se implementan.
- La privacidad de los manuscritos es un requisito, no una opción de diseño.

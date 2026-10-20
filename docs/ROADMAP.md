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

## Fase 4 — Maquetación

Objetivo: convertir el manuscrito en una maqueta interior coherente.

Alcance previsto:

- Perfiles de página con geometría validada por `editorial-engine`.
- Plantillas editoriales y estilos tipográficos.
- Numeración, encabezados, folios, aperturas de capítulo y páginas pares.
- Vista previa paginada en el navegador.
- Diagnóstico de desbordes, viudas, huérfanas y líneas demasiado largas.

## Fase 5 — Exportación

Objetivo: generar archivos utilizables por imprenta y distribución digital.

Alcance previsto:

- PDF digital y PDF de impresión con marcas y sangrado.
- EPUB 3 validado.
- DOCX cuando el flujo editorial lo requiera.
- Cola de trabajos idempotente, sin workers permanentes en Render Free.
- Metadatos de resultado y descarga firmada.

`workers/export-worker` queda reservado para este límite. No debe convertirse en
un proceso permanente que consuma el plan Free sin control.

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

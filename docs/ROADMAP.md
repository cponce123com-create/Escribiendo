# Hoja de ruta

La hoja de ruta es deliberadamente secuencial. Cada fase debe quedar operativa,
probada y documentada antes de abrir la siguiente. No se implementan pantallas
simuladas para fases futuras.

## Fase 1 — Fundaciones y acceso privado

**Estado:** implementada; verificación de base de datos y extremo a extremo
pendiente de un entorno con PostgreSQL.

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

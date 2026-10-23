# Base de datos

ESCRIBIENDO usa PostgreSQL 16+ (Neon en producción) y Prisma 6.19. El esquema
completo está en `packages/database/prisma/schema.prisma`.

## Variables

| Variable       | Uso                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | Conexión de la aplicación. En Neon debe apuntar al host con `-pooler` e incluir `pgbouncer=true` y un `connection_limit` bajo (2–3).                 |
| `DIRECT_URL`   | Conexión directa para migraciones y scripts. La usa `prisma migrate deploy` automáticamente gracias a `directUrl`. No debe incluir `pgbouncer=true`. |

Ambas deben usar TLS (`sslmode=require`). No se versiona ninguna credencial.

## Migraciones

Las migraciones están versionadas en:

```text
packages/database/prisma/migrations/
├─ migration_lock.toml
├─ 20261020120000_init/                            # Fase 1: esquema completo
├─ 20261020180000_add_writing_goals_and_comments/  # Fase 3: escritura asistida
├─ 20261020190000_add_team_governance/             # Fase 6: equipo y gobernanza
├─ 20261021210000_session_workspace/               # Espacio de trabajo en sesión
└─ 20261022120000_add_story_tools/                 # Planificación, personajes y mundos
```

La segunda migración es **aditiva**: crea el enum `CommentStatus` y las tablas
`writing_goals` y `editorial_comments`, con sus índices y claves foráneas. No
modifica ni elimina ningún objeto de la migración inicial, de modo que puede
aplicarse sobre una base ya productive sin riesgo.

Estado actual de las migraciones:

| Migración                                       | Local     | Neon      |
| ----------------------------------------------- | --------- | --------- |
| `20261020120000_init`                           | Sí        | Sí        |
| `20261020180000_add_writing_goals_and_comments` | Sí        | Sí        |
| `20261020190000_add_team_governance`            | Sí        | Sí        |
| `20261021210000_session_workspace`              | Sí        | Sí        |
| `20261022120000_add_story_tools`                | Pendiente | Pendiente |

La migración de herramientas de historia está creada y validada contra el
esquema, pero todavía no se ha aplicado a ninguna base de datos: hay que
ejecutar `pnpm db:migrate` con las credenciales de Neon antes de desplegar el
código.

La migración de la Fase 3 se aplicó en Neon con la API SQL por HTTPS, dentro
de un bloque `DO` transaccional y registrando la fila en `_prisma_migrations`
con el checksum SHA-256 del archivo, que es el mismo valor que calcula
`prisma migrate deploy`. Comprobado además que las definiciones de las cuatro
restricciones en Neon son idénticas a las de la base local.

La migración de la Fase 6 se aplicó en Neon con el mismo procedimiento, y sus
dos restricciones se comprobaron con consultas de comportamiento: una
invitación que caduca antes de crearse y una que está aceptada y revocada a la
vez son rechazadas.

Aplicar migraciones pendientes (producción, CI o local):

```bash
pnpm db:validate
pnpm db:migrate:status   # migraciones pendientes
pnpm db:migrate
pnpm db:status           # comprobación final
```

`db:migrate` ejecuta `prisma migrate deploy`, que:

1. Usa `DIRECT_URL` (o `DATABASE_URL` si `DIRECT_URL` no existe).
2. Aplica en orden las migraciones no registradas en `_prisma_migrations`.
3. No genera cambios nuevos ni borra datos.
4. Falla de forma segura si una migración ya aplicada fue modificada.

**No uses `prisma db push` en producción.** No registra historial y puede
provocar pérdida de datos o deriva del esquema.

### Comprobar el estado antes y después de migrar

`pnpm db:status` es una comprobación de solo lectura que no modifica nada:

```bash
pnpm db:status
```

Informa de si la base de datos responde, de cuántas tablas de la aplicación
existen, de cuántas migraciones están aplicadas y de cuántas cuentas hay. Es el
comando que hay que ejecutar **antes** de desplegar y **después** de migrar.

También comprueba las **columnas concretas** que necesita el código
(`sessions.workspaceId`, `export_jobs.idempotencyKey`, `books.writingProgress`,
`story_plan_items.kind`, `story_characters.role` y `story_worlds.kind`). Si
falta alguna, termina con error y la nombra:

```
✗ Faltan columnas que la aplicación necesita: sessions.workspaceId.
  Aplica las migraciones con `pnpm db:migrate`.
```

Tener solo las tablas no basta: una base a la que le falta una columna responde
y supera un `SELECT 1`, pero la aplicación falla al leerla.

Además, comprueba que `DATABASE_URL` y `DIRECT_URL` apuntan al mismo endpoint
de Neon (proyecto, rama, región y base de datos). Si no coinciden, la
migración se aplicaría a una base de datos distinta de la que usa la
aplicación, y el síntoma sería exactamente «the table `public.users` does not
exist». Es la causa más habitual de ese error.

`pnpm db:migrate:status` es el comando oficial de Prisma para listar las
migraciones pendientes y su estado respecto a la base de datos.

Si la base responde pero no tiene las tablas, el motivo es que las migraciones
no están aplicadas:

```text
✗ La base de datos está vacía: no hay ninguna tabla de la aplicación.
  Aplica las migraciones con `pnpm db:migrate`.
```

Ese es el fallo que provoca el error `P2021` («the table `public.users` does
not exist») y que hace que `/login` no pueda completarse.

### Cuando la aplicación no puede completar una consulta

Las páginas de acceso (`/login` y `/setup`) comprueban el estado de la base de
datos antes de consultar la sesión. Si la base de datos no está disponible, la
página **no** muestra un error genérico, sino la causa concreta:

| Estado         | Causa                                       | Qué hacer                                                                                   |
| -------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `not-migrated` | Faltan las tablas (`P2021`, `P2022`)        | `pnpm db:validate` y `pnpm db:migrate` contra la misma base                                 |
| `unavailable`  | No hay conexión (`P1000`, `P1001`, `P1002`) | Revisar `DATABASE_URL`, que el proyecto de Neon esté activo y las credenciales sean válidas |

En ambos casos el error original se registra en el log del servidor con su
código y su mensaje, y la página muestra un identificador de petición
(`requestId`) para correlacionar ambos.

### Crear una migración

En desarrollo, con una base local desechable:

```bash
pnpm db:migrate:create --name nombre_del_cambio
```

Revisa siempre el SQL generado. El esquema contiene objetos que Prisma no
representa (trigger de inmutabilidad, `CHECK`, índices parciales y comentarios).
Si una migración generada intenta eliminar esos objetos, retíralos del SQL o
reconstruye la migración con:

```bash
pnpm --filter @escribiendo/database exec prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

El resultado debe revisarse a mano antes de convertirlo en migración. Nunca se
edita una migración ya aplicada shared: se crea una nueva.

### Validación sin base de datos

`prisma validate` exige que las variables existan aunque no se conecte. En CI
puedes usar valores ficticios:

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/escribiendo" \
DIRECT_URL="postgresql://user:pass@localhost:5432/escribiendo" \
pnpm db:validate
```

En PowerShell:

```powershell
$env:DATABASE_URL="postgresql://user:pass@localhost:5432/escribiendo"
$env:DIRECT_URL="postgresql://user:pass@localhost:5432/escribiendo"
pnpm db:validate
```

## Objetos adicionales de la migración inicial

Además de las tablas y relaciones de Prisma, la migración crea:

- `CHECK` para conteos no negativos, progreso entre 0 y 100, versiones
  positivas, dimensiones de página positivas y márgenes no negativos.
- Índice único parcial: una sola edición predeterminada por libro.
- Índice único parcial: un solo perfil de maqueta predeterminado y no borrado
  por workspace.
- Índice único parcial: slugs únicos para plantillas de sistema sin workspace.
- Trigger `section_revisions_immutable` que rechaza cualquier `UPDATE` en
  `section_revisions` con SQLSTATE `23001`.

Consecuencias prácticas:

- Restaurar una revisión **inserta una revisión nueva**; nunca actualiza la
  existente.
- Para cambiar la edición predeterminada, primero desmarca la anterior y marca
  la nueva dentro de una transacción.
- Los borrados lógicos de secciones conservan las revisiones; no se debe
  ejecutar `DELETE` físico de secciones si se quiere preservar el historial.

## Objetos adicionales de la migración de escritura asistida

La migración de la Fase 3 añade, además de las tablas y sus índices:

- `CHECK writing_goals_target_words_positive`: un objetivo de palabras debe ser
  mayor que cero.
- `CHECK writing_goals_period_valid`: el periodo debe terminar después de
  empezar.
- `CHECK editorial_comments_body_not_empty`: un comentario sin texto no es un
  comentario.
- `CHECK editorial_comments_resolution_consistent`: el estado y la marca de
  resolución no pueden contradecirse: `OPEN` sin fecha y `RESOLVED` con fecha.

Estas restricciones defienden la integridad aunque alguien escriba en la base
de datos por fuera de la aplicación.

Dos decisiones de modelado que conviene no confundir:

- `books.targetWordCount` es el objetivo **por libro**. `writing_goals` es el
  objetivo **por periodo** de una persona, y puede anclarse a un libro
  (`bookId`) o ser general del estudio (`bookId` nulo).
- No hay tabla de actividad. Las palabras escritas en un periodo se derivan
  del historial de revisiones, comparando cada revisión con la anterior de su
  sección. Así las estadísticas no pueden desviarse del manuscrito real.

## Objetos de la maquetación

La Fase 4 **no ha añadido ninguna migración**: el modelo de datos se preparó en
la Fase 1 y esta fase lo pone en uso.

- `layout_profiles`: la geometría de la página (tamaño, márgenes, medianil,
  sangrado, distancias de encabezado y pie) y la tipografía en
  `typographyConfig`. El índice único parcial
  `layout_profiles_one_default_per_workspace_key` garantiza un solo perfil
  predeterminado por espacio de trabajo.
- `editorial_templates`: el estilo editorial. `workspaceId` nulo identifica
  las plantillas de sistema, que son las mismas para todos los estudios; el
  índice `editorial_templates_system_slug_key` evita que dos plantillas de
  sistema compartan `slug`.
- `book_editions`: la unión de un perfil y una plantilla para un libro. Es lo
  que hace la vista previa paginada.

Las plantillas de sistema se instalan en la base de datos de forma idempotente
la primera vez que se abre la maquetación de un estudio, no con una migración:
son un catálogo cerrado que acompaña al código y cambia con él.

## Trabajos de exportación

La Fase 5 **no ha añadido ninguna migración**: la tabla `export_jobs` se
preparó en la Fase 1 con lo que la exportación necesita.

- `idempotency_key`: el formato más la huella del manuscrito. Es lo que hace
  la cola idempotente: pedir dos veces la misma exportación devuelve el mismo
  trabajo en lugar de generar dos archivos.
- `manuscript_hash`: la huella del contenido de las secciones. Si el
  manuscrito cambia, la huella cambia y el trabajo es otro.
- `section_versions`: las versiones de las secciones que se exportaron. Como
  las revisiones son inmutables, el archivo se puede regenerar byte a byte
  aunque el manuscrito haya cambiado después.
- `result_metadata`: tamaño, huella SHA-256, número de páginas, palabras y
  secciones del archivo generado.
- `options`: el nombre del archivo y su tipo de medio.

El archivo **no se guarda en la base de datos**: se genera en el momento de la
descarga. Es lo que evita tener que almacenar binarios y lo que permite
exportar sin un proceso permanente.

## Equipo y gobernanza

La migración `20261020190000_add_team_governance` es **aditiva** y añade:

- La tabla `workspace_invitations`: invitaciones de acceso, con el rol
  propuesto, la huella del token (`tokenHash`, nunca el token en claro), la
  fecha de caducidad y las marcas de aceptación y revocación.
  - `CHECK workspace_invitations_expires_after_creation`: una invitación no
    puede caducar antes de crearse.
  - `CHECK workspace_invitations_not_accepted_and_revoked`: no puede estar
    aceptada y revocada a la vez.
- `book_sections.assigneeId`: la persona responsable del trabajo de la
  sección. Al borrarse la persona, la asignación se anula (`ON DELETE SET
NULL`): el trabajo no se pierde.
- `editorial_comments.assigneeId`: lo mismo para los comentarios.

Los índices que acompañan a las columnas nuevas evitan el recorrido completo
de la tabla al listar por responsable.

## Herramientas de historia

La migración `20261022120000_add_story_tools` es **aditiva** y crea tres tablas
para la biblia de la historia:

- `story_plan_items`: ideas, actos, capítulos, escenas y secuencias. Tiene
  `kind` (`ACT`, `CHAPTER`, `SCENE`, `SEQUENCE`, `OTHER`), `status` (`IDEA`,
  `PLANNED`, `WRITING`, `DONE`) y un resumen libre.
- `story_characters`: fichas de personaje con papel (`PROTAGONIST`,
  `ANTAGONIST`, `SECONDARY`, `MENTOR`, `LOVE_INTEREST`, `OTHER`), edad, oficio,
  descripción, personalidad, motivación, conflicto, arco y notas.
- `story_worlds`: lugares, culturas, organizaciones, sistemas, objetos,
  acontecimientos y otras reglas del mundo, con descripción, reglas y notas.

Las tres comparten las mismas decisiones:

- `workspaceId` es obligatorio y aísla los datos entre estudios.
- `bookId` es opcional: permiten tanto material de un libro concreto como ideas
  generales del estudio.
- `createdById` se conserva con `ON DELETE SET NULL` para no perder la autoría
  si se elimina una cuenta.
- El borrado es lógico (`deletedAt`); las consultas y mutaciones siempre
  filtran por el espacio de trabajo y por `deletedAt` nulo.
- Escribir exige el permiso `story:manage` (propietario, administración,
  edición y autoría). El rol de lectura editorial puede consultar, pero no
  modificar.

Cada mutación deja un registro de auditoría (`STORY_*`) sin copiar el contenido
completo de la ficha.

## Modelo y convenciones

- UUID en todas las claves primarias (`@db.Uuid`).
- Correos normalizados a minúsculas antes de insertar. La restricción `UNIQUE`
  es sensible a mayúsculas, pero la aplicación evita la ambigüedad.
- Fechas en `timestamptz` (Prisma `DateTime`).
- Borrado lógico mediante `deletedAt` en usuarios, espacios, libros, secciones,
  perfiles, plantillas, assets, notas, comentarios editoriales, planificación,
  personajes y mundos.
- Los libros y secciones usan `onDelete: Cascade` solo para limpiezas
  administrativas; la aplicación prevé borrado lógico.
- Las revisiones y la auditoría restringen el borrado del usuario creador
  (`onDelete: Restrict` / `SetNull`).
- Las notas son privadas de su autora: toda consulta y mutación filtra por
  `userId`. Los comentarios editoriales, en cambio, son visibles para todo el
  espacio de trabajo.

## Sesiones y limpieza

La sesión guarda el espacio de trabajo con el que se está trabajando
(`sessions.workspaceId`). Quien pertenece a varios estudios cambia de uno a
otro desde la barra lateral; si deja de pertenecer al que tenía guardado, la
sesión recurre al primero que le quede.

Las sesiones caducadas no se eliminan automáticamente. En una sola instancia
Free no suponen un problema inmediato, pero conviene limpiarlas de forma
periódica desde un equipo de confianza:

```sql
DELETE FROM sessions
WHERE expires_at < now() - interval '30 days';

DELETE FROM password_reset_tokens
WHERE expires_at < now() - interval '30 days';
```

No ejecutes estas consultas desde la aplicación en cada petición. Si en el
futuro se añade un cron, debe ser externo y explícito, no un worker permanente.

`pnpm db:status` informa del tamaño de las tablas más grandes y comprueba que
siguen existiendo los índices parciales de unicidad (una edición predeterminada
por libro, un perfil predeterminado por estudio y un slug único por plantilla
de sistema). Estos índices solo existen en las migraciones: si una migración
futura los recompone, se perderían en silencio, y el script avisa.

## Recuperación de contraseña por CLI

```bash
pnpm admin:password-reset -- cuenta@ejemplo.com
pnpm admin:password-reset -- cuenta@ejemplo.com --revoke-sessions
pnpm admin:password-reset -- cuenta@ejemplo.com --ttl-minutes=30
```

El script:

- Carga `.env` de la raíz.
- Usa `DATABASE_URL` o `DIRECT_URL`.
- Invalida los enlaces pendientes del usuario.
- Guarda solo SHA-256 del token nuevo.
- Registra la emisión en `audit_logs` con actor nulo.
- Imprime una sola vez la URL construida con `APP_URL`.
- Opcionalmente revoca todas las sesiones.

No existe envío de correo. El enlace debe entregarse por un canal privado.

## Copias de seguridad

Neon Free ofrece su propia retención; confirma el periodo vigente en el panel.
Además, antes de cambios importantes, exporta una copia lógica desde un equipo
de confianza:

```bash
pg_dump "$DIRECT_URL" --format=custom --no-owner --no-acl --file=escribiendo-$(date +%Y%m%d).dump
```

Restauración en una base vacía:

```bash
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname="$DIRECT_URL" escribiendo-20261020.dump
```

Nunca ejecutes `pg_restore --clean` sobre la base de producción sin una copia
verificada y una ventana de mantenimiento.

## Conexiones y Render Free

- `DATABASE_URL` debe usar el pooler de Neon y `connection_limit=3` como máximo.
- Prisma mantiene un cliente singleton por proceso.
- Las migraciones usan `DIRECT_URL` y no deben ejecutarse en el arranque del
  servicio web.
- Si Render reinicia la instancia, las conexiones se recrean; Neon libera las
  antiguas.
- `/api/health/ready` comprueba la base con un `SELECT 1` y devuelve `503` si no
  responde.

### Sondas de salud: viva y disponibilidad

Hay dos endpoints con propósitos distintos:

- `/api/health` — **viva**. Responde `200` mientras el proceso sea capaz de
  atender peticiones. Es el `healthCheckPath` de Render: si la base de datos
  falla, la aplicación sigue viva, porque el fallo está en un componente
  externo y reiniciar el proceso no lo arregla.
- `/api/health/ready` — **disponibilidad**. Devuelve `503` con
  `database: "unavailable"` si la base de datos no responde.

El health check de Render apunta a `/api/health` a propósito. Apuntarlo a
`/api/health/ready` haría que una caída temporal de Neon marcara el servicio
como no disponible y bloqueara un despliegue posterior.

Para vigilar la base de datos desde fuera, consulta `/api/health/ready`.

## Datos de demostración

No hay seeds ni datos ficticios. La primera cuenta se crea desde `/setup` con
`SETUP_TOKEN`. Cualquier dato que aparezca en la aplicación debe haber sido
creado por una persona real o por una migración explícita y revisada.

## Revisión de integridad v6.1

`sql/audit-section-integrity.sql` contiene consultas de diagnóstico, sin reparación automática. `sql/proposed-section-constraints.sql` es una propuesta fuera de Prisma Migrate y no debe ejecutarse como migración de despliegue. Necesita análisis de datos, ensayo de bloqueos y restricciones en PostgreSQL desechable, respaldo y revisión previa. La auditoría v6.1 enumera las comprobaciones todavía pendientes. No se han modificado los checksums de las migraciones existentes.

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

La migración inicial está versionada en:

```text
packages/database/prisma/migrations/
├─ migration_lock.toml
└─ 20261020120000_init/
   └─ migration.sql
```

Aplicar migraciones pendientes (producción, CI o local):

```bash
pnpm db:validate
pnpm db:migrate
```

`db:migrate` ejecuta `prisma migrate deploy`, que:

1. Usa `DIRECT_URL` (o `DATABASE_URL` si `DIRECT_URL` no existe).
2. Aplica en orden las migraciones no registradas en `_prisma_migrations`.
3. No genera cambios nuevos ni borra datos.
4. Falla de forma segura si una migración ya aplicada fue modificada.

**No uses `prisma db push` en producción.** No registra historial y puede
provocar pérdida de datos o deriva del esquema.

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

## Modelo y convenciones

- UUID en todas las claves primarias (`@db.Uuid`).
- Correos normalizados a minúsculas antes de insertar. La restricción `UNIQUE`
  es sensible a mayúsculas, pero la aplicación evita la ambigüedad.
- Fechas en `timestamptz` (Prisma `DateTime`).
- Borrado lógico mediante `deletedAt` en usuarios, espacios, libros, secciones,
  perfiles, plantillas, assets y notas.
- Los libros y secciones usan `onDelete: Cascade` solo para limpiezas
  administrativas; la aplicación prevé borrado lógico.
- Las revisiones y la auditoría restringen el borrado del usuario creador
  (`onDelete: Restrict` / `SetNull`).

## Sesiones y limpieza

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

## Datos de demostración

No hay seeds ni datos ficticios. La primera cuenta se crea desde `/setup` con
`SETUP_TOKEN`. Cualquier dato que aparezca en la aplicación debe haber sido
creado por una persona real o por una migración explícita y revisada.

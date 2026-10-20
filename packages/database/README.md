# @escribiendo/database

Paquete de persistencia de ESCRIBIENDO.

- Esquema canónico: `prisma/schema.prisma`.
- Cliente singleton: `src/client.ts`.
- Las migraciones son la única vía admitida para modificar producción.
- `prisma db push` no se utiliza en este proyecto.

Los comandos se ejecutan desde la raíz del repositorio para que Prisma cargue el
archivo `.env` raíz:

```bash
pnpm db:generate
pnpm db:validate
pnpm db:migrate
```

`DATABASE_URL` debe apuntar al endpoint agrupado de Neon. `DIRECT_URL` debe
apuntar al endpoint directo y se usa para migraciones.

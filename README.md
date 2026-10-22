# ESCRIBIENDO

Plataforma editorial privada de **EDITORIAL NO PARA TODOS**.

ESCRIBIENDO reúne escritura, edición, maquetación y preparación de archivos de
imprenta en un único espacio de trabajo. Este repositorio contiene las
**Fases 1 a 6**: cimientos técnicos, acceso privado, modelo de datos editorial,
integración firmada con Cloudinary, preparación de despliegue en Render,
biblioteca y manuscrito, herramientas de escritura asistida, maquetación con
vista previa paginada, exportación a PDF, EPUB y DOCX y gobierno del equipo.

> No hay registro público. El acceso se crea una sola vez mediante `/setup` y
> un token de instalación de alta entropía. Después, solo un administrador
> puede crear cuentas.

---

## Estado

| Área                                                  | Estado                                |
| ----------------------------------------------------- | ------------------------------------- |
| Monorepo pnpm y TypeScript estricto                   | Implementado                          |
| Esquema PostgreSQL/Prisma completo                    | Implementado; migraciones versionadas |
| Autenticación Argon2id + sesiones opacas              | Implementado                          |
| Instalación inicial protegida por token               | Implementado                          |
| Recuperación de contraseña sin proveedor de correo    | Implementado mediante CLI             |
| Panel privado y gestión de cuenta                     | Implementado                          |
| Biblioteca de libros con búsqueda y filtros           | Implementado (Fase 2)                 |
| Manuscrito con Tiptap, revisiones y progreso          | Implementado (Fase 2)                 |
| Notas privadas, objetivos y estadísticas              | Implementado (Fase 3)                 |
| Comentarios editoriales y flujo de revisión           | Implementado (Fase 3)                 |
| Comparador de revisiones y preferencias de escritura  | Implementado (Fase 3)                 |
| Maquetación: perfiles, plantillas y vista previa      | Implementado (Fase 4)                 |
| Exportación: PDF, EPUB y DOCX con descarga firmada    | Implementado (Fase 5)                 |
| Equipo: invitaciones, roles, asignaciones y auditoría | Implementado (Fase 6)                 |
| Cloudinary: firma de subida directa                   | Implementado                          |
| Cabeceras de seguridad y CSP con nonce                | Implementado                          |
| Health checks y blueprint de Render                   | Implementado                          |
| Pruebas unitarias, de esquema y de extremo a extremo  | Implementado                          |

La aplicación **no incluye datos de demostración, botones simulados ni
credenciales de ejemplo**. Si una integración no está configurada, la interfaz
lo indica y la API responde con un error explícito.

---

## Stack

- **Runtime:** Node.js 24.20.0, pnpm 12.14.0
- **Aplicación:** Next.js 16 (App Router), React 19, TypeScript 5.9 estricto
- **Estilos:** Tailwind CSS 4 con un sistema de diseño editorial propio
- **Base de datos:** PostgreSQL en Neon, Prisma 6.19 y Prisma Migrate
- **Validación:** Zod 4
- **Contraseñas:** Argon2id mediante `@node-rs/argon2`
- **Imágenes:** Cloudinary con subida directa firmada
- **Calidad:** ESLint, Prettier, Vitest y Playwright

No se utilizan Redis, workers permanentes ni servicios de pago. El despliegue
previsto es Render Free, Neon Free y Cloudinary Free.

---

## Estructura

```text
escribiendo/
├─ apps/web/                    # Aplicación Next.js
│  └─ src/
│     ├─ app/                   # Rutas, layouts y API
│     ├─ components/            # Componentes de interfaz
│     ├─ lib/
│     │  ├─ auth/               # Sesiones, contraseñas, acciones
│     │  ├─ books/              # Biblioteca, secciones, revisiones
│     │  ├─ writing/            # Notas, objetivos y estadísticas
│     │  ├─ review/             # Comentarios editoriales y flujo de revisión
│     │  ├─ layout/             # Perfiles de página, plantillas y maqueta
│     │  ├─ team/               # Miembros, invitaciones, asignaciones y auditoría
│     │  ├─ export/             # Cola de trabajos, generación y descarga
│     │  ├─ cloudinary/         # Firma de subidas
│     │  ├─ security/           # Origen, CSRF, rate limit, contexto
│     │  └─ env.ts              # Validación del entorno
│     └─ proxy.ts               # CSP con nonce y request ID
├─ packages/
│  ├─ database/                 # Prisma Client, esquema y migraciones
│  ├─ book-schema/              # Documento Tiptap, metadatos y diff
│  ├─ editorial-engine/         # Geometría, tipografía y paginación
│  ├─ export-engine/            # Escritores de PDF, EPUB y DOCX
│  ├─ shared/                   # Validaciones y utilidades compartidas
│  └─ templates/                # Plantillas editoriales
├─ workers/export-worker/       # Reservado: la exportación es bajo demanda
├─ scripts/                     # Administración por CLI
├─ tests/e2e/                   # Pruebas de extremo a extremo
└─ docs/                        # Arquitectura, seguridad, despliegue, etc.
```

`packages/templates` contiene las plantillas editoriales y
`workers/export-worker` se documenta como límite explícito de una fase
posterior: la exportación de la Fase 5 es bajo demanda y no necesita ningún
proceso permanente. Ninguno de los dos contiene funciones simuladas.

---

## Puesta en marcha

### 1. Requisitos

- Node.js 24.20.0 (recomendado: `.nvmrc` / `.node-version`)
- pnpm 12.14.0 (`corepack enable` o instalación global)
- Una base PostgreSQL. Para desarrollo local puede servir PostgreSQL 16+; para
  producción se utiliza Neon.

### 2. Instalar dependencias

```bash
pnpm install --frozen-lockfile
```

### 3. Configurar el entorno

PowerShell:

```powershell
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Bash:

```bash
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Coloca el valor generado en `SETUP_TOKEN` y completa `DATABASE_URL` y
`DIRECT_URL`. Consulta [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) para obtener las
URLs correctas de Neon y [docs/DATABASE.md](docs/DATABASE.md) para el flujo de
migraciones.

### 4. Aplicar migraciones

```bash
pnpm db:status      # Comprueba conexión y migraciones (solo lectura)
pnpm db:validate
pnpm db:migrate
```

`pnpm db:migrate` ejecuta `prisma migrate deploy` (migraciones ya versionadas).
Para crear una migración durante el desarrollo:

```bash
pnpm db:migrate:create
```

`pnpm db:status` informa de si la base de datos responde, de cuántas tablas
existen, de cuántas migraciones están aplicadas, de cuántas cuentas hay y de
si el **esquema está al día**. Comprueba las columnas concretas que necesita el
código y, si falta alguna, la nombra y termina con error. Es imprescindible
ejecutarlo **antes** de desplegar: si las migraciones no están aplicadas, la
aplicación arranca pero ninguna página que consulte la base de datos puede
completarse.

Cuando el código es más nuevo que la base de datos, la aplicación lo dice en
vez de dejar un «error de interfaz»: aparece un aviso de **migración
pendiente** con el comando exacto, y `/api/health/ready` responde `503` con
`"schema": "outdated"`. En ese caso, `pnpm db:migrate` y recargar. Las
migraciones son aditivas: no borran datos.

Los comandos `db:*` se ejecutan desde la raíz del repositorio: la CLI de
Prisma busca el archivo `.env` en el directorio de trabajo actual y, sin el
envoltorio de `scripts/prisma.ts`, no encontraría el de la raíz.

### 5. Arrancar

```bash
pnpm dev
```

Abre `http://localhost:3000/setup`, introduce el `SETUP_TOKEN` y crea la primera
cuenta. Esa cuenta recibe el rol `SUPERADMIN` y un espacio de trabajo propio.
Después de completar la instalación, **elimina `SETUP_TOKEN` del entorno**: la
ruta `/setup` deja de estar operativa en cuanto existe una cuenta.

---

## Comandos

| Comando                                           | Descripción                                          |
| ------------------------------------------------- | ---------------------------------------------------- |
| `pnpm dev`                                        | Genera Prisma Client y arranca Next.js en desarrollo |
| `pnpm build`                                      | Genera Prisma Client y compila la aplicación         |
| `pnpm start`                                      | Sirve la compilación de producción                   |
| `pnpm lint`                                       | ESLint sobre todo el monorepo                        |
| `pnpm typecheck`                                  | TypeScript en todos los paquetes                     |
| `pnpm test`                                       | Pruebas unitarias con Vitest                         |
| `pnpm test:e2e`                                   | Pruebas Playwright (requiere base de datos dedicada) |
| `pnpm format` / `format:check`                    | Prettier                                             |
| `pnpm db:validate`                                | Valida el esquema Prisma                             |
| `pnpm db:generate`                                | Genera Prisma Client                                 |
| `pnpm db:migrate`                                 | Aplica migraciones (`migrate deploy`)                |
| `pnpm db:migrate:create`                          | Crea una migración en desarrollo                     |
| `pnpm db:migrate:status`                          | Muestra las migraciones pendientes                   |
| `pnpm db:status`                                  | Comprueba conexión y migraciones (solo lectura)      |
| `pnpm db:studio`                                  | Abre Prisma Studio                                   |
| `pnpm admin:password-reset -- correo@ejemplo.com` | Emite un enlace de recuperación de un solo uso       |
| `pnpm retention:clean`                            | Aplica la política de retención de datos             |

Las pruebas de extremo a extremo vacían la base de datos configurada en
`DATABASE_URL`. El script se niega a ejecutarse si el nombre de la base no
contiene «test». Consulta [docs/TESTING.md](docs/TESTING.md).

---

## Acceso y seguridad

- Sin registro público. `/setup` solo funciona mientras no exista ningún usuario
  y `SETUP_TOKEN` esté configurado.
- Contraseñas de 12–128 caracteres con Argon2id (19 MiB, 3 iteraciones,
  paralelismo 1), comparación en tiempo constante y rehash automático.
- Sesiones opacas de 256 bits; en la base de datos solo se guarda SHA-256 del
  token. Cookies `HttpOnly`, `SameSite=Lax`, `Secure` en producción y prefijo
  `__Host-` en producción.
- Bloqueo de cuenta tras cinco fallos durante 15 minutos, además de un límite
  en memoria por IP.
- Server Actions con comprobación de origen y CSP estricta con nonce.
- Auditoría sin contenido de manuscritos, contraseñas ni tokens.
- Cloudinary: el secreto nunca llega al navegador; solo se emite una firma para
  parámetros predefinidos.

Los detalles y las limitaciones conocidas están en
[docs/SECURITY.md](docs/SECURITY.md).

---

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Seguridad](docs/SECURITY.md)
- [Base de datos](docs/DATABASE.md)
- [Despliegue en Render, Neon y Cloudinary](docs/DEPLOYMENT.md)
- [Pruebas](docs/TESTING.md)
- [Hoja de ruta](docs/ROADMAP.md)

---

## Licencia

Código privado y no licenciado. © EDITORIAL NO PARA TODOS. Todos los derechos
reservados.

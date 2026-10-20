# Despliegue: Neon, Cloudinary y Render

Esta guía describe el despliegue de la Fase 1 con planes gratuitos. No se
asume ninguna característica de pago.

## Resumen

```text
1. Crear proyecto y base en Neon.
2. Crear cuenta y credenciales en Cloudinary (opcional para Fase 1).
3. Crear el servicio web en Render a partir del repositorio.
4. Configurar variables de entorno.
5. Aplicar migraciones desde un equipo de confianza.
6. Desplegar y comprobar /api/health y /api/health/ready.
7. Crear la primera cuenta en /setup.
8. Eliminar SETUP_TOKEN y redesplegar.
```

---

## 1. Neon

1. Crea una cuenta en <https://neon.tech> y un proyecto PostgreSQL en la región
   más cercana a Render (por ejemplo, Frankfurt si el servicio está en
   `frankfurt`).
2. En **Connection Details**, copia dos cadenas:
   - **Pooled connection**: host con `-pooler`. Es `DATABASE_URL`.
   - **Direct connection**: host sin `-pooler`. Es `DIRECT_URL`.
3. Añade los parámetros necesarios:
   - `DATABASE_URL`: `?sslmode=require&pgbouncer=true&connection_limit=3&connect_timeout=15`
   - `DIRECT_URL`: `?sslmode=require`
4. Verifica que la base esté vacía o que solo contenga datos que puedas
   conservar.

Ejemplo de forma (los valores son ficticios):

```text
DATABASE_URL=postgresql://usuario:clave@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=3&connect_timeout=15
DIRECT_URL=postgresql://usuario:clave@ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

No publiques estas URLs. Neon Free puede suspender el cómputo por inactividad;
la primera petición tras la suspensión puede tardar unos segundos.

### Migraciones

Desde tu equipo, con `.env` apuntando a Neon y `DIRECT_URL` correcta:

```bash
pnpm install --frozen-lockfile
pnpm db:status
pnpm db:validate
pnpm db:migrate
pnpm db:status
```

`pnpm db:status` comprueba, sin modificar nada, si la base de datos responde y
si tiene el esquema aplicado. **Ejecuta `pnpm db:migrate` antes de dar por
bueno un despliegue**: sin migraciones aplicadas, la aplicación arranca pero
todas las páginas que consultan la base de datos fallan.

`pnpm db:migrate` ejecuta `prisma migrate deploy`. Aplica la migración inicial
versionada, incluidas las constraints y el trigger de inmutabilidad.

Los comandos `db:*` de la raíz usan `scripts/prisma.ts`, un envoltorio que
fija el directorio de trabajo en la raíz del repositorio. Es necesario porque
la CLI de Prisma busca los archivos `.env` en el directorio de trabajo actual y
la CLI vive en `packages/database`: sin el envoltorio, el `.env` de la raíz no
se encontraría. En Render no hay archivo `.env`; las variables llegan del panel
y tienen prioridad.

No ejecutes migraciones automáticamente en el arranque de Render Free. Un fallo
de base durante un reinicio no debe mezclarse con el ciclo de vida del servicio
web.

---

## 2. Cloudinary

Cloudinary es opcional para arrancar la Fase 1, pero es necesario para la firma
de subidas.

1. Crea una cuenta en <https://cloudinary.com> y entra en el dashboard.
2. Copia **Cloud name**, **API Key** y **API Secret**.
3. Configura:
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
   - `CLOUDINARY_UPLOAD_FOLDER` (por defecto `escribiendo`)
4. No uses una API key pública ni una upload preset sin firma. El endpoint
   `/api/cloudinary/signature` firma parámetros restringidos en el servidor.
5. Revisa los límites de tu plan Free en el panel de Cloudinary. La aplicación
   no promete almacenamiento ni transformaciones ilimitadas.

Las tres variables de Cloudinary deben estar presentes a la vez. Si falta una,
la aplicación considera la configuración inválida y evita firmar.

La interfaz de subida de cubiertas pertenece a una fase posterior. En Fase 1 el
endpoint existe, está autenticado y puede probarse con una sesión válida.

---

## 3. Render

El repositorio incluye `render.yaml` (Blueprint). Ajusta el nombre del servicio,
la rama y la región antes de usarlo.

### Crear el servicio con Blueprint

1. Sube el repositorio a GitHub/GitLab.
2. En Render, **New → Blueprint** y selecciona el repositorio.
3. Revisa el servicio `escribiendo`. El plan es `free`.
4. Render pedirá los valores de las variables `sync: false`.
5. Despliega.

### Crear el servicio manualmente

Si no usas Blueprint:

- **Runtime:** Node
- **Plan:** Free
- **Build Command:**

  ```bash
  npm install --global pnpm@12.14.0 --no-fund --no-audit &&
  pnpm install --frozen-lockfile --prod=false &&
  pnpm db:generate &&
  pnpm --filter @escribiendo/web build
  ```

- **Start Command:**

  ```bash
  pnpm --filter @escribiendo/web start
  ```

- **Health Check Path:** `/api/health`
- **Node version:** 24.20.0 (variable `NODE_VERSION` o `.node-version`)

`--prod=false` es importante: el build necesita TypeScript, Prisma CLI y
Tailwind, que están en `devDependencies`.

### Variables de entorno en Render

| Variable                   | Obligatoria      | Valor                               |
| -------------------------- | ---------------- | ----------------------------------- |
| `NODE_VERSION`             | Sí               | `24.20.0`                           |
| `NODE_ENV`                 | Sí               | `production`                        |
| `APP_URL`                  | Sí               | URL pública exacta, sin barra final |
| `DATABASE_URL`             | Sí               | Pooled de Neon                      |
| `DIRECT_URL`               | Sí               | Directa de Neon                     |
| `SETUP_TOKEN`              | Solo instalación | Token de 32+ caracteres             |
| `SESSION_TTL_DAYS`         | No               | `14`                                |
| `LOG_LEVEL`                | No               | `info`                              |
| `CLOUDINARY_CLOUD_NAME`    | No               | Dashboard de Cloudinary             |
| `CLOUDINARY_API_KEY`       | No               | Dashboard de Cloudinary             |
| `CLOUDINARY_API_SECRET`    | No               | Dashboard de Cloudinary             |
| `CLOUDINARY_UPLOAD_FOLDER` | No               | `escribiendo`                       |
| `NEXT_TELEMETRY_DISABLED`  | No               | `1`                                 |

`APP_URL` debe coincidir con el origen real. Si no coincide, las Server Actions
rechazan las peticiones por origen.

### Primer despliegue

1. Genera el token de instalación:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   ```

2. Aplícale las migraciones a Neon (paso 1).
3. Configura `APP_URL` y `SETUP_TOKEN`, además de las URLs de base.
4. Despliega.
5. Comprueba:
   - `GET https://tu-servicio.onrender.com/api/health` → `200`
   - `GET https://tu-servicio.onrender.com/api/health/ready` → `200` con
     `database: "ok"`
6. Abre `/setup`, introduce el token y crea la primera cuenta.
7. Comprueba que puedes entrar al panel y a `/account`.
8. Elimina `SETUP_TOKEN` del panel de Render y redespliega.
9. Guarda el enlace de recuperación de la cuenta en un lugar seguro o verifica
   que puedes emitir uno con el CLI.

### Cold starts

Render Free suspende el servicio por inactividad. La primera petición puede
tardar decenas de segundos. El health check de Render puede fallar durante el
arranque; espera a que el servicio esté disponible antes de concluir que hay un
error de configuración.

No uses Render Free como única copia de seguridad. Exporta Neon periódicamente.

---

## 4. Verificación posterior al despliegue

```bash
curl -i https://tu-servicio.onrender.com/api/health
curl -i https://tu-servicio.onrender.com/api/health/ready
curl -i https://tu-servicio.onrender.com/robots.txt
```

Comprueba también en el navegador:

- `/login` carga con estilos y tema claro/oscuro.
- `/setup` redirige a `/login` si ya existe una cuenta.
- Una ruta privada sin sesión no muestra contenido privado y acaba en
  `/login`. La respuesta llega con estado `200` y una redirección en el
  cliente, porque el shell HTML se emite antes de resolver la sesión; el
  contenido privado nunca se envía. Está explicado en
  [SECURITY.md](SECURITY.md#protección-de-las-rutas-privadas).
- La consola no muestra errores de CSP.
- El formulario de login rechaza credenciales incorrectas sin filtrar si la
  cuenta existe.
- `/account` permite cambiar la contraseña y revocar otras sesiones.
- La cookie de sesión es `HttpOnly` y `Secure` en producción.

---

## 5. Actualizaciones

1. Aplica y revisa la migración en local.
2. Haz una copia de Neon.
3. Ejecuta `pnpm db:migrate` contra Neon desde un equipo de confianza.
4. Despliega el nuevo código en Render.
5. Verifica `/api/health/ready` y el flujo de login.

Las migraciones son **forward-only**. Un rollback de código no revierte el
esquema automáticamente. Si un despliegue falla, primero restaura el servicio
anterior y decide si hace falta una migración correctiva o una restauración de
la base.

---

## 6. Límites del plan gratuito

| Recurso                   | Límite                   | Consecuencia en ESCRIBIENDO                                                                                                 |
| ------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Instancias                | 1                        | El rate limit en memoria cubre la instancia completa. Al escalar habría que sustituirlo por un almacén compartido.          |
| Disco                     | Ninguno                  | No hay almacenamiento local. Las imágenes van a Cloudinary y el texto a Neon.                                               |
| Suspensión                | Por inactividad          | La primera petición tras la suspensión puede tardar decenas de segundos. El health check puede fallar durante el arranque.  |
| Conexiones                | Compartidas              | `DATABASE_URL` usa el pooler de Neon con `connection_limit=3` y `pgbouncer=true`.                                           |
| Procesos en segundo plano | No hay worker permanente | Las exportaciones de la Fase 5 se ejecutarán a demanda desde el servicio web, no con un worker continuo.                    |
| Cron                      | No incluido              | No se programan tareas recurrentes. Si una fase lo necesita, habrá que plantearlo como una acción disparada por el usuario. |
| PostgreSQL                | Neon Free                | Neon puede suspender el cómputo por inactividad. Exporta copias periódicamente.                                             |

El blueprint `render.yaml` no declara ningún servicio de base de datos, ningún
worker y ningún disco: el único recurso es el servicio web.

---

## 7. Diagnóstico rápido

| Síntoma                                                       | Comprobación                                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| La página muestra error de configuración                      | `DATABASE_URL`, `APP_URL` y longitud de `SETUP_TOKEN`                                          |
| `/api/health/ready` devuelve 503                              | Neon suspendido, URL incorrecta o pool agotado                                                 |
| `/login` dice «La base de datos no tiene el esquema aplicado» | Faltan las migraciones: `pnpm db:status` y `pnpm db:migrate`                                   |
| `/login` dice «No se puede conectar con la base de datos»     | `DATABASE_URL` incorrecta, credenciales no válidas o proyecto de Neon suspendido               |
| Login responde «no se ha podido validar la solicitud»         | `APP_URL` no coincide con el origen real                                                       |
| `/setup` está deshabilitado                                   | No existe usuario, pero falta `SETUP_TOKEN`; o ya existe un usuario                            |
| Cloudinary responde 503                                       | Faltan una o más variables del trío                                                            |
| El build de Render falla por TypeScript                       | Falta `--prod=false` en `pnpm install`                                                         |
| El build de Render falla con «Environment variable not found» | Falta `DATABASE_URL` en el panel de Render; `prisma generate` la exige                         |
| Error `Cannot find native binding` de Argon2                  | Se instaló con una plataforma distinta; revisa el lockfile y el runtime Linux de Render        |
| La página se ve sin estilos tras un error global              | Verifica que `/global-error.css` sea accesible y que la CSP permita `style-src 'self'`         |
| `Environment variable not found: DIRECT_URL`                  | El `.env` de la raíz no se está cargando; usa los comandos `db:*` de la raíz, que lo resuelven |
| La aplicación no arranca tras copiar `.env.example`           | Deja en blanco las variables opcionales; una cadena vacía equivale a «no configurada»          |
| El servicio responde `404` con `x-render-routing: no-server`  | No hay instancia: despliegue en curso, fallido o servicio eliminado. Revisa el panel de Render |

Los logs estructurados incluyen `requestId`. Úsalo para correlacionar una
petición con los errores de Render.

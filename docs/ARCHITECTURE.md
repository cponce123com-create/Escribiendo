# Arquitectura

## Principios

ESCRIBIENDO es un **monolito modular** con una única aplicación Next.js y
paquetes internos con responsabilidades delimitadas. La prioridad de la Fase 1
es que cada pieza exista de verdad: sin servicios simulados, sin datos de
demostración y sin dependencias que exijan planes de pago.

Decisiones estructurales:

- **Server-first.** Las páginas protegidas se renderizan en el servidor y
  verifican la sesión antes de consultar datos.
- **TypeScript estricto.** `strict`, `noUncheckedIndexedAccess` y
  `isolatedModules` están activos en todo el monorepo.
- **Paquetes por dominio, no por capa.** `book-schema` entiende el documento
  editorial; `editorial-engine` entiende geometría de página; `database`
  encapsula Prisma.
- **Sin estado de sesión en el cliente.** El navegador solo posee una cookie
  opaca `HttpOnly`; no hay JWT legible ni datos de autorización en JavaScript.
- **Límites honestos.** Las secciones de fases posteriores se muestran como
  tales y no como botones que no hacen nada.

## Topología de ejecución

```text
Navegador
   │  HTTPS
   ▼
Render Free (una instancia Next.js)
   │            │
   │            └── Cloudinary (subida directa firmada, opcional)
   ▼
Neon PostgreSQL (pooled para la app, directa para migraciones)
```

No hay Redis, colas, cron jobs ni workers permanentes. Cualquier trabajo
pesado futuro deberá diseñarse para ejecutarse bajo demanda o en un servicio
externo, respetando las limitaciones de Render Free.

## Estructura del monorepo

```text
apps/web
├─ src/app
│  ├─ (auth)/login, /setup, /reset-password
│  ├─ (app)/dashboard, /account, /notes, /stats
│  ├─ (app)/books            # Biblioteca, alta, ficha, edición
│  ├─ (app)/books/[bookId]/notes       # Notas privadas del libro
│  ├─ (app)/books/[bookId]/review      # Comentarios y flujo de revisión
│  ├─ (app)/books/[bookId]/layout      # Perfiles de página y maqueta
│  ├─ (app)/books/[bookId]/preview     # Vista previa paginada
│  ├─ (app)/books/[bookId]/export      # Exportación a PDF, EPUB y DOCX
│  ├─ (app)/books/[bookId]/sections/[sectionId]/history  # Historial y comparador
│  ├─ api/health, /api/health/ready, /api/cloudinary/signature
│  ├─ api/exports/[jobId]/download  # Descarga firmada del archivo
│  ├─ api/audit/export             # Exportación de la auditoría
│  ├─ error.tsx, global-error.tsx, not-found.tsx, loading.tsx
│  └─ layout.tsx, page.tsx, robots.ts, manifest.ts
├─ src/components
│  ├─ app/          # Shell privado
│  ├─ auth/         # Formularios de acceso
│  ├─ account/      # Formularios de cuenta
│  ├─ books/        # Biblioteca, editor, revisiones
│  ├─ writing/      # Notas, objetivos, preferencias de escritura
│  ├─ review/       # Comentarios editoriales y flujo de revisión
│  ├─ layout/       # Perfiles de página, maqueta y vista previa
│  ├─ export/       # Cola de trabajos, generación y descarga firmada
│  ├─ forms/        # Campos y botones reutilizables
│  ├─ brand/        # Marca
│  └─ theme/        # Conmutador claro/oscuro
├─ src/lib
│  ├─ auth/         # Sesiones, contraseñas, tokens, acciones
│  ├─ books/        # Biblioteca, secciones, revisiones, permisos
│  ├─ writing/      # Notas, objetivos y estadísticas
│  ├─ review/       # Comentarios editoriales y comparación de revisiones
│  ├─ layout/       # Perfiles, plantillas, edición y vista previa
│  ├─ cloudinary/   # Firma de subidas
│  ├─ security/     # Origen, CSRF, rate limit, contexto
│  └─ ui/           # Formato de fechas, roles y agentes
└─ src/proxy.ts     # Nonce CSP + request ID

packages/database        Prisma Client + esquema + migraciones
packages/shared          Validaciones comunes y errores de formulario
packages/book-schema     Documento Tiptap, metadatos, extracción de texto, diff
packages/editorial-engine Formatos de página, tipografía y motor de paginación
packages/templates       Plantillas editoriales de sistema y propias
packages/export-engine   Escritores de PDF, EPUB y DOCX
workers/export-worker    Límite reservado para exportación
```

## Flujo de una petición

1. `apps/web/src/proxy.ts` genera un `requestId` y un nonce criptográfico,
   construye la CSP y la añade tanto a la petición como a la respuesta.
2. El layout raíz lee el nonce desde las cabeceras y lo aplica al script de
   inicialización del tema. No hay scripts inline sin nonce.
3. Las rutas públicas `(auth)` comprueban la sesión y el estado de instalación.
4. Las rutas privadas `(app)` llaman a `requireSession()`. Si no hay sesión,
   redirigen a `/login`.
5. Las Server Actions validan el origen de la petición (`Origin` contra
   `APP_URL`/host), aplican rate limiting y validan los datos con Zod.
6. Las consultas se ejecutan con Prisma usando el workspace de la sesión.

### Renderizado dinámico

El layout raíz declara `dynamic = "force-dynamic"` porque la CSP depende de un
nonce por petición y las páginas privadas dependen de cookies. Esto es
intencionado: no se sirven páginas autenticadas desde caché estática.

## Autenticación y sesiones

```text
POST /login (Server Action)
  ├─ validar origen
  ├─ rate limit por IP
  ├─ verificar Argon2id
  ├─ aplicar bloqueo persistente tras 5 fallos
  ├─ crear token aleatorio de 32 bytes
  ├─ guardar SHA-256(token) en sessions
  └─ cookie HttpOnly __Host-escribiendo_session
```

- El token de sesión nunca se guarda en claro.
- La cookie usa `SameSite=Lax`, `HttpOnly`, `Secure` en producción y nombre
  `__Host-` en producción.
- La sesión se valida contra PostgreSQL en cada petición; `getSession` está
  memoizada por petición con `cache()`.
- Cambiar la contraseña revoca las demás sesiones en la misma transacción.
- El restablecimiento consume el token de forma atómica (`updateMany` con
  `usedAt: null`) y revoca todas las sesiones.

### Instalación inicial

`/setup` solo está disponible mientras `users` esté vacío y `SETUP_TOKEN` esté
definido. La comprobación se repite dentro de una transacción Serializable para
evitar dos instalaciones concurrentes. La cuenta creada recibe `SUPERADMIN` y
un workspace con membresía `OWNER`.

### Recuperación sin correo

La Fase 1 no contrata proveedor de correo. El script
`scripts/admin-password-reset.ts` emite un enlace de un solo uso. El token se
muestra una sola vez por consola y en la base de datos solo queda su SHA-256.
Esto es una limitación deliberada y documentada, no una función simulada.

## Modelo de datos

El esquema completo vive en `packages/database/prisma/schema.prisma`.

| Dominio     | Tablas principales                                        | Notas                                                     |
| ----------- | --------------------------------------------------------- | --------------------------------------------------------- |
| Identidad   | `users`, `sessions`, `password_reset_tokens`              | Correos normalizados; borrado lógico; bloqueo persistente |
| Espacios    | `workspaces`, `workspace_members`                         | Propiedad y roles por espacio                             |
| Biblioteca  | `books`, `book_sections`, `section_revisions`             | Estructura jerárquica; revisiones inmutables              |
| Ediciones   | `book_editions`, `layout_profiles`, `editorial_templates` | Geometría, formato y configuración de maqueta             |
| Recursos    | `assets`, `book_assets`                                   | Cloudinary como único proveedor en Fase 1                 |
| Exportación | `export_jobs`                                             | Cola idempotente; el archivo se genera al descargar       |
| Escritura   | `writing_notes`                                           | Notas privadas por usuario/libro/sección                  |
| Auditoría   | `audit_logs`                                              | Sin contenido de manuscritos ni secretos                  |

Decisiones del esquema:

- Todos los identificadores son UUID.
- Los borrados de libros, workspace y perfiles son lógicos (`deletedAt`).
  Las revisiones y los hijos de un libro se conservan.
- `section_revisions` tiene un trigger PostgreSQL que rechaza `UPDATE`.
  Restaurar una versión debe crear una fila nueva.
- Hay índices parciales para un único perfil de maqueta predeterminado por
  workspace y una única edición predeterminada por libro.
- Las constraints `CHECK` protegen conteos, progreso y geometría incluso frente
  a escrituras manuales.

La migración inicial documenta todo esto en
`packages/database/prisma/migrations/20261020120000_init/migration.sql`.

## Paquetes editoriales

### `@escribiendo/book-schema`

- Valida documentos Tiptap con Zod, con límites de profundidad, nodos y bytes.
- Extrae texto plano preservando acentos y evitando inventar espacios entre
  marcas.
- Cuenta palabras en español, incluidas formas con guion y apóstrofo.
- Define metadatos de libro y tipos de sección.

### `@escribiendo/editorial-engine`

- Presets de página en milímetros (A4, A5, B5, pulgadas, bolsillo).
- Conversión mm/puntos.
- Validación geométrica: márgenes que caben en la caja de página, gutter,
  sangrado y distancias de encabezado/pie.
- Configuración tipográfica por clase de bloque, con valores por defecto.
- Medición del texto y motor de paginación: reparte el manuscrito en páginas y
  avisa de viudas, huérfanas y desbordes.

### `@escribiendo/export-engine`

- Escritor de PDF sin dependencias externas, con las fuentes tipográficas
  incrustadas (`Type0`/`CIDFontType2`, `ToUnicode` y tabla de anchos real) y las
  cajas de recorte, sangre y `TrimBox`.
- Lector de fuentes TrueType (`cmap`, `hmtx`, `name`, `OS/2`, `post`) para
  medir con las métricas reales y codificar el texto con `Identity-H`.
- Escritor de ZIP, que sirve para el EPUB y para el DOCX.
- Escritor de EPUB 3 y de DOCX.

La paginación del PDF usa el motor de `@escribiendo/editorial-engine`, de modo
que el archivo y la vista previa cuentan las mismas páginas.

## Cloudinary

El navegador nunca recibe `CLOUDINARY_API_SECRET`.

```text
Cliente autenticado
  └─ POST /api/cloudinary/signature
       ├─ valida origen y sesión
       ├─ rate limit por usuario
       ├─ fija folder, timestamp y formatos permitidos
       └─ devuelve firma SHA-1 + parámetros
  └─ POST directo a api.cloudinary.com
```

La carpeta sale del entorno (`CLOUDINARY_UPLOAD_FOLDER`) y del espacio de
trabajo de la sesión, nunca de un valor enviado por el cliente. La ruta
responde `503` si Cloudinary no está configurado; no hay subida simulada.

## Decisiones deliberadas

| Decisión                                      | Motivo                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Prisma 6.19 en lugar de Prisma 7              | `directUrl` y el flujo de migraciones con Neon están estables y documentados; Prisma 7 se evaluará en una actualización planificada |
| Sesiones en base de datos en lugar de JWT     | Revocación inmediata, auditoría y sin secretos de firma adicionales                                                                 |
| `proxy.ts` de Next 16                         | Sustituye a `middleware.ts` y permite CSP con nonce por petición                                                                    |
| Rate limit en memoria + bloqueo en PostgreSQL | Sin Redis ni coste extra; el bloqueo persistente sobrevive a reinicios                                                              |
| Sin correo en Fase 1                          | Evita prometer entregas que no existen; el CLI es explícito                                                                         |
| Subida directa a Cloudinary                   | No consume memoria ni ancho de banda del servidor Render Free                                                                       |
| Migraciones manuales                          | Render Free no debe reiniciar la app esperando una migración; se ejecuta `migrate deploy` de forma controlada                       |
| Exportación bajo demanda, sin worker          | Un proceso permanente consumiría el plan Free; el archivo se genera al pedirlo o al descargarlo                                     |
| Escritores de PDF, EPUB y DOCX propios        | Sin dependencias pesadas ni procesos externos; el formato se puede verificar byte a byte en las pruebas                             |
| Descarga firmada de corta duración            | La dirección se puede compartir unos minutos y luego deja de servir; el archivo nunca se guarda en un sitio accesible               |

## Límites actuales

- La biblioteca, el editor, el versionado del manuscrito y la exportación a
  PDF, EPUB y DOCX **sí existen** y están verificados; lo que sigue abierto es
  lo que se detalla en [AUDIT_BASELINE_95.md](AUDIT_BASELINE_95.md): la
  cobertura Unicode más allá de latín, griego y cirílico, la validación con
  Word y LibreOffice, la subida real a Cloudinary y las pruebas contra Render.
- No hay correo transaccional ni MFA.
- No hay colaboración en tiempo real.
- El rate limiter en memoria es por instancia; con una sola instancia Free es
  suficiente. Si se escala horizontalmente, debe migrarse a un almacén
  compartido.
- La política de contraseñas es deliberadamente estricta pero no sustituye a
  un gestor de contraseñas ni a MFA.

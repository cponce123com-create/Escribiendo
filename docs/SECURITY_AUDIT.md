# Auditoría de seguridad

Fecha: 21 de octubre de 2026.
Rama: `main`.
Alcance: aplicación web ESCRIBIENDO (Fases 1 a 6 y lotes posteriores).

## 1. Método

Esta auditoría combina dos fuentes, y distingue siempre cuál se usó:

1. **Revisión del código** de autenticación, sesiones, permisos, validación de
   origen, cabeceras, descargas, auditoría y retención.
2. **Pruebas ejecutadas** con la suite del repositorio: 328 unitarias y 76 de
   extremo a extremo en Chromium, contra la compilación de producción.

No se ha ejecutado una prueba de penetración externa, ni un escaneo
automatizado de dependencias, ni un análisis estático de seguridad dedicado.
Donde no hay evidencia, este documento lo dice.

## 2. Activos y modelo de amenazas

| Activo                                      | Riesgo principal                                  | Control                                                                                 |
| ------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Manuscritos y revisiones                    | Lectura por otra persona, pérdida o sobrescritura | Autorización por espacio de trabajo, revisiones inmutables, conflicto sin sobrescritura |
| Cuentas y contraseñas                       | Robo de credenciales, fuerza bruta                | Argon2id, bloqueo persistente, límite por IP, sesiones opacas                           |
| Tokens de sesión, invitación y recuperación | Reutilización si se filtra la base                | Solo se guarda su huella SHA-256                                                        |
| Archivos exportados                         | Descarga por quien no es el autor                 | Sesión + firma HMAC de corta duración + espacio de trabajo                              |
| Registro de auditoría                       | Fuga de contenido o de secretos                   | Acciones, no manuscritos; limpiador de secretos                                         |
| Entorno                                     | Exposición de credenciales                        | Variables de entorno validadas con Zod; nada en el repositorio                          |

El supuesto de despliegue es una instancia de Render Free detrás de HTTPS, con
Neon como base de datos y Cloudinary para activos. No hay procesos
permanentes ni trabajadores en segundo plano.

## 3. Controles verificados

### 3.1 Contraseñas

- **Argon2id** con `memoryCost` 19 456 KiB (19 MiB), `timeCost` 3,
  `parallelism` 1, salida de 32 bytes (`lib/auth/password.ts`).
- Rehash automático si una contraseña guardada usa parámetros más débiles.
- Contraseñas de más de 512 bytes se rechazan antes de calcular el hash.
- Para un correo inexistente se verifica contra un hash señuelo
  (`verifyWithDummyHash`), de modo que el tiempo de respuesta no revela si la
  cuenta existe.
- Comparación de tokens con `timingSafeEqual` sobre huellas SHA-256
  (`lib/auth/tokens.ts`).

### 3.2 Sesiones

- Token opaco de 32 bytes aleatorios en base64url; **no** es un JWT y no lleva
  datos del usuario.
- En la base solo se guarda `tokenHash` (SHA-256). Un volcado de la tabla de
  sesiones no permite reutilizar las sesiones.
- Cookie `HttpOnly`, `Secure` en producción, `SameSite=Lax`, `Path=/`, con
  caducidad alineada con la sesión del servidor.
- Revocación por `revokedAt` y borrado de la cookie al cerrar sesión.
- La sesión se resuelve contra la base en cada petición; no hay caché de
  identidad en el cliente.

### 3.3 Fuerza bruta y bloqueo

- Límite en memoria de 10 intentos por IP cada 15 minutos
  (`lib/security/rate-limit.ts`), ampliable solo por variable de entorno.
- Bloqueo persistente en PostgreSQL: a los 5 fallos, la cuenta queda bloqueada
  15 minutos (`lib/auth/actions.ts`). El bloqueo sobrevive a un reinicio y no
  depende de la memoria del proceso.
- Los identificadores del limitador se guardan como SHA-256, no en claro.

### 3.4 CSRF y origen

- Las acciones de servidor llaman a `assertServerActionOrigin()`, que compara
  el encabezado `Origin` con `APP_URL` (o con el host y el protocolo
  reenviados por el proxy) y rechaza con `403` si no coinciden
  (`lib/security/request-context.ts`, `origin-policy.ts`).
- Las rutas API que mutan o descargan comprueban el origen con
  `assertRequestOrigin()`.
- `SameSite=Lax` añade una segunda barrera sobre la cookie de sesión.
- Pruebas: `origin-policy.test.ts` y el caso de origen ajeno en
  `tests/e2e/security.spec.ts`.

### 3.5 Autorización

- Cada consulta y cada mutación filtra por `workspaceId`; no basta con conocer
  el identificador de un libro, una sección o un comentario.
- Los permisos se comprueban en el servidor con `assertCanPerform`, nunca solo
  ocultando botones:
  - `OWNER` y `ADMIN`: gestión del equipo y del estudio.
  - `EDITOR` y `AUTHOR`: escritura, comentarios, maquetación y exportación.
  - `REVIEWER`: lectura y comentarios.
  - `team:manage` y `audit:export` son permisos explícitos.
- El rol del propietario no se puede cambiar ni transferir por la interfaz, y
  nadie puede expulsarse a sí mismo.
- Pruebas: `permissions.test.ts`, `tests/e2e/equipo.spec.ts` y las
  comprobaciones de acceso de `tests/e2e/security.spec.ts`.

### 3.6 Descarga de exportaciones

- La ruta `api/exports/[jobId]/download` exige sesión.
- Exige una firma HMAC con caducidad de diez minutos, ligada al `jobId`, al
  `userId` y a la marca de tiempo (`lib/export/signature.ts`).
- El trabajo se busca filtrando por el espacio de trabajo de la sesión y por
  `deletedAt: null`; un identificador de otro estudio devuelve `404`.
- El archivo no se guarda en disco ni en un bucket: se regenera desde las
  versiones inmutables del manuscrito.
- Respuesta con `Cache-Control: no-store` y `X-Content-Type-Options: nosniff`.
- Prueba E2E: sin sesión o con firma caducada, la descarga se rechaza.

### 3.7 Cabeceras y CSP

- CSP con nonce por petición, `strict-dynamic`, `object-src 'none'`,
  `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'` y
  `upgrade-insecure-requests` en producción (`proxy.ts`).
- `img-src` limitado a `'self'`, `data:`, `blob:` y `res.cloudinary.com`;
  `connect-src` a `'self'` y `api.cloudinary.com`.
- En producción no se permite `unsafe-inline` en estilos ni `unsafe-eval` en
  scripts. En desarrollo se relajan solo esas dos directivas, y la suite
  comprueba la política de producción.
- Cabeceras de endurecimiento en `next.config.ts`: `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy` con
  `strict-origin-when-cross-origin`, `Permissions-Policy` restrictiva y HSTS
  en producción.
- `noindex, nofollow, nocache` y `robots.txt` con `Disallow: /`: la aplicación
  es privada y no debe indexarse.
- Pruebas: `tests/e2e/security.spec.ts` (CSP, cabeceras, robots, ruta privada).

### 3.8 Inyección y XSS

- El acceso a datos usa Prisma con consultas parametrizadas. Las consultas
  crudas son de diagnóstico o de mantenimiento y no interpolan entrada de
  usuario.
- El contenido del manuscrito se valida con el esquema Zod de `book-schema`
  antes de guardarse.
- La vista previa pinta texto en nodos de React, no HTML crudo.
- Las exportaciones escapan el texto y los atributos: `escapeXml` en EPUB y
  DOCX, y códigos CIDs con mapa `ToUnicode` en el PDF (con WinAnsi solo como
  alternativa si faltan las fuentes).
- Los enlaces se guardan como texto y se escapan al serializar; el editor no
  navega al hacer clic (`link: { openOnClick: false }`).

### 3.9 Secretos y auditoría

- El entorno se valida con Zod al arrancar (`lib/env-schema.ts`); una variable
  obligatoria ausente impide arrancar en vez de fallar en la primera petición.
- `SETUP_TOKEN` exige al menos 32 caracteres y se compara en tiempo constante.
- Las invitaciones y recuperaciones guardan solo la huella del token y se
  muestran una sola vez.
- El registro de auditoría guarda acciones y metadatos, no contenido de
  manuscritos, contraseñas ni tokens. El exportador pasa los valores por el
  limpiador de secretos.
- La retención borra sesiones caducadas, tokens consumidos e invitaciones
  caducadas; no toca manuscritos, revisiones, notas, comentarios ni auditoría.
- No hay credenciales en el repositorio. Hay un escáner de secretos del árbol
  disponible para la revisión previa al commit.

### 3.10 Imágenes, Cloudinary y descargas

- **Firma de subida interior.** `POST /api/cloudinary/signature` exige sesión,
  origen propio y el permiso `section:update`. Si el propósito es `interior`,
  exige un `bookId` UUID, comprueba que el libro pertenece al espacio de trabajo
  y firma una carpeta que incluye espacio, libro e interior. La carpeta de
  portadas sigue siendo independiente.
- **Registro del activo.** `registerBookAssetAction` vuelve a validar en el
  servidor: URL HTTPS de `res.cloudinary.com/<cloudName>/image/upload/…`,
  `publicId` dentro de la carpeta del libro, formato permitido, dimensiones
  positivas, máximo de 15 MB y máximo de 12 000 px por lado. Si el `publicId`
  ya existe en otro espacio de trabajo, se rechaza. El registro escribe una
  entrada de auditoría sin contenido del manuscrito.
- **Biblioteca.** `listBookAssets` filtra por `bookId` y por
  `book.workspaceId` de la sesión; conocer el identificador de otro libro no
  basta para leer sus imágenes.
- **Descarga de imágenes para exportar.** Solo se descargan URLs HTTPS de la
  cuenta configurada. Se comprueba la URL final después de las redirecciones,
  no solo la inicial. Hay timeout de 15 s, máximo de 15 MB por imagen, máximo
  de 80 imágenes y concurrencia 4. Una URL no permitida no se descarga: se
  omite y se cuenta.
- **Contenido de las imágenes.** `sharp` valida y normaliza los bytes. No se
  confía en el `Content-Type` remoto para decidir el formato del archivo
  incrustado.
- **Descarga del archivo.** El nombre se sanea (controles, comillas y
  separadores de ruta) y se envía con `filename` ASCII y `filename*` RFC 5987.
  El `Content-Type` procede del archivo generado; no se toma un valor
  almacenado en el trabajo. Se añade `X-Download-Options: noopen`.
- **Riesgo residual.** La allowlist de exportación acepta cualquier imagen
  pública de la cuenta configurada, no solo las de la carpeta del libro. Un
  miembro con permiso de edición podría insertar la URL de otra imagen pública
  de la misma cuenta. No permite leer activos privados sin firma y no cruza
  espacios de trabajo en la base, pero conviene limitarlo por carpeta en una
  fase posterior.

### 3.11 Fuentes del PDF

- **Origen fijo.** Las doce caras se leen de `public/fonts/liberation/` con una
  lista constante de nombres. No se acepta una ruta, un nombre ni bytes de
  fuente desde la petición.
- **Sin red.** La carga es local; la exportación no descarga fuentes ni sigue
  URL alguna para tipografía. La única red sigue siendo la allowlist de
  Cloudinary.
- **Lector acotado.** `truetype.ts` comprueba límites de tabla, rangos de
  `cmap` y longitudes antes de leer; una fuente inválida lanza y el PDF cae a
  Times/WinAnsi con `estimatedPagination`.
- **Contenido.** La fuente se incrusta como datos binarios en `FontFile2`; no
  se ejecuta ni se interpreta como código. El texto se escribe como CIDs y el
  `ToUnicode` solo sirve para extraerlo.
- **Riesgo residual.** No se ha auditado el parser TTF con fuzzing ni con
  fuentes maliciosas de terceros. El modelo actual solo admite los activos
  versionados en el repositorio.

### 3.12 Notas al pie

- **Texto no confiable.** El texto de la nota se guarda en el atributo `note`
  del nodo Tiptap. La vista previa lo pinta como texto de React, y EPUB, DOCX y
  PDF lo escapan antes de escribir el archivo. No se interpreta como HTML.
- **Identidad.** El `id` de la nota se valida contra
  `[A-Za-z0-9_-]{1,64}` antes de guardar. En EPUB se usa con prefijo `fn-`
  para que el identificador sea válido como `xml:id`/fragmento.
- **Longitud.** El esquema limita la nota a 2000 caracteres y rechaza notas
  vacías o con contenido anidado.
- **Exportación.** Las notas no abren conexiones ni leen archivos: son texto
  del manuscrito. La única red de exportación sigue siendo la allowlist de
  Cloudinary descrita en 3.10.
- **Riesgo residual.** Una nota excepcionalmente larga puede no caber en la
  página; se conserva y se emite `FOOTNOTE_OVERFLOW`, pero la composición debe
  revisarse. No es un riesgo de seguridad, sino de maqueta.

## 4. Hallazgos y riesgos abiertos

| ID   | Severidad   | Hallazgo                                                                                                             | Estado                                                                                                                |
| ---- | ----------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| S-01 | Alta        | La contraseña de Neon se expuso en una sesión anterior y debe rotarse                                                | **Abierto**: corresponde a la operación; no se repite el valor en este documento                                      |
| S-02 | Media       | `SETUP_TOKEN` sigue configurado en Render después de crear la cuenta                                                 | **Abierto**: retirarlo del entorno                                                                                    |
| S-03 | Media       | El límite de intentos vive en la memoria de una instancia; con varias instancias se puede eludir por instancia       | **Abierto**: el bloqueo persistente de cuenta mitiga el caso por cuenta; si Render escala, usar un almacén compartido |
| S-04 | Media       | No hay MFA para cuentas con `team:manage` o `audit:export`                                                           | **Abierto**: planificado en la Fase 7                                                                                 |
| S-05 | Media       | No se ha ejecutado una prueba de penetración externa                                                                 | **Parcial**: el escaneo de dependencias ya se ejecuta (ver 4.1); el pentest sigue **abierto**                         |
| S-06 | Baja        | La subida real a Cloudinary no se ha probado con credenciales; solo la firma, la autorización y el rechazo de origen | **Abierto**: depende de configuración local                                                                           |
| S-07 | Baja        | La verificación de cabeceras y CSP se hizo en local; el despliegue de Render no es alcanzable desde esta red         | **Abierto**: repetir contra el despliegue                                                                             |
| S-08 | Informativo | El PDF incrusta TTF completas y no genera subconjuntos; no se afirma PDF/X                                           | **Conocido y documentado** en `EXPORT_VALIDATION.md`                                                                  |
| S-09 | Baja        | La allowlist de exportación acepta cualquier imagen pública de la cuenta configurada, no solo la carpeta del libro   | **Abierto**: acotar por carpeta en una fase posterior; no permite leer activos privados ni cruza espacios en la base  |

No consta ninguna vulnerabilidad crítica abierta en el código revisado. La
ausencia de un hallazgo no equivale a la ausencia de vulnerabilidades: sin
pentest, el alcance es el que se ha descrito.

### 4.1 Escaneo de dependencias

Ejecutado el 21 de octubre de 2026 con el auditor de pnpm sobre el registro
público:

| Ámbito                         | Resultado                          |
| ------------------------------ | ---------------------------------- |
| `pnpm audit --prod`            | **Sin vulnerabilidades conocidas** |
| `pnpm audit --audit-level=low` | 1 aviso alto, solo de desarrollo   |

El aviso que queda es `braces` (GHSA-vfj7-8cjw-p6xm), que llega por
`eslint-config-next → fast-glob → micromatch → braces` y **no tiene versión
corregida publicada**. Solo se usa en el lint, nunca en el código que se
despliega, y el problema solo aparece si se compilan patrones glob con
entradas no confiables, que aquí no ocurre. Se documenta en vez de ocultarse:
`pnpm audit` sigue informando de él.

Durante la revisión se corrigió otro aviso que sí tenía parche:
`deepmerge-ts` (GHSA-ggr8-5vv4-36mx), que llegaba por el CLI de Prisma. Se
fijo la versión corregida con un `override` en `pnpm-workspace.yaml` y se
comprobó que `pnpm db:generate` y `pnpm db:validate` siguen funcionando.

## 5. Evidencia ejecutada

| Prueba                     | Qué comprueba                                                                                                                                  | Resultado |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `password.test.ts`         | Hash Argon2id, verificación, rechazo de contraseñas largas                                                                                     | Verde     |
| `tokens.test.ts`           | Huellas SHA-256 y comparación en tiempo constante                                                                                              | Verde     |
| `origin-policy.test.ts`    | Origen propio aceptado; ajeno o ausente rechazado                                                                                              | Verde     |
| `permissions.test.ts`      | Matriz de roles y `assertCanPerform`                                                                                                           | Verde     |
| `security.spec.ts` (E2E)   | Health, CSP con nonce, cabeceras, noindex, ruta privada, firma de Cloudinary con sesión y origen                                               | Verde     |
| `auth.spec.ts` (E2E)       | Cookie HttpOnly y SameSite, cambio de contraseña, credenciales incorrectas sin revelar la cuenta, instalación deshabilitada y cierre de sesión | Verde     |
| `equipo.spec.ts` (E2E)     | Roles, invitaciones de un solo uso y auditoría                                                                                                 | Verde     |
| `images.test.ts`           | Allowlist de Cloudinary, rechazo de otros hosts y reutilización de imágenes ya resueltas                                                       | Verde     |
| `manuscrito.spec.ts` (E2E) | Controles de imagen y biblioteca del libro                                                                                                     | Verde     |
| `pnpm audit --prod`        | Escaneo de dependencias de producción                                                                                                          | Verde     |
| `pnpm validate:epub`       | EPUB validado con EPUBCheck 5.1.0                                                                                                              | Verde     |
| `pnpm validate:docx`       | DOCX leído con Mammoth 1.11.0                                                                                                                  | Verde     |
| `pnpm validate:pdf`        | PDF abierto con pdf.js 4.10.38                                                                                                                 | Verde     |
| Suite completa             | 328 unitarias y 79 E2E                                                                                                                         | Verde     |

Los comandos son los del protocolo de `IMPLEMENTATION_PLAN.md`. Las pruebas
E2E se ejecutan contra la compilación de producción en el puerto 3100 y una
base de datos desechable cuyo nombre contiene `test`.

## 6. Lo que no se ha verificado

- Prueba de penetración externa.
- MFA, que no existe todavía.
- Subida real de archivos a Cloudinary.
- Comportamiento con más de una instancia de Render.
- Copia de seguridad restaurada y ensayo de recuperación.
- Despliegue real desde esta red.
- Apertura del DOCX en Word o LibreOffice: no están instalados en esta
  máquina. El paquete sí lo entiende un lector OOXML independiente (Mammoth).

Estas ausencias están en el plan y no se compensan con afirmaciones.

## 7. Condiciones de cierre

1. Rotar la contraseña de Neon y retirar `SETUP_TOKEN` de Render.
2. Ejecutar un escaneo de dependencias y registrar el resultado.
3. Repetir las pruebas de cabeceras y CSP contra el despliegue real.
4. Implementar MFA para los roles de administración.
5. Probar la subida a Cloudinary con credenciales y borrar el activo de
   prueba.
6. Ensayar una restauración de copia de seguridad.

Hasta entonces, la aplicación se considera **endurecida en el código
revisado**, no «auditada externamente».

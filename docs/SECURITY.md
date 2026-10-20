# Seguridad

Este documento describe las defensas implementadas en la Fase 1 y las
limitaciones que deben tenerse presentes antes de abrir el acceso a más
personas.

## Modelo de amenazas

Activos principales:

1. Credenciales y sesiones de las cuentas.
2. Manuscritos y notas privadas alojados en PostgreSQL.
3. Imágenes y originales en Cloudinary.
4. Tokens de instalación y recuperación.
5. Secretos de infraestructura (`DATABASE_URL`, `DIRECT_URL`, API secret de
   Cloudinary).

Adversarios considerados:

- Visitantes anónimos que intentan entrar sin autorización.
- Atacantes con acceso a un enlace de recuperación filtrado.
- Usuarios autenticados con un rol inferior que intentan escalar privilegios.
- Automatizaciones que prueban credenciales o abusan de formularios.
- Errores de configuración que expongan secretos o desactiven protecciones.

Quedan fuera de alcance en esta fase: adversarios con control del host, del
proveedor cloud o de la base de datos, ataques de canal lateral sobre el
hardware, cumplimiento normativo formal y cifrado de extremo a extremo.

## Autenticación

### Contraseñas

- Argon2id con 19 456 KiB de memoria, 3 iteraciones, paralelismo 1 y salida de
  32 bytes.
- Longitud de 12 a 128 caracteres.
- Rechazo de contraseñas comunes y de un único carácter repetido.
- Rechazo si contienen el nombre o la parte local del correo.
- Comparación mediante la implementación nativa/WASI de Argon2; nunca se
  comparan hashes con `===`.
- Rehash automático al iniciar sesión si los parámetros del hash son inferiores
  a la política actual.
- Hash señuelo para correos inexistentes, de modo que el tiempo de respuesta no
  revele si la cuenta existe.

### Bloqueo y limitación

- Cinco fallos consecutivos bloquean la cuenta durante 15 minutos.
- El contador y `lockedUntil` se guardan en PostgreSQL, por lo que el bloqueo
  sobrevive a reinicios de Render.
- Límite en memoria por IP: 10 intentos de login cada 15 minutos, 5 intentos de
  instalación por hora, 10 cambios de contraseña por hora y 30 firmas de
  Cloudinary por hora.
- Los límites en memoria son por instancia y se pierden al reiniciar. Con una
  única instancia Free son suficientes; al escalar horizontalmente deben
  sustituirse por un almacén compartido (por ejemplo, PostgreSQL o un servicio
  externo).

La IP se toma de `x-forwarded-for`/`x-real-ip`, cabeceras que Render gestiona.
Si la aplicación se expone sin un proxy de confianza que las sanee, un cliente
podría falsificarlas para eludir el límite por IP. El bloqueo persistente por
cuenta sigue aplicando.

### Enumeración de cuentas

- El login devuelve el mismo mensaje para correo inexistente, contraseña
  incorrecta o cuenta bloqueada.
- La página de recuperación no ofrece un formulario público de «enviar correo»;
  no se puede consultar qué correos existen desde la interfaz.
- `/setup` solo es visible mientras no exista ninguna cuenta.

## Sesiones

- Token opaco de 32 bytes generado con `crypto.randomBytes`.
- Solo se almacena `SHA-256(token)`; una filtración de la tabla `sessions` no
  permite reutilizar sesiones.
- Cookie `HttpOnly`, `SameSite=Lax`, `Path=/` y `Secure` en producción.
- En producción el nombre es `__Host-escribiendo_session`, que obliga a
  `Secure`, `Path=/` y prohíbe `Domain`.
- Caducidad configurable (`SESSION_TTL_DAYS`, 14 días por defecto).
- Revocación inmediata al cerrar sesión, cambiar la contraseña o restablecerla.
- `lastUsedAt` se actualiza como máximo una vez por hora para reducir escrituras.
- La sesión se valida contra PostgreSQL en cada petición; no hay JWT sin
  revocación.

### Protección de las rutas privadas

La comprobación de sesión vive en el layout del grupo `(app)`, no en el
`proxy`. Es la recomendación de Next.js: el proxy es una frontera de red y no
debe ser la única barrera de autorización, porque un cambio en el `matcher`
puede dejar una ruta sin cubrir de forma silenciosa.

Consecuencia observable: cuando no hay sesión, la respuesta a una ruta
privada llega con estado `200` y una redirección en el cliente
(`NEXT_REDIRECT` y `<meta http-equiv="refresh">`) en lugar de un `307`.
El motivo es que el shell HTML se emite antes de que se resuelva la sesión en
la base de datos, y en ese punto el código de estado ya está comprometido.

Lo que **no** ocurre: el contenido privado nunca se envía al navegador. Antes
de resolver la sesión solo se emite el esqueleto de carga, y la respuesta se
verifica con una prueba de extremo a extremo que comprueba que no aparecen los
textos de la sección privada. El navegador acaba en `/login`.

Este comportamiento se documenta de forma explícita para que nadie lo confunda
con una fuga de datos ni con un fallo de autorización.

## CSRF y origen

Las Server Actions de Next.js no aceptan peticiones de formularios externos sin
la acción codificada, pero se añade una comprobación explícita:

- `assertServerActionOrigin()` compara `Origin` con `APP_URL` o con el host
  reenviado por el proxy.
- Las rutas API sensibles (`/api/cloudinary/signature`) hacen la misma
  comprobación con `assertRequestOrigin()`.
- Sin `Origin`, la comprobación falla. Los formularios del mismo origen lo
  envían siempre.
- No se aceptan redirecciones arbitrarias tras el login: el destino es fijo.

`SameSite=Lax` es una segunda barrera, no la única.

## CSP y cabeceras

`apps/web/src/proxy.ts` genera por petición:

```text
default-src 'self'
script-src 'self' 'nonce-<aleatorio>' 'strict-dynamic' ['unsafe-eval' solo en desarrollo]
style-src 'self' 'nonce-<aleatorio>'
img-src 'self' data: blob: https://res.cloudinary.com
font-src 'self' data:
connect-src 'self' https://api.cloudinary.com [ws: wss: en desarrollo]
media-src 'none'
object-src 'none'
base-uri 'self'
form-action 'self'
frame-ancestors 'none'
worker-src 'self' blob:
manifest-src 'self'
upgrade-insecure-requests (producción)
```

Además se envían:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` restrictiva
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `X-DNS-Prefetch-Control: off`
- `Strict-Transport-Security` en producción

La CSP no usa `unsafe-inline` para scripts ni estilos. El script de tema del
layout raíz recibe el nonce. Los estilos son archivos externos del mismo origen.

## Instalación inicial

- Requiere `SETUP_TOKEN` de al menos 32 caracteres.
- La comparación se hace sobre SHA-256 con `timingSafeEqual`.
- Solo funciona si `users` está vacío.
- La comprobación se repite dentro de una transacción Serializable para evitar
  dos instalaciones simultáneas.
- El token no se guarda en la base de datos ni se registra en logs.
- Tras crear la cuenta hay que eliminar `SETUP_TOKEN` del entorno. Aunque se
  deje, `/setup` queda cerrado porque ya existe un usuario.

## Recuperación de contraseña

No hay envío de correo en la Fase 1. Un administrador ejecuta:

```bash
pnpm admin:password-reset -- cuenta@ejemplo.com
```

- El token se genera con 32 bytes aleatorios y se muestra una sola vez.
- En la base de datos se guarda solo su SHA-256.
- Caduca a los 60 minutos por defecto (configurable entre 15 minutos y 24 horas).
- Emitir un token nuevo invalida los anteriores no usados.
- El consumo es atómico: si dos peticiones compiten, solo una actualiza la fila.
- Al restablecer se cierran todas las sesiones y se invalidan los demás tokens.
- La página no revela si el token existió, caducó o ya se usó.

Riesgo residual: el enlace viaja por el canal que use el administrador. Debe
entregarse por un medio privado y no guardarse en el repositorio.

## Cloudinary

- El secreto permanece en el servidor.
- La firma se calcula con SHA-1 sobre parámetros ordenados, como exige
  Cloudinary.
- El servidor fija `folder`, `timestamp`, `allowed_formats` y
  `unique_filename`; el cliente no elige la carpeta.
- La carpeta incluye el UUID del workspace de la sesión.
- La ruta exige sesión, origen válido y respeta el rate limit.
- Si faltan credenciales, responde `503`; no hay modo de demostración.
- Los formatos permitidos son `jpg, jpeg, png, webp, avif`; no se aceptan SVG,
  PDF ni otros tipos en esta ruta.
- Cloudinary aplica sus propios límites de tamaño y transformación según el
  plan. La aplicación no promete subidas ilimitadas.

## Auditoría y registros

`audit_logs` registra acciones como inicio/cierre de sesión, instalación,
cambios de contraseña, bloqueo de cuenta, perfil y revocación de sesiones.

- No se guardan contraseñas, tokens, cookies, contenido de manuscritos ni
  cuerpos completos de solicitudes.
- La IP se guarda como hash SHA-256, no en claro.
- El logger estructurado redacta claves que coincidan con contraseña, secreto,
  token, cookie, contenido, manuscrito, API key o URL de base de datos.
- Los mensajes de error se limpian antes de escribirlos: una URL de conexión
  con usuario y contraseña se registra como `usuario:[redacted]@host`. El
  código de error de Prisma (`P2021`, `P1001`…) sí se registra, porque sin él
  el diagnóstico de un fallo de despliegue es imposible.
- En producción los errores no incluyen stack traces en las respuestas.
- `onRequestError` registra nombre de error, código, mensaje, ruta y método; no
  el cuerpo.

La auditoría no es inmutable en esta fase: un administrador de base de datos
podría modificarla. Si se requiere evidencia legal, deberá exportarse a un
almacén append-only.

## Fallos de base de datos en las páginas de acceso

`/login` y `/setup` consultan la base de datos durante el renderizado. Si la
base no responde, un fallo sin clasificar llega al límite de error y el
operador ve «Error inesperado», sin saber si faltan migraciones o si la base
está caída.

Por eso esas páginas clasifican el fallo antes de continuar:

- `not-migrated` (`P2021`, `P2022`): la base responde pero le falta el
  esquema. La página indica que hay que aplicar `pnpm db:migrate`.
- `unavailable` (`P1000`, `P1001`, `P1002` y errores de inicialización): la
  página indica que hay que revisar `DATABASE_URL` y el estado del proyecto de
  Neon.

El error original se registra en el log del servidor con su código y su
mensaje, y la página muestra el `requestId` para correlacionar ambos. La
información no se oculta ni se sustituye: se hace explícita.

`/api/health` (viva) sigue respondiendo `200` aunque la base de datos falle:
el problema está en un componente externo y reiniciar el proceso no lo arregla.
`/api/health/ready` (disponibilidad) devuelve `503` en ese caso.

## Secretos y configuración

- `.env` está ignorado por Git; solo se versiona `.env.example` con valores
  vacíos.
- `render.yaml` marca los secretos con `sync: false`.
- La validación de entorno se ejecuta en el servidor y falla de forma explícita
  si falta `DATABASE_URL` o, en producción, `APP_URL`.
- No se usan variables `NEXT_PUBLIC_` para secretos.
- El secreto de Cloudinary nunca se serializa en un componente cliente.
- Las URLs de Neon deben usar TLS (`sslmode=require`).

## Limitaciones y riesgos residuales

1. **Sin MFA.** Una contraseña comprometida permite el acceso.
2. **Sin correo transaccional.** La recuperación depende de un administrador.
3. **Rate limit por instancia.** Ver arriba.
4. **Sin cifrado de extremo a extremo.** Neon y Cloudinary ven los datos en
   claro en el servidor. La privacidad depende de sus controles y de la cuenta.
5. **Sin política de retención.** Los logs de auditoría y las revisiones se
   conservan indefinidamente hasta que se defina una política.
6. **Autorización por workspace incompleta fuera de Fase 1.** Las consultas
   actuales usan el workspace de la sesión, pero las futuras rutas de libros
   deberán comprobar pertenencia y rol en cada consulta, no solo en la UI.
7. **Render Free se suspende por inactividad.** No debe usarse como única copia
   de seguridad; hay que exportar copias de Neon.
8. **El binario nativo de Argon2 puede no cargar en algunos Windows.** El
   paquete incluye respaldo WASI; en producción Linux se usa el binario nativo.
   El respaldo WASI emite una advertencia experimental de Node, no un error.
9. **El contenido de los manuscritos aún no existe en la interfaz.** Cuando se
   implemente, deberá revisarse el tamaño máximo, el saneamiento de HTML/JSON y
   las reglas de autorización antes de exponerlo.
10. **Las rutas privadas responden `200` antes de redirigir.** Se explica en
    «Protección de las rutas privadas». No hay fuga de contenido, pero un
    monitor que espere un `307` verá un `200` seguido de una redirección en el
    cliente.

## Respuesta ante incidentes

1. Revocar sesiones afectadas (`/account` o SQL sobre `sessions`).
2. Cambiar la contraseña de la cuenta y el `SETUP_TOKEN` si sigue presente.
3. Rotar `CLOUDINARY_API_SECRET`, `DATABASE_URL` y `DIRECT_URL` en el panel.
4. Revisar `audit_logs` y los logs de Render por `requestId`.
5. Exportar una copia de la base antes de cualquier limpieza.
6. Si se filtró un enlace de recuperación, emitir uno nuevo invalida los
   anteriores.

# Pruebas

Este documento explica cómo se verifica ESCRIBIENDO, qué cubre cada nivel de
pruebas y qué queda sin cubrir en la Fase 1.

## Resumen

| Nivel             | Herramienta          | Qué cubre                                                | Base de datos  |
| ----------------- | -------------------- | -------------------------------------------------------- | -------------- |
| Unitario          | Vitest               | Funciones puras: validaciones, tokens, políticas, firmas | No             |
| Esquema           | Prisma Migrate + SQL | Restricciones, índices y trigger de la base              | Sí, desechable |
| Extremo a extremo | Playwright           | Flujos reales en un navegador                            | Sí, desechable |

Los tres niveles se ejecutan contra código real. No hay mocks que oculten
fallos de integración ni datos de demostración.

---

## 1. Requisitos

- Node.js 24.20.0 y pnpm 12.14.0.
- Una base PostgreSQL 16 o superior para desarrollo y para las pruebas de
  extremo a extremo.
- Para las pruebas E2E, el navegador de Playwright:

  ```bash
  pnpm exec playwright install chromium
  ```

---

## 2. Pruebas unitarias

```bash
pnpm test
```

Vitest recorre `apps/**/*.test.ts`, `packages/**/*.test.ts` y
`scripts/**/*.test.ts`. No necesita base de datos ni navegador.

Cobertura actual (Fases 1 a 3):

| Archivo                                                   | Qué verifica                                                                                                                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/env-schema.test.ts`                     | Validación del entorno: variables vacías tratadas como ausentes, `DATABASE_URL` obligatoria y de PostgreSQL, longitud mínima de `SETUP_TOKEN`, valores por defecto, y la regla «todo o nada» de Cloudinary. |
| `apps/web/src/lib/auth/database-state.test.ts`            | Clasificación de los fallos de base de datos: `P2021`/`P2022` como «faltan migraciones», `P1000`/`P1001` y los errores de inicialización como «no hay conexión», y lectura del código de error.             |
| `apps/web/src/lib/auth/password.test.ts`                  | Formato Argon2id, verificación correcta e incorrecta, necesidad de rehash y longitud máxima de la contraseña.                                                                                               |
| `apps/web/src/lib/auth/tokens.test.ts`                    | Generación de tokens opacos, hash SHA-256 determinista y comparación en tiempo constante.                                                                                                                   |
| `apps/web/src/lib/auth/identity.test.ts`                  | Detección de contraseñas que contienen la identidad y normalización de nombres para el espacio de trabajo.                                                                                                  |
| `apps/web/src/lib/security/origin-policy.test.ts`         | Resolución del origen esperado y comparación de orígenes.                                                                                                                                                   |
| `apps/web/src/lib/cloudinary/signature.test.ts`           | Serialización y firma SHA-1 con el orden y las exclusiones que exige Cloudinary.                                                                                                                            |
| `apps/web/src/lib/books/permissions.test.ts`              | Quién puede crear, editar, eliminar, aprobar y comentar según el rol del espacio de trabajo.                                                                                                                |
| `apps/web/src/lib/books/status.test.ts`                   | Transiciones de estado permitidas del libro y rechazo de los saltos no contemplados.                                                                                                                        |
| `apps/web/src/lib/books/progress.test.ts`                 | Recuento de palabras y progreso derivados del contenido.                                                                                                                                                    |
| `apps/web/src/lib/books/section-tree.test.ts`             | Aplanado del árbol de secciones para la navegación y las exportaciones.                                                                                                                                     |
| `apps/web/src/lib/writing/stats.test.ts`                  | Palabras escritas por día a partir del historial de revisiones, resumen del periodo y progreso de un objetivo.                                                                                              |
| `packages/shared/src/validation.test.ts`                  | Esquemas compartidos: correo, nombre, política de contraseñas y token de instalación.                                                                                                                       |
| `packages/shared/src/redaction.test.ts`                   | Limpieza de credenciales en los mensajes que van al log: URL con usuario y contraseña, tokens de GitHub y textos sin secretos.                                                                              |
| `packages/book-schema/src/tiptap.test.ts`                 | Normalización y validación del documento Tiptap.                                                                                                                                                            |
| `packages/book-schema/src/diff.test.ts`                   | Comparación de revisiones por palabras: texto idéntico, palabras añadidas y eliminadas, reconstrucción del original y del nuevo, y sustitución completa por encima del límite.                              |
| `packages/editorial-engine/src/measure.test.ts`           | Medición del texto: anchos por tipo de carácter, reparto en líneas, palabras que desbordan la caja y guionado por guion.                                                                                    |
| `packages/editorial-engine/src/pagination.test.ts`        | Composición en páginas: reparto del texto, párrafos que ocupan más de una página, aperturas de capítulo en página par, viudas, huérfanas, folios y encabezados.                                             |
| `packages/editorial-engine/src/layout-validation.test.ts` | Validación de la geometría de página y de los formatos.                                                                                                                                                     |
| `packages/export-engine/src/pdf.test.ts`                  | Escritura de PDF: cabecera, objetos, fuentes estándar, escapado del texto, metadatos, cajas de recorte y sangre, marcas de corte y reproducibilidad.                                                        |
| `packages/export-engine/src/zip.test.ts`                  | ZIP: firma, entradas sin comprimir, nombres, CRC-32 de referencia y la entrada `mimetype` colocada en primer lugar.                                                                                         |
| `packages/export-engine/src/epub.test.ts`                 | EPUB 3 y DOCX: entradas del paquete, `mimetype` en primer lugar, manifiesto, spine, navegación, estilos, XML escapado y reproducibilidad.                                                                   |
| `apps/web/src/lib/editor/sync.test.ts`                    | Máquina de estados de la sincronización: transiciones, espera de reintento creciente, cuándo toca sincronizar y la invariante «no se dice «guardado» mientras no lo está».                                  |
| `apps/web/src/lib/editor/drafts.test.ts`                  | Almacén de borradores locales: guardar, recuperar, borrar, listar, aislar por cuenta y funcionar sin IndexedDB.                                                                                             |

---

## 3. Comprobación del esquema de la base de datos

Las restricciones no se pueden comprobar con pruebas unitarias: viven en
PostgreSQL. La migración inicial las crea y se verifican directamente.

```bash
# 1. Aplicar la migración sobre una base desechable
pnpm db:migrate

# 2. Comprobar que existen las restricciones y el trigger
psql "$DIRECT_URL" -c "\d+ section_revisions"
psql "$DIRECT_URL" -c "SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace;"
```

`pnpm db:status` es la comprobación de solo lectura que resume el estado de
la base: conexión, tablas, migraciones aplicadas y cuentas. Es el comando que
hay que ejecutar antes y después de migrar, y el que diagnostica un
despliegue con la base sin esquema.

Verificaciones realizadas en las Fases 1 a 3 contra PostgreSQL 17.7:

| Comprobación                                                                                                                                                                                                 | Resultado                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| 18 tablas de la aplicación + `_prisma_migrations`                                                                                                                                                            | Correcto                        |
| 14 restricciones `CHECK` (recuentos no negativos, progreso 0–100, geometría positiva, versión ≥ 1, objetivo de palabras positivo, periodo con sentido, comentario con texto, estado y resolución coherentes) | Correcto                        |
| 15 índices únicos, incluidos 3 parciales (`book_editions_one_default_per_book_key`, `layout_profiles_one_default_per_workspace_key`, `editorial_templates_system_slug_key`)                                  | Correcto                        |
| Trigger `section_revisions_immutable` que rechaza `UPDATE`                                                                                                                                                   | Correcto                        |
| `UPDATE` sobre una revisión de sección                                                                                                                                                                       | Rechazado por el trigger        |
| `wordCount` negativo, `writingProgress` 150, versión 0, dimensiones 0                                                                                                                                        | Rechazado por `CHECK`           |
| Objetivo de palabras negativo o cero                                                                                                                                                                         | Rechazado por `CHECK`           |
| Periodo de objetivo invertido (`periodEnd` anterior a `periodStart`)                                                                                                                                         | Rechazado por `CHECK`           |
| Comentario editorial con el cuerpo vacío                                                                                                                                                                     | Rechazado por `CHECK`           |
| Comentario marcado como resuelto sin fecha de resolución                                                                                                                                                     | Rechazado por `CHECK`           |
| Dos ediciones por defecto en el mismo libro                                                                                                                                                                  | Rechazado por el índice parcial |
| Correo duplicado                                                                                                                                                                                             | Rechazado por `UNIQUE`          |
| Una sola edición por defecto                                                                                                                                                                                 | Aceptado                        |
| Objetivo de palabras válido y comentario resuelto con fecha                                                                                                                                                  | Aceptado                        |

---

## 4. Pruebas de extremo a extremo

```bash
pnpm test:e2e
```

### 4.1 Cómo funciona

1. `pnpm test:e2e` compila la aplicación y arranca el servidor de producción
   (`scripts/e2e-server.ts`) en un puerto propio, el 3100, para no interferir
   con un servidor de desarrollo en marcha.
2. La preparación global (`tests/e2e/global-setup.ts`) **vacía todas las
   tablas** de la base configurada en `DATABASE_URL`, de modo que la
   instalación inicial vuelva a estar disponible y el flujo sea reproducible.
3. El proyecto de preparación (`tests/e2e/auth.setup.ts`) crea la cuenta de
   pruebas y guarda la sesión en disco; el resto de pruebas la reutiliza.
4. Se ejecutan las pruebas en serie y con un único worker: comparten una sola
   base de datos desechable.

**Por qué la compilación de producción y no el servidor de desarrollo**: en
desarrollo, las herramientas de Next.js 16 aplican estilos en línea que la CSP
estricta bloquea, y el bloqueo provoca recargas continuas del navegador que
hacen fallar las pruebas de forma intermitente. Además, el «fast refresh»
vuelve a renderizar los componentes mientras una prueba los está usando. Con
la compilación de producción se comprueba además la política de seguridad
real.

Por la misma razón, la CSP permite `style-src 'unsafe-inline'` **solo en
desarrollo**; en producción se mantiene la política estricta, que es la que
verifican las pruebas.

### 4.2 Salvaguarda de la base de datos

La preparación global **borra datos**. Antes de tocar nada comprueba que el
nombre de la base contiene `test`:

```text
Se aborta: la base de datos «escribiendo» no parece de pruebas.
Las pruebas de extremo a extremo borran todas las tablas.
```

Si la base es realmente desechable pero no contiene «test» en el nombre,
puede anularse la comprobación con `E2E_ALLOW_NON_TEST_DATABASE=1`. No se
recomienda.

### 4.3 Variables de entorno

| Variable                     | Obligatoria | Descripción                                                                        |
| ---------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `DATABASE_URL`               | Sí          | Base desechable de pruebas.                                                        |
| `E2E_SETUP_TOKEN`            | Sí          | Token de instalación. Si no se define, se usa `SETUP_TOKEN`. Mínimo 32 caracteres. |
| `E2E_USER_EMAIL`             | No          | Correo de la cuenta de pruebas. Por defecto `e2e@ejemplo.local`.                   |
| `E2E_USER_PASSWORD`          | No          | Contraseña de la cuenta de pruebas.                                                |
| `PLAYWRIGHT_BASE_URL`        | No          | Si se define, Playwright no arranca su propio servidor.                            |
| `PLAYWRIGHT_SKIP_WEB_SERVER` | No          | Igual que el anterior, para servidores ya levantados.                              |

### 4.4 Qué cubren

`tests/e2e/auth.setup.ts` (preparación): crea la cuenta de pruebas mediante la
ruta de instalación y guarda la sesión compartida.

`tests/e2e/auth.spec.ts` (flujo de acceso):

- La instalación inicial muestra el formulario y crea la primera cuenta.
- La cookie de sesión es `HttpOnly`, `SameSite=Lax` y `Path=/`, y el token de
  instalación no aparece en el HTML.
- El perfil se actualiza y el cambio persiste.
- La contraseña se cambia y la sesión sigue activa.
- El cambio de contraseña rechaza una contraseña que contiene la identidad de
  la cuenta.
- Cerrar sesión invalida el acceso al panel.
- El acceso con credenciales incorrectas no revela si la cuenta existe.
- El acceso con la contraseña nueva funciona.
- `/setup` queda deshabilitada cuando ya existe una cuenta.
- Con sesión, la firma de Cloudinary responde `503` porque no está
  configurada, y la respuesta no contiene el secreto.

`tests/e2e/biblioteca.spec.ts` (biblioteca y manuscritos):

- La biblioteca vacía ofrece crear el primer libro.
- Un libro se crea con sus metadatos y aparece en la biblioteca.
- El buscador filtra la biblioteca.
- Se añade una sección y se abre su editor.
- El manuscrito se guarda y crea una revisión.
- El libro refleja las palabras y el progreso.
- Una segunda versión se añade al historial.
- Restaurar una revisión crea una versión nueva sin alterar la anterior.
- El estado del libro cambia según las transiciones permitidas.
- El estado no puede saltar de borrador a completo.

`tests/e2e/security.spec.ts` (capa de seguridad):

- `/api/health` y `/api/health/ready` responden `200` y `database: "ok"`.
- La CSP incluye un nonce, `object-src 'none'`, `frame-ancestors 'none'`,
  `base-uri 'self'`, `form-action 'self'` y **no** usa `'unsafe-inline'`.
- Se envían `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y
  `X-Request-ID`.
- La página declara `noindex, nofollow, nocache` y `robots.txt` bloquea el
  rastreo.
- Una ruta privada sin sesión no entrega contenido privado y acaba en
  `/login`.
- La firma de Cloudinary exige sesión (`401`) y rechaza un origen ajeno
  (`403`).

`tests/e2e/writing.spec.ts` (escritura asistida). El archivo es autocontenido:
crea su propio libro y su propia sección, de modo que puede ejecutarse en
solitario:

- Se crea un libro y una sección para trabajar sobre ellos.
- Una nota se crea, aparece en el libro y se puede eliminar.
- Las notas se listan en la página propia.
- Se define un objetivo y aparece con su progreso.
- Las estadísticas muestran las palabras escritas.
- Las preferencias de escritura se ajustan y se recuerdan tras recargar.
- Un comentario se publica y aparece sin resolver.
- Un comentario se resuelve y pasa al historial.
- El libro se envía a revisión y se aprueba sin comentarios abiertos.
- El historial muestra dos revisiones y permite compararlas.

`tests/e2e/maquetacion.spec.ts` (maquetación). El archivo es autocontenido:
crea su propio libro y su propia sección, de modo que puede ejecutarse en
solitario:

- Se crea un libro y una sección para maquetar.
- La maquetación ofrece crear un perfil de página.
- Un perfil de página se crea con su geometría.
- Una geometría imposible se rechaza con un motivo claro.
- El perfil creado se puede editar.
- Se aplica la maqueta al libro.
- La vista previa paginada compone las páginas del manuscrito.
- La vista previa muestra el folio y el encabezado de página.
- La página se dibuja a escala real y respeta los márgenes.

`tests/e2e/exportacion.spec.ts` (exportación). El archivo es autocontenido:
crea su propio libro, su sección y su perfil de página:

- Se crea un libro con una sección para exportar.
- Sin maquetación, el PDF no se puede generar y se explica.
- Se crea un perfil de página para poder componer el PDF.
- El PDF digital se genera y se descarga.
- El PDF de imprenta lleva sangrado y marcas de corte.
- El EPUB se genera y se descarga.
- El archivo descargado es un EPUB válido.
- Pedir dos veces la misma exportación reutiliza el trabajo.
- El DOCX generado es un paquete de Word.
- El PDF conserva la tipografía española.
- Una descarga sin firma se rechaza.

`tests/e2e/manuscrito.spec.ts` cubre la resiliencia del manuscrito y los
controles de imagen; `tests/e2e/equipo.spec.ts` cubre equipo y gobernanza. Los
escenarios están descritos en [RECOVERY_TESTS.md](RECOVERY_TESTS.md) y en el
ROADMAP.

### 4.5 Resultados obtenidos

```text
Running 71 tests using 1 worker
71 passed (3.2m)
```

Las 71 pruebas incluyen la preparación de la cuenta de pruebas. La suite se ha
ejecutado de forma repetida con resultado completo en todas las ejecuciones,
contra PostgreSQL 17.7 local y contra la **compilación de producción** (no el
servidor de desarrollo). En producción, el mismo flujo de instalación, acceso y
panel se verificó además en el despliegue real de Neon.

Los archivos se ejecutan por orden alfabético sobre la misma base de datos,
que se vacía una sola vez al principio de la ejecución. Por eso el archivo de
la biblioteca se llama `biblioteca.spec.ts` y va antes que los demás: la
biblioteca necesita empezar vacía. Los nombres siguen el orden de las fases,
para que añadir una fase nueva no rompa el orden por sorpresa.

### 4.6 Recuperación de contraseña por CLI

`pnpm admin:password-reset` escribe en la base de datos, así que se verifica
por separado contra una base de pruebas:

```bash
pnpm admin:password-reset -- e2e@ejemplo.local --ttl-minutes=30 --revoke-sessions
```

Comprobaciones realizadas:

| Comprobación                                           | Resultado                          |
| ------------------------------------------------------ | ---------------------------------- |
| Enlace emitido con el token en claro, una sola vez     | Correcto                           |
| El token en claro **no** aparece en la base de datos   | 0 coincidencias                    |
| Lo que se almacena es el SHA-256 del token             | 64 caracteres hexadecimales        |
| Token vigente y sin usar                               | Correcto                           |
| Registro en `audit_logs` con la acción y los metadatos | `AUTH_PASSWORD_RESET_ISSUED_CLI`   |
| `--revoke-sessions` cierra las sesiones del usuario    | 8 de 8 revocadas                   |
| Cuenta inexistente                                     | Error explícito, sin escribir nada |

---

## 5. Comprobaciones manuales y de despliegue

Estas comprobaciones no se automatizan porque dependen del proveedor:

```bash
# Tras desplegar en Render
curl -i https://tu-servicio.onrender.com/api/health
curl -i https://tu-servicio.onrender.com/api/health/ready
curl -i https://tu-servicio.onrender.com/robots.txt
```

En el navegador, con la cuenta ya creada:

- `/login` carga con estilos y con el tema claro y oscuro.
- `/setup` redirige a `/login` si ya existe una cuenta.
- El formulario de login rechaza credenciales incorrectas sin filtrar si la
  cuenta existe.
- `/account` permite cambiar la contraseña y revocar las otras sesiones.
- La consola del navegador no muestra errores de CSP.

---

## 6. Cómo se ejecuta todo

```bash
pnpm format:check   # Prettier
pnpm lint           # ESLint
pnpm typecheck      # TypeScript en todos los paquetes, scripts y pruebas
pnpm test           # Vitest
pnpm test:e2e       # Playwright (requiere base de datos desechable)
pnpm build          # Compilación de producción
```

---

## 7. Limitaciones de la cobertura

Lo que **no** está verificado automáticamente en las Fases 1 a 3:

1. **Proveedores externos.** Neon, Cloudinary y Render no se prueban de forma
   automatizada: no hay credenciales en el repositorio ni en los sistemas de
   integración continua. La integración con Cloudinary se comprueba con
   pruebas unitarias de la firma y con la respuesta `503` cuando no está
   configurada.
2. **Correo electrónico.** No hay proveedor de correo. La recuperación se
   emite con `pnpm admin:password-reset`, que no se prueba de forma
   automatizada por escribir en la base de datos real.
3. **Comportamiento en producción.** Las pruebas E2E se ejecutan contra la
   **compilación de producción** en un puerto local, no contra el despliegue.
   En producción la cookie de sesión es `__Host-escribiendo_session` y lleva
   `Secure`, por lo que requiere HTTPS. El flujo de instalación, acceso y
   panel sí se verificó en el despliegue real de Neon.
4. **Pruebas de carga y de concurrencia.** No hay pruebas de rendimiento. El
   límite en memoria y el bloqueo por cuenta están pensados para una única
   instancia.
5. **Motores de navegador.** Solo se prueba Chromium. No se prueba Firefox ni
   WebKit.
6. **Accesibilidad.** No hay auditoría automática de accesibilidad. La
   interfaz se ha construido con etiquetas, roles y foco visible, pero no hay
   una prueba automatizada que lo acredite.
7. **Cobertura de líneas.** No se mide el porcentaje de código ejecutado. Las
   pruebas cubren los flujos críticos, no cada rama.
8. **Preferencias de escritura.** Se guardan en el `localStorage` del
   navegador, así que la prueba automatizada solo las exercise en Chromium. No
   se ha comprobado el comportamiento en modo privado, con el almacenamiento
   bloqueado ni entre navegadores distintos.

---

## 8. Añadir pruebas

- **Unidad**: crea el archivo junto al código, con el sufijo `.test.ts`, y
  comprueba que `vitest.config.ts` lo incluye.
- **Extremo a extremo**: añade el archivo en `tests/e2e/`. Si depende del
  estado de la base de datos, ten en cuenta que la preparación global la vacía
  al comienzo de cada ejecución.
- Si necesitas un icono de red o una espera, usa las utilidades de
  Playwright (`expect`, `waitForURL`) en lugar de esperas fijas.
- Ejecuta `pnpm format` antes de confirmar los cambios.

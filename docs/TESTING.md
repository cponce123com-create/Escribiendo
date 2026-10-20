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

Cobertura actual de la Fase 1:

| Archivo                                                   | Qué verifica                                                                                                                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/env-schema.test.ts`                     | Validación del entorno: variables vacías tratadas como ausentes, `DATABASE_URL` obligatoria y de PostgreSQL, longitud mínima de `SETUP_TOKEN`, valores por defecto, y la regla «todo o nada» de Cloudinary. |
| `apps/web/src/lib/auth/password.test.ts`                  | Formato Argon2id, verificación correcta e incorrecta, necesidad de rehash y longitud máxima de la contraseña.                                                                                               |
| `apps/web/src/lib/auth/tokens.test.ts`                    | Generación de tokens opacos, hash SHA-256 determinista y comparación en tiempo constante.                                                                                                                   |
| `apps/web/src/lib/auth/identity.test.ts`                  | Detección de contraseñas que contienen la identidad y normalización de nombres para el espacio de trabajo.                                                                                                  |
| `apps/web/src/lib/security/origin-policy.test.ts`         | Resolución del origen esperado y comparación de orígenes.                                                                                                                                                   |
| `apps/web/src/lib/cloudinary/signature.test.ts`           | Serialización y firma SHA-1 con el orden y las exclusiones que exige Cloudinary.                                                                                                                            |
| `packages/shared/src/validation.test.ts`                  | Esquemas compartidos: correo, nombre, política de contraseñas y token de instalación.                                                                                                                       |
| `packages/book-schema/src/tiptap.test.ts`                 | Normalización y validación del documento Tiptap.                                                                                                                                                            |
| `packages/editorial-engine/src/layout-validation.test.ts` | Validación de la geometría de página y de los formatos.                                                                                                                                                     |

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

Verificaciones realizadas en la Fase 1 contra PostgreSQL 17.7:

| Comprobación                                                                                                                                                                | Resultado                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 16 tablas de la aplicación + `_prisma_migrations`                                                                                                                           | Correcto                        |
| 10 restricciones `CHECK` (recuentos no negativos, progreso 0–100, geometría positiva, versión ≥ 1)                                                                          | Correcto                        |
| 15 índices únicos, incluidos 3 parciales (`book_editions_one_default_per_book_key`, `layout_profiles_one_default_per_workspace_key`, `editorial_templates_system_slug_key`) | Correcto                        |
| Trigger `section_revisions_immutable` que rechaza `UPDATE`                                                                                                                  | Correcto                        |
| `UPDATE` sobre una revisión de sección                                                                                                                                      | Rechazado por el trigger        |
| `wordCount` negativo, `writingProgress` 150, versión 0, dimensiones 0                                                                                                       | Rechazado por `CHECK`           |
| Dos ediciones por defecto en el mismo libro                                                                                                                                 | Rechazado por el índice parcial |
| Correo duplicado                                                                                                                                                            | Rechazado por `UNIQUE`          |
| Una sola edición por defecto                                                                                                                                                | Aceptado                        |

---

## 4. Pruebas de extremo a extremo

```bash
pnpm test:e2e
```

### 4.1 Cómo funciona

1. Playwright arranca el servidor de desarrollo (`pnpm --filter
@escribiendo/web dev`) y espera a que `/api/health` responda.
2. La preparación global (`tests/e2e/global-setup.ts`) **vacía todas las
   tablas** de la base configurada en `DATABASE_URL`, de modo que la
   instalación inicial vuelva a estar disponible y el flujo sea reproducible.
3. Se ejecutan las pruebas en serie y con un único worker: comparten una sola
   base de datos desechable.

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

`tests/e2e/auth.spec.ts` (flujo de acceso):

- La instalación inicial muestra el formulario y crea la primera cuenta.
- La cookie de sesión es `HttpOnly`, `SameSite=Lax` y `Path=/`, y el token de
  instalación no aparece en el HTML.
- El perfil se actualiza y el cambio persiste.
- La contraseña se cambia y la sesión sigue activa.
- Cerrar sesión invalida el acceso al panel.
- El acceso con credenciales incorrectas no revela si la cuenta existe.
- El acceso con la contraseña nueva funciona.
- `/setup` queda deshabilitada cuando ya existe una cuenta.
- Con sesión, la firma de Cloudinary responde `503` porque no está
  configurada, y la respuesta no contiene el secreto.

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

### 4.5 Resultados obtenidos en la Fase 1

```text
Running 16 tests using 1 worker
16 passed (51.6s)
```

La suite se ejecutó **7 veces consecutivas** con 16/16 pruebas correctas en
todas ellas, contra PostgreSQL 17.7 local.

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

Lo que **no** está verificado automáticamente en la Fase 1:

1. **Proveedores externos.** Neon, Cloudinary y Render no se prueban de forma
   automatizada: no hay credenciales en el repositorio ni en los sistemas de
   integración continua. La integración con Cloudinary se comprueba con
   pruebas unitarias de la firma y con la respuesta `503` cuando no está
   configurada.
2. **Correo electrónico.** No hay proveedor de correo. La recuperación se
   emite con `pnpm admin:password-reset`, que no se prueba de forma
   automatizada por escribir en la base de datos real.
3. **Comportamiento en producción.** Las pruebas E2E se ejecutan contra el
   servidor de desarrollo. En producción la cookie de sesión es
   `__Host-escribiendo_session` y lleva `Secure`, por lo que requiere HTTPS.
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

# Validación de correcciones AUD-01 a AUD-08

Fecha: 27 de octubre de 2026. Base: `a8f53e433edc584f4ea209f85eb59bf6e3fc4a7e`.
Código verificado en GitHub: `67d3497f4f4bc133adb68a90f4fb42359abe1f52`.
PR: https://github.com/cponce123com-create/Escribiendo/pull/74.

## Estado de los hallazgos

| Hallazgo | Estado del código                                                             | Pruebas de regresión                                                                                                            |
| -------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| AUD-01   | Corregido: retirada explícita del modo regex en ambas actions y UI            | search-replace.test.ts: patrón catastrófico rechazado y búsqueda literal preservada                                             |
| AUD-02   | Corregido: ocho columnas compartidas, fórmulas neutralizadas, JSON intacto    | audit-csv.test.ts, api/audit/export/route.test.ts                                                                               |
| AUD-03   | Corregido: selección desde la derecha, IP válida y normalización IPv6         | request-context.test.ts, env-schema.test.ts                                                                                     |
| AUD-04   | Corregido: fila bloqueada en users, incremento atómico, reinicio tras caducar | login-lockout.test.ts: cinco fallos simultáneos simulados, expiración, bloqueo activo y reinicio                                |
| AUD-05   | Corregido; en portadas ya había verificación de versión, conservada           | asset-url.test.ts y asset-identity.test.ts: cuentas, IDs, versiones, traversal                                                  |
| AUD-06   | Corregido en código; activación de Actions pendiente de secretos              | retention-policy.test.ts, rate-limit.test.ts                                                                                    |
| AUD-07   | Corregido; recuperación previa de sugerencias completada en la ruta directa   | analysis-task-policy.test.ts, process/route.test.ts, verified-character-storage.test.ts, character-intelligence-actions.test.ts |
| AUD-08.1 | Corregido: invitación de un uso, límite IP y conflicto de correo controlado   | team/actions.test.ts                                                                                                            |
| AUD-08.2 | Corregido: streaming y aborto por tamaño real                                 | export/images.test.ts, conserva las pruebas anteriores de fuentes permitidas                                                    |
| AUD-08.3 | Corregido: secreto obligatorio en producción y validación de arranque         | export/signature.test.ts, env-schema.test.ts                                                                                    |
| AUD-08.4 | Corregido: excepción CSP de personajes retirada                               | proxy.test.ts: producción sin unsafe-inline y SVG sin style                                                                     |
| AUD-08.5 | Corregido: archivo de informes con enlaces compatibles                        | scripts/lib/audit-index.test.ts: índice y destinos                                                                              |
| AUD-08.6 | Propuesta documentada, sin refactorizar                                       | Sin cambio de comportamiento; ver informe vigente                                                                               |

Las pruebas de concurrencia unitarias emulan la exclusión de fila: no se afirma
que sean una prueba de carga real de PostgreSQL. Las regresiones se ejecutaron
en rojo antes de implementar su corrección y en verde después. No se reprodujo
el bloqueo de 103 segundos contra la instancia: el patrón se rechaza sin evaluarlo.

## Comandos obligatorios — salida completa capturada

### pnpm format:check

Código de salida: `0`.

```text
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
```

### pnpm lint

Código de salida: `0`.

```text
$ eslint .
```

### pnpm typecheck

Código de salida: `0`.

```text
$ pnpm --recursive --if-present typecheck && tsc --noEmit -p tsconfig.json
Scope: 7 of 8 workspace projects
packages/database typecheck$ tsc --noEmit
packages/editorial-engine typecheck$ tsc --noEmit
packages/shared typecheck$ tsc --noEmit
packages/editorial-engine typecheck: Done
packages/shared typecheck: Done
packages/book-schema typecheck$ tsc --noEmit
packages/export-engine typecheck$ tsc --noEmit
packages/templates typecheck$ tsc --noEmit
packages/database typecheck: Done
packages/templates typecheck: Done
packages/book-schema typecheck: Done
packages/export-engine typecheck: Done
apps/web typecheck$ tsc --noEmit
apps/web typecheck: Done
```

### pnpm test

Código de salida: `0`.

```text
$ vitest run

 RUN  v5.0.5 /workspace/scratch/d86fd8631bfb/remote-source


 Test Files  148 passed (148)
      Tests  1126 passed (1126)
   Start at  15:21:56
   Duration  12.80s (import 51%, tests 30%, transform 16%, worker 3%)

     Import  366 modules were evaluated 1039 times · 20.66s total, 51% of tracked time
             ~790ms faster with isolate: false — shared modules are evaluated once per worker instead of once per file
             learn more: https://vitest.dev/guide/improving-performance#test-isolation
```

## Prisma, compilación y navegador

- `pnpm db:generate`: correcto, cliente Prisma 6.19.3 generado.
- `pnpm build`: correcto, compilación Next.js 16.4.2 de producción.
- `pnpm test:e2e`: no llegó a arrancar localmente porque Docker no está instalado.
  Esta es una limitación del entorno, no un resultado aprobado de E2E:

```text
$ node --import tsx scripts/test-e2e-local.ts
No se pudieron ejecutar las pruebas E2E. Instala Docker Desktop o Docker Engine y vuelve a intentarlo.
No se pudo detener automáticamente la base temporal; revisa Docker Compose.
spawn docker ENOENT
[ELIFECYCLE] Command failed with exit code 1.
```

- E2E en GitHub: **94 aprobadas, 2 fallidas, 6 sin ejecutar**, sin intermitencias.
  Ejecución: https://github.com/cponce123com-create/Escribiendo/actions/runs/40577769637.
  No se declara la suite E2E global aprobada.

### Comparación comprobada con la base

La ejecución previa de `main` en `a8f53e4` ya fallaba en las mismas pruebas:
https://github.com/cponce123com-create/Escribiendo/actions/runs/40571180238.

| Ejecución            | Aprobadas | Fallidas | Intermitentes | Sin ejecutar |
| -------------------- | --------- | -------- | ------------- | ------------ |
| Base a8f53e4         | 93        | 2        | 1             | 6            |
| Correcciones 67d3497 | 94        | 2        | 0             | 6            |

Fallos preexistentes confirmados en ambas ejecuciones:

- `tests/e2e/manuscrito.spec.ts:326`: escribir durante un guardado acaba en
  `data-sync-state=conflict` y no alcanza `data-dirty=false` en la línea 360.
- `tests/e2e/maquetacion.spec.ts:235`: la comprobación de apertura detecta
  encabezado (`true`) donde espera que no aparezca (`false`), línea 302.

Los seis casos posteriores no se ejecutan por la secuencia serial de esos
bloques. Este lote no modifica el editor de secciones ni el compositor; no se
ocultaron ni relajaron esas aserciones. Quedan para un lote funcional aparte.

- Verificación e interfaz responsive en GitHub: aprobadas para el código indicado.
- Arranque negativo con URL de base ficticia: el hook rechaza la ausencia de
  EXPORT_SIGNING_SECRET con error de configuración. El proceso de prueba se
  detuvo mediante timeout; no se afirma un cierre espontáneo de Next.js.

## Activación y riesgos residuales

1. Antes del despliegue, configurar en Render EXPORT_SIGNING_SECRET aleatoria de
   al menos 32 caracteres. No se cambió ni consultó su valor real.
2. Para retención, crear secretos DATABASE_URL y opcional DIRECT_URL en Actions,
   ejecutar primero el modo manual dry-run y comprobar el reporte. No se activó
   ni ejecutó mantenimiento contra producción desde este entorno.
3. Validar manualmente la cadena de proxies en Render según SECURITY.md. El
   límite en memoria presupone una sola instancia; un atacante distribuido
   todavía podría provocar bloqueos de cuenta. No se implementó backoff creciente.
4. Los metadatos de imagen del navegador son informativos, no certificados por
   la API Admin. Los bytes y formato reales se controlan al descargar/decodificar.
5. Sin cambios de esquema ni migraciones nuevas; no se cambió el motor editorial.

## Propuesta sin implementación

La división de section-editor.tsx en persistencia, comandos, búsqueda, diálogos
y presentación, y la de books/actions.ts en libro, estructura, guardado/revisiones
y opciones editoriales, está detallada en [el informe vigente](seguridad-2026-10-27.md).

# Plan de implementación

Fecha: 21 de octubre de 2026.
Rama de trabajo: `main`. La rama `audit/optimization-95` conserva el estado
previo al Lote E.
Objetivo: llevar ESCRIBIENDO a una plataforma editorial completa, con
paridad funcional razonable con un estudio editorial profesional y con
evidencia ejecutada de cada afirmación.

Este plan no sustituye a [docs/ROADMAP.md](docs/ROADMAP.md), que describe el
alcance de cada fase, ni a [docs/AUDIT_FINAL.md](docs/AUDIT_FINAL.md), que
puntúa el resultado. Es la lista de trabajo: qué está hecho, qué falta, en qué
orden y cómo se comprueba.

## 1. Reglas permanentes

1. No se reinicia el proyecto ni se borran funcionalidades existentes.
2. Prohibido `prisma migrate reset`, `prisma db push` y cualquier migración
   destructiva. Toda migración es aditiva y se aplica primero en local y
   después en Neon, con el checksum verificado.
3. No se prueba contra producción.
4. No se exponen credenciales en el repositorio, en la documentación ni en los
   registros.
5. No se declara una prueba que no se haya ejecutado. Si una herramienta
   externa no está disponible (EPUBCheck, Word, LibreOffice), se dice.
6. Ninguna acción de la interfaz puede ser un botón sin efecto.
7. Solo se usan planes gratuitos: Neon Free, Render Free, Cloudinary Free.
   Ninguna función depende de un plan de pago.
8. Prioridad de producto: integridad del manuscrito, fidelidad editorial y
   calidad de exportación, por ese orden.

## 2. Estado de las fases

| Fase | Alcance                                 | Estado  | Commit               | Evidencia                                                              |
| ---- | --------------------------------------- | ------- | -------------------- | ---------------------------------------------------------------------- |
| 1    | Fundaciones, acceso privado, despliegue | Cerrada | `6eca9af`, `cd9492d` | Instalación, login, sesiones, CSP, health checks, migración inicial    |
| 2    | Biblioteca y manuscritos                | Cerrada | `e470565`            | CRUD, árbol de secciones, revisiones inmutables, progreso              |
| 3    | Escritura asistida y notas              | Cerrada | `b1f6257`            | Notas, objetivos, estadísticas, comentarios, flujo de revisión         |
| 4    | Maquetación                             | Cerrada | `0e2873b`            | Perfiles, plantillas, paginación por altura, vista previa a escala     |
| 5    | Exportación                             | Cerrada | `babac78`            | PDF digital/imprenta, EPUB 3, DOCX, cola idempotente, descarga firmada |
| 6    | Equipo y gobernanza                     | Cerrada | `0e0ed55`            | Invitaciones, roles, asignaciones, auditoría exportable, retención     |
| 7    | Operación editorial                     | Abierta | —                    | Cubiertas, pruebas de imprenta, catálogo, copias de seguridad, MFA     |

## 3. Lotes posteriores a la auditoría

| Lote | Qué corrige                                                                                           | Estado  | Commit    |
| ---- | ----------------------------------------------------------------------------------------------------- | ------- | --------- |
| 1    | Integridad del manuscrito: borradores en IndexedDB, máquina de estados, conflictos sin sobrescritura  | Cerrado | `9623712` |
| 6    | Equipo y gobernanza (cierre de la Fase 6)                                                             | Cerrado | `0e0ed55` |
| PDF  | Tipografía española sin pérdida silenciosa, `caracteresPerdidos`, banco de pruebas                    | Cerrado | `8c62aaa` |
| E    | Fidelidad editorial: tramos con formato de extremo a extremo, separadores de escena, imágenes en EPUB | Cerrado | `9074edb` |

Verificación del Lote E: 249 pruebas unitarias, 70 E2E, `format:check`,
`lint`, `typecheck` y `build` en verde; escáneres de codificación y BOM en 0.

## 4. Brechas abiertas y orden de trabajo

El orden es deliberado: primero lo que puede corromper o perder trabajo,
después lo que degrada la fidelidad, después la validación externa y por
último la operación.

### P0 — Integridad (sin brechas abiertas)

No queda ninguna brecha conocida de pérdida de manuscritos. Los borradores
locales, el control de orden, los reintentos y el panel de conflicto están
probados en `tests/e2e/manuscrito.spec.ts` y documentados en
[docs/RECOVERY_TESTS.md](docs/RECOVERY_TESTS.md).

### P1 — Fidelidad editorial

> **Estado a 21 de octubre de 2026.** Los puntos 1, 2 y 3 están **cerrados**
> (lotes I, J y K) y verificados con evidencia ejecutada; el punto 4 sigue
> abierto. El detalle de cada corrección está en
> [docs/AUDIT_CORRECTIONS.md](docs/AUDIT_CORRECTIONS.md).

#### 1. Imágenes en el editor y en todos los formatos — Cerrado

- **Qué faltaba.** El esquema Tiptap admitía `image` y el modelo la conservaba;
  el EPUB la incluía como recurso remoto. Pero el editor no permitía insertarlas,
  y el PDF y el DOCX no las dibujaban.
- **Qué se ha hecho.** El editor inserta imágenes de la biblioteca, la vista
  previa las dibuja con su tamaño y su pie, y PDF, EPUB y DOCX las incrustan. Una
  imagen inaccesible produce un aviso y un marcador, no una pérdida silenciosa.
- **Evidencia.** `packages/export-engine/src/image-export.test.ts`,
  `apps/web/src/lib/export/images.test.ts` y la prueba de extremo a extremo de
  exportación.
- **Lo que sigue abierto.** La subida real a Cloudinary: sin credenciales, el
  camino se valida por código y por pruebas de autorización, no con una cuenta
  real.

#### 2. Notas al pie y al final — Cerrado

- **Qué faltaba.** El esquema las admitía, pero no había extensión de editor ni
  composición en la paginación.
- **Qué se ha hecho.** Nodo de editor con numeración por orden de lectura,
  reserva de altura al pie de la página y exportación a PDF, EPUB (`epub:type`)
  y DOCX (nota real).
- **Evidencia.** `packages/export-engine/src/footnote-export.test.ts` y las
  pruebas de extremo a extremo del manuscrito.
- **Lo que sigue abierto.** Las notas muy largas (más de 2 000 caracteres) y la
  versión de texto plano.

#### 3. Fuentes incrustadas en el PDF — Cerrado

- **Qué faltaba.** El PDF usaba Times-Roman/Bold/Italic/BoldItalic estándar y
  medía con un modelo de anchos medios.
- **Qué se ha hecho.** Las caras de Liberation Fonts (SIL OFL) se incrustan como
  `Type0`/`CIDFontType2` con `FontFile2`, `Identity-H`, `ToUnicode` y la tabla
  de anchos real; la paginación usa las métricas de la fuente y coincide con
  la vista previa.
- **Evidencia.** `packages/export-engine/src/pdf-fonts.test.ts`, la prueba de
  extremo a extremo que extrae el texto del PDF y la validación externa con
  pdf.js.
- **Lo que sigue abierto.** No se generan subconjuntos (la fuente completa va
  incrustada) y la cobertura Unicode se limita a latín, griego y cirílico.

#### 4. Portada y contraportada

- **Qué falta.** El modelo de activos existe (`COVER_FRONT`, `COVER_BACK`,
  `FULL_COVER`), pero no hay flujo de subida ni uso en el EPUB.
- **Criterio de aceptación.** Subir una portada, verla en la ficha y que el
  EPUB la declare como `cover-image`.

### P2 — Validación externa y importación

#### 5. EPUBCheck y apertura real en Word

- **Qué falta.** No hay EPUBCheck ni Word/LibreOffice en la máquina de
  trabajo. Las pruebas comprueban la estructura del ZIP y del OOXML, no la
  validación de un validador externo.
- **Criterio de aceptación.** `epubcheck` sobre el archivo descargado sin
  errores, y el DOCX abierto en Word o LibreOffice sin reparaciones.
- **Regla.** Hasta entonces, la documentación dice «estructura verificada»,
  nunca «EPUB validado» ni «DOCX compatible con Word».
- **Estado a 21 de octubre de 2026.** El EPUB **sí** está validado por
  EPUBCheck 5.1.0 (0 errores, 0 advertencias) y el DOCX lo abre un lector
  OOXML independiente (Mammoth 1.11.0); además, el PDF lo abre pdf.js
  4.10.38. Los tres formatos tienen validación externa con evidencia
  ejecutada, salvo la apertura real en Word y LibreOffice, que no se ha hecho
  porque no están instalados. Ver `docs/EXPORT_VALIDATION.md`.

#### 6. Importadores

- **Qué falta.** No se importa DOCX, TXT, Markdown, HTML ni EPUB.
- **Criterio de aceptación.** Importar un manuscrito conservando capítulos,
  párrafos y formato básico, con un informe de lo que no se pudo conservar.
- **Riesgo.** Un importador que pierda formato en silencio es peor que no
  tenerlo: debe contar y avisar.

### P3 — Operación y despliegue

#### 7. Verificación en Render y Neon

- **Qué falta.** Desde esta máquina, la salida de red está filtrada y
  `https://escribiendo-6yep.onrender.com` no responde. La verificación del
  despliegue real no se puede repetir aquí.
- **Criterio de aceptación.** Health check en verde, login y una exportación
  completa contra el despliegue, con evidencia registrada.
- **Regla.** No se declara el despliegue verificado si no se ha ejecutado.

#### 8. Rotación de secretos

- Rotar la contraseña de Neon expuesta en una sesión anterior.
- Retirar `SETUP_TOKEN` de Render una vez instalada la cuenta.
- Revisar `EXPORT_SIGNING_SECRET` y las credenciales de Cloudinary.
- **Criterio de aceptación.** Los valores antiguos dejan de funcionar y el
  entorno sigue operativo.

#### 9. Copias de seguridad y restauración

- **Qué falta.** No hay copia verificada ni restauración ensayada.
- **Criterio de aceptación.** Un volcado restaurado en una base desechable,
  con recuento de filas y una exportación de comprobación.

### P4 — Fase 7 (operación editorial)

- Catálogo interno y estados de publicación.
- Pruebas de imprenta y control de versiones de edición.
- MFA para cuentas con `team:manage` o `audit:export`.
- Monitorización y revisión de dependencias automatizada.
- Borrado automático de un espacio de trabajo completo.

## 5. Protocolo de verificación

Antes de cada commit:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Además:

- Escáner de codificación y de BOM sobre el árbol.
- `pnpm bench:export` cuando cambie el motor de composición o exportación.
- Revisión del diff completo antes de commitear.
- Un commit por lote, con mensaje en español y sin acentos en el asunto.

Las pruebas E2E usan la base `escribiendo_test` en PostgreSQL local (puerto
5433), la compilación de producción en el puerto 3100 y orden alfabético con
`biblioteca.spec.ts` primero. El `global-setup` trunca las tablas y exige que
el nombre de la base contenga `test`.

## 6. Condiciones para declarar el 95

La puntuación no se declara por deseo. Se exige:

1. Las brechas P0 y P1 cerradas con pruebas ejecutadas. **Cumplido** salvo la
   portada y contraportada (Punto 4) y la cobertura Unicode más allá de
   latín, griego y cirílico.
2. EPUBCheck y Word/LibreOffice ejecutados sobre archivos reales. **A medias**:
   EPUBCheck se ejecuta y aprueba el EPUB; el PDF lo abre pdf.js y el DOCX lo
   abre Mammoth. Word y LibreOffice no están instalados en la máquina.
3. Despliegue en Render verificado desde una red sin filtro. **Pendiente**: la
   red de esta máquina está filtrada.
4. Secretos rotados y `SETUP_TOKEN` retirado. **Pendiente**: son acciones de
   operación, de coste casi nulo y de impacto alto.
5. Copia de seguridad restaurada en una base desechable. **Pendiente**.
6. Todas las afirmaciones de la documentación con evidencia reproducible.
   **Cumplido** tras el Lote T, que reparó el README y el ROADMAP.

Mientras falte cualquiera de estos puntos, la puntuación se queda por debajo
y se explica por qué. La honestidad del informe es parte del producto.

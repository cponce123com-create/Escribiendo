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

Verificación del Lote E: 248 pruebas unitarias, 70 E2E, `format:check`,
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

#### 1. Imágenes en el editor y en todos los formatos

- **Qué falta.** El esquema Tiptap admite `image` y el modelo la conserva; el
  EPUB la incluye como recurso remoto. Pero el editor no permite insertarlas,
  y el PDF y el DOCX no las dibujan.
- **Por qué importa.** Un libro ilustrado no se puede producir hoy.
- **Archivos.** `section-editor.tsx` (extensión de imagen y subida),
  `lib/cloudinary/signature.ts` (carpeta de ilustraciones),
  `packages/export-engine/src/pdf.ts` (XObject de imagen),
  `packages/export-engine/src/docx.ts` (medios y `<w:drawing>`).
- **Criterio de aceptación.** Insertar una imagen en el editor, verla en la
  vista previa, descargarla en PDF, EPUB y DOCX, y que una imagen inaccesible
  produzca un aviso, no una pérdida silenciosa.
- **Dependencia.** Cloudinary configurado en el entorno de pruebas. Sin
  credenciales locales, la subida no se puede probar de extremo a extremo y
  así se declarará.

#### 2. Notas al pie y al final

- **Qué falta.** El esquema las admite, pero no hay extensión de editor ni
  composición en la paginación.
- **Por qué importa.** Es un requisito de ensayo y de traducción.
- **Archivos.** `book-schema` (nodo), `section-editor.tsx`, `pagination.ts`
  (reserva al pie de la página), `pdf.ts`, `epub.ts`, `docx.ts`.
- **Criterio de aceptación.** Una nota insertada en el capítulo aparece en la
  misma página del PDF, como `epub:type="footnote"` en EPUB y como nota real
  en DOCX, sin desplazar el cuerpo de forma incorrecta.

#### 3. Fuentes incrustadas en el PDF

- **Qué falta.** El PDF usa Times-Roman/Bold/Italic/BoldItalic estándar y mide
  con un modelo de anchos medios.
- **Por qué importa.** La paginación es una estimación; con la fuente real
  sería exacta, y la imprenta exige fuentes incrustadas.
- **Archivos.** `packages/export-engine/src/pdf.ts` (objetos de fuente,
  `FontFile2`, `CIDFontType2`, subconjunto), `measure.ts` (tabla de anchos).
- **Criterio de aceptación.** Un PDF con una fuente libre incrustada, texto
  extraíble y paginación idéntica a la vista previa.
- **Riesgo.** El subconjunto de glifos y `ToUnicode` es trabajo fino; no se
  debe afirmar PDF/X sin preflight real.

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

1. Las brechas P0 y P1 cerradas con pruebas ejecutadas.
2. EPUBCheck y Word/LibreOffice ejecutados sobre archivos reales.
3. Despliegue en Render verificado desde una red sin filtro.
4. Secretos rotados y `SETUP_TOKEN` retirado.
5. Copia de seguridad restaurada en una base desechable.
6. Todas las afirmaciones de la documentación con evidencia reproducible.

Mientras falte cualquiera de estos puntos, la puntuación se queda por debajo
y se explica por qué. La honestidad del informe es parte del producto.

# Auditoría de referencia para la meta 95

Fecha: 21 de octubre de 2026.
Rama: `improvement/escribiendo-95`.
Base: `0f65b1e` (la versión estable sigue en `main`).

Esta auditoría no acepta como cierta ninguna puntuación anterior. Cada
hallazgo se ha comprobado contra el código de esta rama y cada corrección se
ha sometido a las pruebas del repositorio. La puntuación de 95 **no se declara
alcanzada**: este documento registra la línea base y lo que queda abierto.

## Línea base ejecutada

Antes de tocar el código se ejecutaron los mismos comandos que se usan para
cerrar un lote:

| Comprobación      | Comando             | Resultado en la base `0f65b1e` |
| ----------------- | ------------------- | ------------------------------ |
| Formato           | `pnpm format:check` | Correcto                       |
| Análisis estático | `pnpm lint`         | Sin errores                    |
| Tipos             | `pnpm typecheck`    | Sin errores                    |
| Pruebas unitarias | `pnpm test`         | 252 pruebas, 27 archivos       |
| Compilación       | `pnpm build`        | Correcto, Next.js 16.4.2       |
| Extremo a extremo | `pnpm test:e2e`     | 70 pruebas en Chromium         |

Después del lote de imágenes y de las pruebas nuevas de esta rama:

| Comprobación        | Resultado                |
| ------------------- | ------------------------ |
| Pruebas unitarias   | 268 pruebas, 30 archivos |
| Extremo a extremo   | 71 pruebas en Chromium   |
| Formato, lint       | Sin errores              |
| Tipos y compilación | Sin errores              |

Las cifras son de esta máquina y de la compilación de producción local. No
presumen el comportamiento del despliegue de Render.

## Hallazgos comprobados y corregidos en el lote de imágenes

| #    | Hallazgo comprobado                                                                                                       | Corrección                                                                                                                                           | Evidencia                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| I-1  | El editor solo registraba `StarterKit`: no había nodo de imagen ni forma de insertar una.                                 | Nodo Tiptap `image` con `src`, `alt`, `caption`, dimensiones, porcentaje, alineación y `publicId`; controles de inserción.                           | `editorial-image.ts`, `section-image-controls.tsx`, E2E de controles |
| I-2  | El modelo de maquetación descartaba la imagen y su pie.                                                                   | `LayoutBlock.image`, `imageLayout` y altura real en la paginación.                                                                                   | `packages/editorial-engine/src/image.test.ts`, `pagination.test.ts`  |
| I-3  | El PDF no dibujaba imágenes; el DOCX tampoco; el EPUB solo conservaba una URL remota.                                     | PDF con XObjects JPEG `DCTDecode`; EPUB con `EPUB/images/`; DOCX con `word/media/`, relaciones y `wp:inline`.                                        | `image-export.test.ts` (6 pruebas)                                   |
| I-4  | Una imagen no disponible podía desaparecer sin aviso.                                                                     | PDF dibuja un marco con el texto alternativo; DOCX deja `[Imagen: …]`; EPUB conserva el recurso remoto y lo declara; los metadatos cuentan omitidas. | `image-export.test.ts`, panel de exportación                         |
| I-5  | El PDF empezaba los objetos en 0, un número reservado por la especificación.                                              | El objeto 0 queda libre; el catálogo empieza en 1 y la tabla `xref` lo refleja.                                                                      | `pdf.test.ts`, `image-export.test.ts`                                |
| I-6  | Los metadatos PDF se escribían como cadenas Latin-1 y perdían títulos con caracteres fuera de esa tabla.                  | Título, autoría y asunto se escriben como cadenas UTF-16BE (`FEFF…`) en el diccionario de información.                                               | `pdf.test.ts`                                                        |
| I-7  | `Asset` y `BookAsset` existían en Prisma pero no se usaban: no había biblioteca ni persistencia de imágenes.              | Consulta de biblioteca por libro, registro autorizado de `Asset`/`BookAsset`, metadatos y auditoría.                                                 | `assets.ts`, `asset-actions.ts`                                      |
| I-8  | La firma de Cloudinary solo autorizaba la carpeta de portadas; una carpeta interior podía pedirse sin comprobar el libro. | La firma interior exige `section:update`, un libro del espacio de trabajo y una carpeta con espacio, libro e interior.                               | `api/cloudinary/signature/route.ts`, E2E de seguridad                |
| I-9  | Descargar una URL arbitraria del manuscrito desde el servidor era una puerta abierta a SSRF.                              | Solo HTTPS de `res.cloudinary.com/<cloudName>/image/upload/…`, con comprobación también de la URL final tras redirecciones.                          | `images.test.ts`                                                     |
| I-10 | El nombre del archivo de descarga se copiaba a `Content-Disposition` sin limpiar.                                         | Se eliminan controles, comillas y separadores de ruta; se envía `filename` ASCII y `filename*` RFC 5987.                                             | Ruta de descarga; revisión de código                                 |

## Lo que se ha ejecutado, no solo leído

- `pnpm test`: 268 pruebas en 30 archivos.
- `pnpm test:e2e`: 71 pruebas en Chromium contra la compilación de producción.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` y `pnpm build`: correctos.
- `pnpm bench:export`: medición reproducida; las cifras están en
  [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md).

## Lo que sigue abierto

Estas ausencias impiden declarar 95 y no se compensan con una estimación:

1. **Notas al pie.** No hay nodo de editor, numeración, composición al pie ni
   exportación a PDF, EPUB y DOCX.
2. **PDF con Unicode completo.** El cuerpo sigue usando Times/WinAnsi. Los
   caracteres sin equivalente se sustituyen por `□` y se cuentan; no hay
   fuentes TTF incrustadas ni tabla de anchos real.
3. **Validación externa.** No se ha pasado EPUBCheck, no se ha abierto el DOCX
   en Word o LibreOffice y no se ha probado un EPUB en un lector comercial.
4. **Cloudinary real.** No hay credenciales locales: la subida se ha validado
   por código y por las pruebas de autorización, no con una cuenta real.
5. **Render y Neon reales.** El despliegue no es accesible desde esta red; las
   pruebas de carga y las cabeceras contra producción siguen pendientes.
6. **Puntuación.** La última medición documentada es 87,4/100. No se emite una
   puntuación nueva hasta cerrar los lotes de notas, Unicode y validación
   externa.

## Bloqueos externos conocidos

- EPUBCheck no está instalado y requiere Java.
- Word y LibreOffice no están disponibles en la máquina.
- Cloudinary no está configurado en el entorno local.
- El puerto 5432 de Neon está filtrado; las comprobaciones de base usan la API
  SQL por HTTPS.
- Render Free no es accesible desde aquí.

Ningún bloqueo anterior se presenta como un éxito. La rama se considera una
mejora verificada del lote de imágenes, no la versión 95 terminada.

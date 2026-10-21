# Auditoría final

Fecha: 20 de octubre de 2026.
Rama: `main`.
Alcance: las Fases 1 a 6 de ESCRIBIENDO.

## Cómo se puntúa

Cada área se valora con los mismos pesos, y la puntuación solo sube si hay
evidencia ejecutada:

| Criterio                | Peso |
| ----------------------- | ---: |
| Funcionalidad real      | 25 % |
| Seguridad y resiliencia | 20 % |
| Pruebas y evidencia     | 20 % |
| Rendimiento             | 15 % |
| Mantenibilidad          | 10 % |
| Documentación           | 10 % |

Donde un criterio no sea aplicable, se dice y se redistribuye su peso.

## Puntuación por área

| Área                         |  Antes | Después | Evidencia                                                                                        | Pendiente                                  |
| ---------------------------- | -----: | ------: | ------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Arquitectura                 |     88 |      90 | Ocho paquetes con responsabilidad única; `team/` y `editor/` no acoplan nada                     | —                                          |
| Organización del repositorio |     92 |      93 | Códigos nuevos con pruebas propias en el mismo sitio                                             | —                                          |
| Prisma ORM                   |     87 |      90 | 3 migraciones aditivas, 20 tablas, 16 `CHECK`, índices en las columnas nuevas                    | —                                          |
| Autenticación                |     84 |      87 | Sesiones opacas, argon2id, bloqueo de cuenta, invitaciones con huella de token                   | Sin segundo factor                         |
| Seguridad                    |     80 |      87 | Roles en servidor, descarga firmada, auditoría con permiso, sin pérdida silenciosa de caracteres | Sin auditoría de dependencias automatizada |
| Biblioteca                   |     90 |      90 | Búsqueda, filtros, árbol de secciones                                                            | —                                          |
| Editor                       |     78 |      89 | Tiptap, borradores locales, conflictos, subrayado y enlaces en la barra                          | Sin imágenes ni notas al pie               |
| **Guardado y recuperación**  | **48** |  **90** | 9 pruebas E2E de resiliencia y 27 unitarias de la máquina de estados                             | —                                          |
| Historial                    |     88 |      90 | Revisiones inmutables, trigger y restauración como versión nueva                                 | —                                          |
| Revisión editorial           |     88 |      91 | Comentarios, resolución, aprobación condicionada, asignación por persona                         | —                                          |
| Maquetación                  |     72 |      84 | Geometría validada, paginación por altura, tramos con formato y separadores de escena            | Imágenes en la maqueta                     |
| PDF                          |     55 |      81 | Unicode español, negrita/cursiva/subrayado/tachado, superíndices y separadores sin pérdida       | Métricas reales de fuente, imágenes        |
| EPUB                         |     78 |      86 | EPUB 3 con formato en línea, separadores e imágenes remotas declaradas                           | Validación con EPUBCheck, portada          |
| DOCX                         |     72 |      82 | OOXML con tramos, hipervínculos con relación externa y separadores dibujados                     | Apertura real en Word, imágenes, notas     |
| Exportaciones                |     72 |      86 | Cola idempotente, descarga firmada, metadatos, 200 000 palabras en 230 ms                        | Límite explícito de tamaño por petición    |
| UX/UI                        |     85 |      89 | Estado de guardado honesto, equipo, Conflictos con comparación                                   | —                                          |
| Render Free                  |     80 |      90 | Sin procesos permanentes; la exportación de 200 k palabras usa 56 MB                             | —                                          |
| Pruebas                      |     86 |      94 | 249 unitarias y 70 E2E, con resiliencia, formato en línea y exportación                          | Sin navegador distinto de Chromium         |
| Documentación                |     93 |      96 | Auditoría, correcciones, recuperación, exportaciones, rendimiento, ROADMAP                       | —                                          |
| Escalabilidad                |     72 |      80 | Consultas acotadas por estudio; exportación lineal con el tamaño                                 | Techo de memoria en la exportación         |

**Media de áreas: 88,3 sobre 100** (antes: 86,5). La media ponderada por
criterios se estima en **87,4** (antes: 85,6), con el mismo desplazamiento que
la media de áreas. La estimación no reclama precisión que no se haya medido.

## La meta de 95 no se alcanza, y esto es lo que falta

No se ha alcanzado el 95 porque quedan tres cosas **sin hacer**, todas
identificadas y acotadas:

### 1. Modelo editorial estructurado (resuelto para el formato en línea; faltan imágenes y notas)

El Lote E ha sustituido la conversión plana por un modelo de tramos
(`InlineRun` con sus marcas) que comparten la vista previa, el PDF, el EPUB y
el DOCX. Se conservan negrita, cursiva, subrayado, tachado, superíndices,
subíndices y enlaces. Los separadores de escena dejan de ser saltos de página
y se dibujan como `* * *`, `<hr class="scene"/>` o una línea de párrafo. Los
títulos se miden con el ancho de la negrita que después se dibuja, de modo que
la línea calculada y la impresa coinciden.

Queda pendiente dentro de esta brecha:

- **Imágenes.** El modelo las conserva (`LayoutBlock.image`), el EPUB las
  incluye como recurso remoto declarado, pero el PDF y el DOCX todavía no las
  dibujan.
- **Notas al pie.** El esquema las admite, pero no hay editor ni composición
  de notas.

### 2. Fuentes incrustadas en el PDF (afecta a PDF)

El PDF usa las fuentes estándar, que el lector ya tiene. Es una decisión
razonable (archivos pequeños, se abren en cualquier visor) pero tiene un
coste: la paginación es una **estimación** con un modelo de anchos medios, y
el justificado es aproximado.

La solución es incrustar el TTF, subconjuntarlo y escribir la tabla de anchos
(`W`) en el PDF. Es trabajo de la producción final, no una corrección
puntual.

### 3. Validación con herramientas externas (afecta a EPUB y DOCX)

El EPUB tiene la estructura que exige la especificación y se ha verificado
byte a byte, pero no se ha pasado por EPUBCheck. El DOCX tiene la estructura
OOXML correcta, pero no se ha abierto en Microsoft Word ni en LibreOffice. No
se afirma más de lo que se ha comprobado.

## Errores encontrados y corregidos en esta auditoría

| #   | Error                                                                                      | Gravedad | Estado    |
| --- | ------------------------------------------------------------------------------------------ | -------- | --------- |
| 1   | Autoguardado de 60 s: hasta un minuto de trabajo se perdía                                 | Crítica  | Corregido |
| 2   | Sin copia local del manuscrito                                                             | Crítica  | Corregido |
| 3   | `setDirty(false)` marcaba como guardado lo escrito durante la petición                     | Crítica  | Corregido |
| 4   | Sin control del orden de las respuestas                                                    | Alta     | Corregido |
| 5   | Un conflicto obligaba a recargar, con lo que el trabajo se perdía                          | Alta     | Corregido |
| 6   | Sin detección de conexión                                                                  | Media    | Corregido |
| 7   | Un autoguardado pospuesto se tomaba por un guardado real                                   | Alta     | Corregido |
| 8   | El PDF sustituía las comillas tipográficas, la raya larga y los puntos suspensivos por `?` | Alta     | Corregido |
| 9   | Las marcas de corte dependían del sangrado                                                 | Media    | Corregido |
| 10  | El folio caía fuera de la hoja con la distancia del pie a cero                             | Media    | Corregido |
| 11  | La distancia del encabezado o del pie podía ser cero                                       | Media    | Corregido |
| 12  | El panel lateral anunciaba como «próximas» las Fases 3, 4 y 5, ya hechas                   | Media    | Corregido |
| 13  | Los archivos de prueba se ejecutaban en un orden que rompía la suite                       | Media    | Corregido |
| 14  | Un comentario del código contenía texto corrupto en cirílico                               | Menor    | Corregido |
| 15  | La exportación convertía los separadores de escena en saltos de página                     | Alta     | Corregido |
| 16  | La exportación aplanaba el formato en línea y descartaba las imágenes                      | Alta     | Corregido |
| 17  | La paginación perdía los tramos al convertir las líneas para el PDF                        | Alta     | Corregido |
| 18  | Los títulos se medían como redonda y se imprimían en negrita                               | Media    | Corregido |

## Estado de las condiciones de cierre

| Condición                                            | Estado                                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Riesgo conocido de pérdida silenciosa de manuscritos | **Resuelto**: borrador local, control de orden y avisos de conflicto                      |
| Vulnerabilidad crítica sin corregir                  | No consta ninguna abierta en esta auditoría                                               |
| Exportación que pierde caracteres                    | **Resuelto** para la tipografía española; el resto se avisa                               |
| Archivos PDF corruptos                               | No: la cabecera, la estructura y el cierre se comprueban en cada prueba                   |
| Pérdida de imágenes o formato sin advertencia        | **Resuelto** para el formato en línea, los separadores y las imágenes en PDF, EPUB y DOCX |
| Migraciones destructivas no autorizadas              | Ninguna: las tres migraciones son aditivas                                                |
| Pruebas críticas fallidas                            | Ninguna: 280 unitarias y 72 E2E en verde                                                  |
| Error de compilación                                 | Ninguno                                                                                   |
| Regresión funcional                                  | Ninguna detectada                                                                         |
| Exposición de secretos                               | Ninguna: escaneo del árbol y del historial de commits                                     |

## Lo que no se ha verificado

- **El despliegue real de Render.** La salida de red de la máquina de trabajo
  está filtrada y `https://escribiendo-6yep.onrender.com` no responde desde
  aquí. Ninguna puntuación presume ese extremo. La migración de la Fase 6 sí
  está aplicada en Neon, comprobada con consultas de comportamiento.
- **El comportamiento con carga real.** Las cifras de rendimiento son de
  entorno local.
- **Otros navegadores.** Solo se ha probado Chromium.
- **La lectura real de los archivos EPUB y DOCX** por parte de aplicaciones de
  usuario final.

---

## Actualización de la rama `improvement/escribiendo-95`

Fecha: 21 de octubre de 2026.
Base: `0f65b1e`.
Alcance cerrado en esta actualización: imágenes de extremo a extremo.

La puntuación de 95 **no se declara alcanzada**. La última medición documentada
sigue siendo 87,4/100 y no se sustituye por una estimación. Esta actualización
solo registra lo que se ha ejecutado y lo que falta.

### Correcciones verificadas

- El editor tiene un nodo de imagen con pie, dimensiones, porcentaje y
  alineación; la biblioteca del libro inserta imágenes ya subidas.
- `Asset` y `BookAsset` se usan de verdad: la subida se registra con
  autorización por espacio de trabajo y por libro.
- La firma de Cloudinary distingue portada e interior; la carpeta interior
  incluye el espacio y el libro, y exige `section:update`.
- La maqueta reserva altura para la imagen y su pie; la vista previa y el PDF
  cuentan la misma caja.
- El PDF incrusta JPEG como XObject `DCTDecode`; el EPUB guarda las imágenes en
  `EPUB/images/` y el DOCX en `word/media/`. Si falta una imagen, queda un
  marcador visible o un recurso remoto declarado, nunca una desaparición
  silenciosa.
- El PDF ya no usa el objeto 0 y sus metadatos se escriben en UTF-16BE.
- La descarga sanea el nombre del archivo y la red de exportación solo acepta
  HTTPS de la cuenta de Cloudinary configurada, con timeout, tamaño máximo y
  comprobación de la URL final.

### Evidencia

| Comprobación        | Resultado                                  |
| ------------------- | ------------------------------------------ |
| `pnpm test`         | 268 pruebas, 30 archivos                   |
| `pnpm test:e2e`     | 71 pruebas en Chromium                     |
| `pnpm format:check` | Correcto                                   |
| `pnpm lint`         | Sin errores                                |
| `pnpm typecheck`    | Sin errores                                |
| `pnpm build`        | Correcto                                   |
| `pnpm bench:export` | Ejecutado; cifras en PERFORMANCE_REPORT.md |

### Pendiente para 95

1. Notas al pie: cerradas en el Lote J (ver la actualización posterior); queda
   el formato enriquecido y la división de notas excepcionalmente largas.
2. PDF con Unicode completo y fuentes TTF incrustadas.
3. EPUBCheck, Word/LibreOffice y un lector de EPUB real.
4. Subida real a Cloudinary con credenciales.
5. Pruebas contra Render y carga real.
6. Auditoría externa de seguridad y escaneo de dependencias.

Ninguno de estos puntos se ha sustituido por una afirmación. El detalle está en
[AUDIT_BASELINE_95.md](AUDIT_BASELINE_95.md).

---

## Actualización de la rama `improvement/escribiendo-95`: notas al pie

Fecha: 21 de octubre de 2026.
Base del lote: `4211bb6`.
Alcance cerrado: notas al pie de extremo a extremo.

La puntuación de 95 **sigue sin declararse alcanzada**. La última medición
documentada continúa siendo 87,4/100. Esta actualización registra únicamente lo
que se ha ejecutado.

### Correcciones verificadas

- El editor tiene un nodo `footnote` atómico, un botón «†», edición de la nota
  al pulsar la llamada y numeración dinámica por orden de lectura.
- El esquema rechaza notas sin identificador, vacías, con contenido anidado o
  de más de 2000 caracteres.
- La numeración es global entre secciones y no se congela en el JSON: la
  vista previa, el PDF, el EPUB y el DOCX comparten el mismo orden.
- La paginación compone las notas al 78 % del cuerpo, reserva su altura y
  emite `FOOTNOTE_OVERFLOW` si una nota no cabe con su llamada.
- La vista previa dibuja el área de notas con su línea separadora.
- El EPUB usa `epub:type="noteref"` y `epub:type="footnote"`; el DOCX incluye
  `word/footnotes.xml`, la relación, el tipo de contenido y los estilos; el PDF
  dibuja la línea y las notas al pie de cada página.

### Evidencia

| Comprobación        | Resultado                |
| ------------------- | ------------------------ |
| `pnpm test`         | 280 pruebas, 31 archivos |
| `pnpm test:e2e`     | 72 pruebas en Chromium   |
| `pnpm format:check` | Correcto                 |
| `pnpm lint`         | Sin errores              |
| `pnpm typecheck`    | Sin errores              |
| `pnpm build`        | Correcto                 |
| `pnpm bench:export` | Ejecutado                |

### Pendiente para 95

1. PDF con Unicode completo y fuentes TTF incrustadas.
2. EPUBCheck, Word/LibreOffice y un lector de EPUB real.
3. Subida real a Cloudinary con credenciales.
4. Pruebas contra Render y carga real.
5. Auditoría externa de seguridad y escaneo de dependencias.
6. Notas con formato enriquecido y división automática de notas muy largas.

Ninguno de estos puntos se ha sustituido por una afirmación. El detalle está en
[AUDIT_BASELINE_95.md](AUDIT_BASELINE_95.md).

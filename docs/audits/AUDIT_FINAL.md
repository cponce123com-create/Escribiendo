# Auditoría final

Fecha: 20 de octubre de 2026.
Rama: `main`.
Alcance: las Fases 1 a 6 de ESCRIBIENDO.

> La tabla de puntuación y las secciones siguientes son la fotografía de la
> auditoría del 20 de octubre. Al final del documento están las actualizaciones
> de los lotes J a S, que son **el estado vigente**: imágenes y notas al pie en
> las exportaciones, fuentes TTF incrustadas con métricas reales, archivos
> comprimidos, validación externa con EPUBCheck, Mammoth y pdf.js, integración
> continua y auditoría de accesibilidad. La puntuación documentada sigue siendo
> 87,4/100: **95 no se declara**.

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

> Esta tabla es la fotografía de la auditoría del 20 de octubre de 2026. Las
> actualizaciones de los lotes J, K y L, al final del documento, corrigen lo
> que entonces estaba pendiente: imágenes y notas al pie en las exportaciones,
> fuentes TTF incrustadas con métricas reales y validación externa con
> EPUBCheck y con un lector de DOCX. La puntuación no se recalcula sin cerrar
> además los bloqueos externos.

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
| Pruebas críticas fallidas                            | Ninguna: 337 unitarias y 81 E2E en verde                                                  |
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
| `pnpm test:e2e`     | 80 pruebas en Chromium   |
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

---

## Actualización de la rama `improvement/escribiendo-95`: fuentes TTF y PDF Unicode

Fecha: 21 de octubre de 2026.
Base del lote: `dc7c6ea`.
Alcance cerrado: fuentes TTF incrustadas, métricas reales y extracción de texto.

La puntuación de 95 **sigue sin declararse alcanzada**. La última medición
documentada continúa siendo 87,4/100. Esta actualización registra únicamente lo
que se ha ejecutado.

### Correcciones verificadas

- El PDF incrusta las caras Liberation que usa el documento como
  `Type0`/`CIDFontType2`, con `FontFile2`, `Identity-H`, `CIDToGIDMap
/Identity`, tabla de anchos real y mapa `ToUnicode`.
- La paginación, los pies de imagen, las notas, las reglas y los folios usan
  `MeasureText`; ya no se decide el corte con un modelo de anchos medios cuando
  las fuentes están disponibles.
- La vista previa usa el mismo medidor real que el PDF, así que sus cortes de
  línea coinciden con los del archivo exportado. Si las fuentes no se pueden
  leer, la vista previa y la exportación lo declaran.
- La cursiva se mide con su propia cara, no con los anchos de la redonda.
- El justificado de dos bytes se reparte con `TJ` y el avance de cada tramo
  incluye el espacio extra, de modo que el texto siguiente no se solapa.
- Si las fuentes no se cargan, el PDF conserva Times/WinAnsi y el panel avisa
  de que la paginación es estimada.
- La prueba E2E extrae el texto del PDF con su `ToUnicode` y comprueba
  comillas angulares, raya, puntos suspensivos, `niño`, `caía` y `miró`.

### Evidencia

| Comprobación        | Resultado                                                      |
| ------------------- | -------------------------------------------------------------- |
| `pnpm test`         | 332 pruebas, 35 archivos                                       |
| `pnpm test:e2e`     | 80 pruebas en Chromium                                         |
| `pnpm format:check` | Correcto                                                       |
| `pnpm lint`         | Sin errores                                                    |
| `pnpm typecheck`    | Sin errores                                                    |
| `pnpm build`        | Correcto                                                       |
| `pnpm bench:export` | 112 ms paginación y 227 ms PDF para 200 000 palabras; 5 387 KB |

### Pendiente para 95

1. Cobertura Unicode más allá de latín, griego y cirílico: CJK, emoji y shaping
   complejo. No se ha añadido una cadena de fuentes de reserva por script.
2. Subconjuntos de fuente para reducir el tamaño del PDF.
3. Word y LibreOffice, que no están instalados en esta máquina, y la lectura en
   un lector de EPUB comercial.
4. Subida real a Cloudinary con credenciales.
5. Pruebas contra Render y carga real.
6. Auditoría externa de seguridad y prueba de penetración. El escaneo de
   dependencias ya se ejecuta (`pnpm audit`).

Ninguno de estos puntos se ha sustituido por una afirmación. El detalle está en
[AUDIT_BASELINE_95.md](AUDIT_BASELINE_95.md).

---

## Actualización de la rama `improvement/escribiendo-95`: validación externa (Lote L)

Fecha: 21 de octubre de 2026.
Base del lote: `86610b6`.
Alcance cerrado: EPUB validado con EPUBCheck, DOCX leído con un lector
independiente y escaneo de dependencias ejecutado.

La puntuación de 95 **sigue sin declararse alcanzada** y la última medición
documentada continúa siendo 87,4/100.

### Correcciones verificadas

- El EPUB lo aprueba **EPUBCheck 5.1.0** (reglas EPUB 3.3): 0 errores fatales,
  0 errores, 0 advertencias y 0 indicaciones. La prueba de extremo a extremo
  valida el archivo que descarga la aplicación, no un ejemplo.
- El DOCX lo lee **Mammoth 1.11.0**, un lector OOXML independiente del motor
  que lo escribe: devuelve el texto, la negrita, la cursiva, el enlace, la
  llamada con su nota al pie y la imagen incrustada.
- `pnpm audit --prod` no encuentra vulnerabilidades conocidas. El aviso alto de
  `deepmerge-ts` que llegaba por el CLI de Prisma se corrige con un `override`
  a la versión 8.0.0 y se comprueba que Prisma sigue funcionando.

### Evidencia

| Comprobación         | Resultado                                               |
| -------------------- | ------------------------------------------------------- |
| `pnpm validate:epub` | 0 errores, 0 advertencias (EPUBCheck 5.1.0)             |
| E2E con EPUBCheck    | El EPUB descargado por la aplicación valida sin errores |
| `pnpm validate:docx` | El DOCX lo lee Mammoth 1.11.0                           |
| `pnpm audit --prod`  | Sin vulnerabilidades conocidas                          |
| `pnpm test`          | 332 pruebas, 35 archivos                                |
| `pnpm test:e2e`      | 80 pruebas en Chromium                                  |

El detalle está en [EXPORT_VALIDATION.md](../EXPORT_VALIDATION.md) y en
[AUDIT_CORRECTIONS.md](AUDIT_CORRECTIONS.md).

---

## Actualizacion de la rama `improvement/escribiendo-95`: compresion y validacion del PDF (Lote M)

Fecha: 21 de octubre de 2026.
Base del lote: `c43ee27`.
Alcance cerrado: archivos comprimidos y validacion externa del PDF.

La puntuacion de 95 **sigue sin declararse alcanzada** y la ultima medicion
documentada continua siendo 87,4/100.

### Correcciones verificadas

- Los flujos del PDF (contenido, programa de la fuente y mapa `ToUnicode`) van
  comprimidos con `FlateDecode`. El PDF de 200 000 palabras pasa de 5 387 KB a
  671 KB.
- Las entradas del ZIP del EPUB y del DOCX van comprimidas con Deflate. La
  entrada `mimetype` del EPUB sigue sin comprimir y en primer lugar.
- El PDF lo abre **pdf.js 4.10.38**, el lector de Mozilla, que es independiente
  del motor de escritura: devuelve el texto con la fuente incrustada y el mapa
  `ToUnicode`. Con el Lote L, el EPUB lo aprobaba EPUBCheck y el DOCX lo leia
  Mammoth: los tres formatos tienen validacion externa.
- La prueba de extremo a extremo deja el PDF y el DOCX que descarga la
  aplicacion en `test-results/`, para poder abrirlos con esas herramientas.

### Evidencia

| Comprobacion         | Resultado                                                         |
| -------------------- | ----------------------------------------------------------------- |
| `pnpm validate:pdf`  | pdf.js abre el PDF y extrae el texto                              |
| `pnpm validate:epub` | 0 errores y 0 advertencias con EPUBCheck 5.1.0                    |
| `pnpm validate:docx` | Mammoth 1.11.0 lee el documento                                   |
| `pnpm bench:export`  | PDF de 671 KB, EPUB de 29 KB y DOCX de 8 KB para 200 000 palabras |
| `pnpm test`          | 332 pruebas, 35 archivos                                          |
| `pnpm test:e2e`      | 80 pruebas en Chromium                                            |

El detalle esta en [EXPORT_VALIDATION.md](../EXPORT_VALIDATION.md) y en
[AUDIT_CORRECTIONS.md](AUDIT_CORRECTIONS.md).

---

## Actualizacion de la rama `improvement/escribiendo-95`: prueba de esfuerzo (Lote N)

Fecha: 21 de octubre de 2026.
Base del lote: `29dac65`.
Alcance cerrado: prueba de esfuerzo con imagenes y notas al pie, y correccion
del consumo de memoria del escritor de ZIP.

La puntuacion de 95 **sigue sin declararse alcanzada** y la ultima medicion
documentada continua siendo 87,4/100.

### Correcciones verificadas

- `pnpm stress:export` genera un manuscrito de 200 000 palabras, 80
  fotografias y 500 notas al pie y exporta los tres formatos midiendo tiempo,
  tamano y memoria maxima.
- **La prueba encontro un fallo real.** La primera ejecucion daba 1 647 MB de
  memoria: el escritor de ZIP armaba el archivo en una lista de numeros y un
  ZIP de 40 MB ocupaba mas de un gigabyte. Un libro con 80 fotografias no
  cabia en Render Free.
- Con un bufer de bytes que crece por duplicacion, la memoria maxima baja a
  **367 MB** (margen de 145 MB sobre los 512 MB de Render Free) y la escritura
  del EPUB y del DOCX es el doble de rapida.
- El PDF no habia cambiado: se quedaba en 259 MB.

### Evidencia

| Comprobacion         | Resultado                                                     |
| -------------------- | ------------------------------------------------------------- |
| `pnpm stress:export` | PDF de 588 ms y 40 159 KB, EPUB de 1 413 ms, DOCX de 1 355 ms |
| Memoria maxima       | 367 MB, con margen de 145 MB sobre los 512 MB de Render Free  |
| `pnpm test`          | 332 pruebas, 35 archivos                                      |
| `pnpm test:e2e`      | 80 pruebas en Chromium                                        |
| `pnpm validate:epub` | 0 errores y 0 advertencias con EPUBCheck 5.1.0                |

### Pendiente

El archivo se sigue generando entero en la memoria de la peticion. Un
manuscrito mayor, o con mas imagenes, no cabria en Render Free: la solucion
seria escribir a disco o a un almacenamiento temporal, y no esta hecha.

El detalle esta en [PERFORMANCE_REPORT.md](../PERFORMANCE_REPORT.md) y en
[AUDIT_CORRECTIONS.md](AUDIT_CORRECTIONS.md).

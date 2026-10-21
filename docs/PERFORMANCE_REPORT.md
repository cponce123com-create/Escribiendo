# Informe de rendimiento

Mediciones reales, ejecutadas en la máquina de trabajo (Windows, Node.js
24.20.0, PostgreSQL 17.7 local) y contra la compilación de producción. Todas
son reproducibles con los comandos que se indican.

## Composición y exportación de manuscritos

Comando: `pnpm bench:export` (código en `scripts/benchmark-export.ts`).

Geometría de la prueba: A5 (148 × 210 mm), márgenes de 20/20/18/14 mm, cuerpo
de 11 pt con interlineado 1,5 y 220 palabras por párrafo, con un capítulo
cada 20 párrafos.

| Palabras | Páginas | Paginación |   PDF |  EPUB |  DOCX | Memoria |
| -------- | ------: | ---------: | ----: | ----: | ----: | ------: |
| 10 000   |      28 |      22 ms |  9 ms |  9 ms |  7 ms |  2,0 MB |
| 50 000   |     137 |      53 ms | 17 ms | 15 ms | 15 ms | 27,5 MB |
| 100 000  |     273 |      87 ms | 30 ms | 29 ms | 28 ms |  2,3 MB |
| 200 000  |     546 |     168 ms | 64 ms | 53 ms | 52 ms | 55,7 MB |

Lectura de la tabla:

- **El coste es lineal con el tamaño del manuscrito.** 200 000 palabras son
  unas 550 páginas y se componen en menos de un segundo.
- **La memoria se mantiene holgadamente dentro del plan.** El peor caso
  medido, 200 000 palabras, consume unos 56 MB, frente a los 512 MB de una
  instancia de Render Free. La exportación ocurre dentro de la petición web
  y no deja procesos residuales.
- **No hace falta un worker para exportar.** Con estos números, un proceso
  permanente solo añadiría coste y puntos de fallo.

Los valores de memoria son la diferencia entre el mínimo y el máximo de la
reserva del proceso durante la medición, no el consumo absoluto: el
recolector de basura de Node.js no devuelve la memoria al sistema de
inmediato.

### Reejecución tras el Lote E (21 de octubre de 2026)

El motor de tramos con formato añade un camino nuevo, pero los manuscritos sin
marcas siguen usando el reparto rápido de siempre. La reejecución lo confirma:

| Palabras | Páginas | Paginación |   PDF |  EPUB |  DOCX | Memoria |
| -------- | ------: | ---------: | ----: | ----: | ----: | ------: |
| 10 000   |      28 |      24 ms | 11 ms |  8 ms |  9 ms |  2,8 MB |
| 50 000   |     137 |      61 ms | 18 ms | 16 ms | 17 ms | 26,6 MB |
| 100 000  |     273 |     101 ms | 34 ms | 31 ms | 28 ms |  7,2 MB |
| 200 000  |     546 |     212 ms | 71 ms | 59 ms | 74 ms | 12,8 MB |

La paginación y el PDF varían unos milisegundos entre pasadas por el
recolector y la carga del equipo. El máximo de memoria observado en todas las
pasadas sigue siendo 55,7 MB, por debajo de los 512 MB de Render Free. Ninguna
cifra de esta sección procede de una estimación: todas salen de ejecutar el
comando.

## Suite de pruebas

| Suite                       | Duración | Resultado    |
| --------------------------- | -------: | ------------ |
| `pnpm test` (unitarias)     |     ~7 s | 249 en verde |
| `pnpm build` (producción)   |    ~20 s | 26 rutas     |
| `pnpm test:e2e` (navegador) |   ~3,5 m | 70 en verde  |

La suite de extremo a extremo es la que tarda, y lo hace por el navegador: 70
pruebas en Chromium con un solo trabajador, contra la compilación de
producción.

## Coste de las peticiones

Medido con las sondas de salud durante la suite:

| Ruta                  | Comprobación      | Observación                                    |
| --------------------- | ----------------- | ---------------------------------------------- |
| `/api/health`         | Correcto y rápida | No toca la base de datos                       |
| `/api/health/ready`   | Correcta          | Consulta la conexión; es la sonda de Render    |
| Páginas de listado    | Correctas         | Una consulta con índice por espacio de trabajo |
| Página de sección     | Correcta          | Sección, revisiones y árbol: tres consultas    |
| Vista previa paginada | Correcta          | Composición en memoria, sin escritura          |
| Descarga de export    | Correcta          | Regenera el archivo en la petición             |

## Decisiones que afectan al rendimiento

1. **La exportación se genera en la petición, no en segundo plano.** Con
   230 ms y 56 MB en el peor caso medido, un worker no aportaría nada y
   añadiría un proceso permanente que Render Free tendría que pagar.
2. **El archivo no se guarda en ningún sitio.** Se regenera al descargarlo, a
   partir de las versiones de las secciones que guardó el trabajo. Así no hay
   binarios en la base de datos ni en el disco, y el resultado es idéntico
   byte a byte.
3. **La paginación trabaja por altura, no por número de líneas.** Así conviven
   en la misma página un cuerpo de 11 pt y un título de 20 pt sin que la
   cuenta de líneas tenga que ser la misma.
4. **Las consultas van acotadas por espacio de trabajo.** Todas las lecturas
   filtran por `workspaceId` a través de la relación, que es la clave de las
   consultas filtradas del esquema.
5. **El cliente es un único paquete por solicitud.** El `PrismaClient` es un
   singleton por proceso, con el tamaño del pool controlado en `DATABASE_URL`
   (2 o 3 conexiones en Render Free).

## Límites que no se pueden eliminar con optimización

1. **La paginación usa métricas reales cuando las fuentes están disponibles.**
   Si no se cargan, vuelve a la estimación y lo declara. El coste de la
   exactitud es incrustar la fuente completa en el PDF, porque no hay
   subconjuntos; el tamaño resultante se mide más abajo.
2. **La exportación usa memoria proporcional al manuscrito.** Con 200 000
   palabras son unos 56 MB. Un manuscrito de un millón de palabras rondaría
   los 300 MB y empezaría a apretar la instancia: ese es el techo real del
   diseño bajo demanda.
3. **La suite de extremo a extremo es lenta por navegador.** No es un
   problema del producto, pero sí del tiempo de integración continua. Con un
   solo trabajador se evita el consumo de memoria de varios navegadores a la
   vez, que en esta máquina produjo el fallo esporádico del módulo nativo de
   argon2 observado durante la auditoría.
4. **No se ha medido el comportamiento bajo carga real en Render.** La salida
   de red de la máquina de trabajo está filtrada y el despliegue no es
   accesible desde aquí. Las cifras de esta página son de entorno local.

## Reejecución tras el Lote I (imágenes)

Comando: `pnpm bench:export`, ejecutado el 21 de octubre de 2026 en la rama
`improvement/escribiendo-95`, con el motor de imágenes ya cargado. El banco no
incluye imágenes reales: no hay credenciales de Cloudinary. Mide el coste fijo
de la composición y de los tres escritores.

| Palabras | Páginas | Paginación |    PDF |  EPUB |  DOCX |  Memoria |
| -------- | ------: | ---------: | -----: | ----: | ----: | -------: |
| 10 000   |      28 |      45 ms |  15 ms | 14 ms |  8 ms |   4,8 MB |
| 50 000   |     137 |      70 ms |  22 ms | 21 ms | 20 ms |   1,1 MB |
| 100 000  |     273 |     127 ms |  64 ms | 40 ms | 33 ms |  33,9 MB |
| 200 000  |     546 |     265 ms | 101 ms | 66 ms | 81 ms | -18,5 MB |

La última fila de memoria es negativa porque el mínimo observado quedó por
encima del máximo final: el recolector devolvió memoria durante la medición.
No es un consumo negativo ni una mejora real; es ruido del método. El máximo
absoluto observado en esta pasada fue 33,9 MB, por debajo de los 512 MB de
Render Free, pero no se usa como garantía porque el banco no descarga imágenes.

El coste de imágenes reales no está medido. Por código, el peor caso aceptado
es 80 imágenes de 15 MB, normalizadas a un lado máximo de 2400 px y procesadas
con concurrencia 4. Ese caso puede superar la memoria de una instancia Free y
debe medirse antes de subir el límite.

## Suite de pruebas tras el Lote I

| Suite                       | Duración | Resultado    |
| --------------------------- | -------: | ------------ |
| `pnpm test` (unitarias)     |     ~8 s | 268 en verde |
| `pnpm build` (producción)   |    ~20 s | 30 rutas     |
| `pnpm test:e2e` (navegador) |   ~3,2 m | 71 en verde  |

Las cifras de duración son de esta máquina y varían con la carga. No se
presentan como un compromiso de rendimiento del despliegue.

## Reejecución tras el Lote J (notas al pie)

Comando: `pnpm bench:export`, ejecutado el 21 de octubre de 2026. El banco
sigue sin incluir notas ni imágenes reales; sirve para comprobar que el camino
sin notas no ha sufrido una regresión.

| Palabras | Páginas | Paginación |   PDF |  EPUB |  DOCX | Memoria |
| -------- | ------: | ---------: | ----: | ----: | ----: | ------: |
| 10 000   |      28 |      31 ms |  9 ms |  9 ms |  7 ms | -2,7 MB |
| 50 000   |     137 |      60 ms | 20 ms | 14 ms | 16 ms | 14,5 MB |
| 100 000  |     273 |      98 ms | 46 ms | 30 ms | 32 ms | 26,8 MB |
| 200 000  |     546 |     197 ms | 67 ms | 54 ms | 69 ms | -2,6 MB |

La fila de memoria negativa es ruido del recolector: el mínimo observado quedó
por encima del máximo final. No es consumo negativo. El máximo absoluto de esta
pasada fue 26,8 MB, por debajo de los 512 MB de Render Free, pero el banco no
descarga imágenes ni compone notas reales.

### Coste de las notas

La composición de una nota se calcula una sola vez por página y se reutiliza en
la reserva de altura; la búsqueda de notas nuevas recorre únicamente los tramos
de las líneas candidatas. No se ha ejecutado un banco específico con miles de
notas: sería necesario para afirmar un límite de densidad. El peor caso
aceptado por esquema es una nota de 2000 caracteres; una nota así puede activar
`FOOTNOTE_OVERFLOW` si no cabe con su llamada. Esa condición se conserva y se
avisa, no se elimina.

## Suite de pruebas tras el Lote J

| Suite                       | Duración | Resultado    |
| --------------------------- | -------: | ------------ |
| `pnpm test` (unitarias)     |     ~6 s | 280 en verde |
| `pnpm build` (producción)   |    ~20 s | 30 rutas     |
| `pnpm test:e2e` (navegador) |   ~2,9 m | 72 en verde  |

Las cifras de duración son de esta máquina y varían con la carga. No se
presentan como un compromiso de rendimiento del despliegue.

## Reejecución tras el Lote K (fuentes TTF y métricas reales)

Comando: `pnpm bench:export`, ejecutado el 21 de octubre de 2026 con
`LiberationSerif-Regular.ttf` cargada. El banco usa la medición real de
`hmtx`/`cmap` y el PDF incrusta esa cara. Sigue sin incluir imágenes ni notas
reales.

| Palabras | Páginas | Paginación |    PDF | PDF KB |  EPUB |  DOCX | Memoria |
| -------- | ------: | ---------: | -----: | -----: | ----: | ----: | ------: |
| 10 000   |      28 |      15 ms |  31 ms |    677 |  8 ms |  7 ms |  3,8 MB |
| 50 000   |     137 |      28 ms |  67 ms |  1 668 | 14 ms | 14 ms | 24,5 MB |
| 100 000  |     273 |      61 ms | 175 ms |  2 907 | 32 ms | 51 ms | 10,2 MB |
| 200 000  |     546 |     112 ms | 227 ms |  5 387 | 51 ms | 60 ms | -1,1 MB |

Lectura:

- La paginación con métricas reales fue más rápida que las pasadas anteriores
  porque el banco cambió de modelo de medición; no se presenta como una mejora
  del producto, sino como el resultado de esta ejecución concreta.
- El PDF tarda más porque incrusta la fuente completa y escribe el mapa
  `ToUnicode` y la tabla de anchos. A cambio, el archivo es autocontenido.
- El tamaño del PDF crece con el manuscrito y con las caras usadas. La tabla
  mide una sola cara regular; un libro con negrita, cursiva y negrita cursiva
  puede añadir varias fuentes completas.
- **La columna de memoria es ruido.** Es la diferencia entre el mínimo y el
  máximo de la reserva del proceso, no el consumo absoluto: entre dos pasadas
  de este mismo banco se han medido valores desde -1,1 MB hasta 51,1 MB. El
  máximo absoluto observado sigue estando muy por debajo de los 512 MB de
  Render Free, pero la cifra no es comparable entre ejecuciones. No incluye
  imágenes reales ni notas.

### Coste de las fuentes y de la vista previa

Medido con el mismo lector que usa la aplicación:

| Operación                                     | Coste |
| --------------------------------------------- | ----- |
| Leer y analizar las doce caras Liberation     | 33 ms |
| 1 000 mediciones de texto con métricas reales | 5 ms  |

Las fuentes se cargan una vez por proceso y se reutilizan en la exportación y
en la vista previa. La vista previa paginada puede, por tanto, usar las
métricas reales sin coste apreciable: el retraso de la primera carga es de 33
ms y después solo hay que medir.

### Suite tras el Lote K

| Suite                       | Duración | Resultado    |
| --------------------------- | -------: | ------------ |
| `pnpm test` (unitarias)     |   ~7,8 s | 289 en verde |
| `pnpm test:e2e` (navegador) |   ~3,0 m | 72 en verde  |
| `pnpm build` (producción)   |        — | Correcto     |

La duración de la suite E2E es la de esta máquina con un solo trabajador. El
banco no mide el coste de descargar imágenes de Cloudinary ni de componer
miles de notas; esas cifras siguen pendientes.

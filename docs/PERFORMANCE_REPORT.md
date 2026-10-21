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

## Suite de pruebas

| Suite                       | Duración | Resultado    |
| --------------------------- | -------: | ------------ |
| `pnpm test` (unitarias)     |     ~5 s | 220 en verde |
| `pnpm build` (producción)   |    ~20 s | 26 rutas     |
| `pnpm test:e2e` (navegador) |   ~2,6 m | 70 en verde  |

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

1. **La paginación es una estimación.** Sin las métricas reales de la fuente
   incrustada, el reparto de líneas es aproximado. El coste de tener
   paginación exacta es incrustar la fuente en el PDF, que es trabajo de la
   producción final, no una optimización.
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

# Interfaz: estadísticas y filtros

## Correcciones

- La barra de actividad se calcula dentro de una pista flexible. La fecha y el contador conservan su espacio; un día de 5209 palabras ya no desborda la tarjeta. Un día sin palabras muestra una barra de ancho cero.
- Biblioteca, Personajes, Mundos y Planificación adaptan sus filtros al ancho del panel mediante container queries. Usan una columna en móvil, dos cuando hay espacio y una fila completa en paneles amplios.
- Los campos y botones de estos filtros tienen una altura de 44 px. Las acciones pueden pasar a otra línea y los títulos largos pueden partirse.

## Validación reproducible

```sh
pnpm exec playwright install chromium
node --import tsx scripts/verify-interface.ts
```

El script renderiza el JSX real de las cinco rutas y compila el CSS real con Tailwind/PostCSS. Sustituye las consultas de servidor y los formularios/directorios hijos por datos aislados; no necesita credenciales ni una base de datos. Usa Chromium a 320, 375, 390, 768, 1024, 1440 y 1920 px, en claro y oscuro.

Comprueba 98 combinaciones: estadísticas con un día, varios días con cero y un millón de palabras, y sin actividad; más los cuatro paneles de filtros con acciones de limpiar visibles. Verifica el ancho del documento, los límites de cada barra y los límites y alturas de los controles. Genera capturas de 390 y 1440 px.

Resultado local: 98 combinaciones aprobadas. La misma comprobación contra el JSX anterior de estadísticas falla en 320 px con `page overflow`, reproduciendo el defecto comunicado. También aprobaron formato, lint de los archivos intervenidos y tipos del script. Se inspeccionaron capturas en claro y oscuro.

El workflow `Interfaz responsive` repite esta comprobación en los PR y conserva capturas durante siete días.

## Alcance pendiente

Esta entrega no cierra la auditoría visual completa. El script no prueba la cabecera/barra lateral real, los formularios internos, las tarjetas de personajes/mundos, el editor, los diálogos ni los flujos autenticados. Deben validarse con datos y sesión de prueba en E2E. No certifica accesibilidad completa, paridad editorial ni rendimiento de producción. No se aplican migraciones ni se modifican datos de producción.

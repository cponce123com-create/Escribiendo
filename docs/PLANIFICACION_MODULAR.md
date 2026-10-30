# Planificación modular literaria — 30 de octubre de 2026

## Alcance

Base main `977aaa5`, árbol inicial limpio, rama `feat/planificacion-modular-20261030`. El PR 85 ya estaba integrado con el commit 5480d24; se incorpora también la corrección posterior de normalización CRLF/LF que aún no estaba en main, conservando la comparación exacta del portapapeles.

Planificación abre por defecto el libro más reciente y muestra su estructura. La navegación separa Estructura del libro, Guías para IA e Ideas del estudio. Los libros existentes y sus textos no se convierten ni modifican automáticamente.

## Herramienta visual

- Dos vistas: partes como columnas con capítulos y escenas anidadas, y flujo por estados Idea / Planificado / En escritura / Terminado.
- Tarjetas con título, resumen previsto, objetivo narrativo, conflicto, cierre y extensión orientativa. Tipos anteriores libres y secuencias se conservan.
- Arrastre en escritorio y alternativa «Mover» con destino y posición explícitos para teclado y dispositivos táctiles. El flujo cambia estado; la vista Estructura cambia dependencia y orden.
- Filtros que conservan el contexto de las partes y capítulos de las escenas coincidentes. Contadores obtenidos de las tarjetas reales y avisos deterministas de resúmenes/objetivos/cierres pendientes, escenas sueltas y títulos repetidos. No asignan probabilidades ni inventan argumentos.
- Esquema inicial opcional: tres actos o cinco partes libres, con 0 a 100 capítulos provisionales repartidos en orden. Solo en tablero vacío, previa elección del autor; sin prosa, personajes ni escenas inventadas. Se puede construir todo manualmente.
- Copia de estructura con jerarquía y campos existentes. Edición en Dialog, avisos con FormMessage, confirmación de descarte de cambios no guardados. Las tarjetas antiguas del estudio siguen disponibles; las vinculadas a libros se editan en su tablero para proteger la jerarquía y la concurrencia.

## Manuscrito y guías

«Traer del manuscrito» vincula partes, capítulos, prólogos y epílogos. Repetir no duplica secciones vinculadas. Las tarjetas sin vínculo con un título coincidente requieren asociación manual; no se fusionan por similitud. Las partes o capítulos anidados que no caben en el modelo de tres niveles exigen revisión manual.

«Aplicar estructura al manuscrito» requiere confirmación y permisos de creación/movimiento de secciones. Crea las partes y capítulos faltantes, actualiza dependencia y orden de los vinculados, conserva contenido, versión de texto y títulos existentes y recalcula totales. Las escenas permanecen en el plan. Si hay partes/capítulos reales sin vincular, vínculos inválidos, títulos distintos o una propuesta incompatible con el orden editorial, se detiene la transacción completa. El autor debe revisar primero; no se renombra ni descarta un manuscrito para hacerlo coincidir.

Después de aplicar se puede abrir el editor o la guía para IA de cada capítulo. Si todavía no hay una guía guardada, objetivo, escenas y cierre se proponen desde el tablero. No se sobrescriben guías guardadas ni se aprueban propuestas automáticamente. Cambiar la estructura real puede invalidar la ficha maestra anterior; se debe revisarla y aprobarla de nuevo antes de copiar instrucciones.

## Persistencia y seguridad

Migración aditiva `20261030140000_modular_plan`: parentId, sectionId único, sortOrder, version, goal, conflict, outcome y targetWords en story_plan_items; título ampliado de 200 a 300 caracteres; índice por libro/contenedor/orden y claves foráneas. Filas anteriores quedan como tarjetas raíz, sin vínculos. No hay borrado ni relleno ficticio de contenido. expected-schema actualizado. La guarda de migraciones solo admite automáticamente ampliar un VARCHAR de tamaño de origen conocido mediante una sentencia aislada sin USING; reducciones y conversiones siguen bloqueadas, con regresiones específicas.

Se intentó `pnpm db:migrate:create --name modular_plan --create-only --skip-generate` sobre una URL local desechable explícita. Sin PostgreSQL local, no pudo crear la migración; se generó el SQL mediante Prisma migrate diff entre los esquemas base/nuevo. La aplicación debe verificarse en PostgreSQL de CI antes de integrar. No se accedió a la base de producción.

Las acciones validan origen, sesión y permiso story:manage; filtran el libro por workspace y borrado lógico. Un contador compartido de planificación protege contra formularios obsoletos y escrituras concurrentes; las transacciones son serializables. La reubicación agrupa los cambios de posiciones en una sentencia parametrizada, sin interpolar identificadores aportados por el usuario. La aplicación comprueba también la instantánea de estructura y versiones del manuscrito. Las acciones antiguas no pueden eludir esas protecciones sobre tarjetas de un libro.

Archivar una hoja no elimina texto del manuscrito. Un contenedor con hijos no se archiva hasta reubicarlos. Las guías aprobadas siguen usando sus revisiones independientes. Los nuevos campos de tarjeta tienen control de versión para concurrencia, pero aún no un historial de restauración propio del tablero.

Límites: 1.000 tarjetas por libro; 200 secciones al aplicar la estructura, coherente con el límite de la vista de guías. No se trunca un plan para aplicarlo. El diagnóstico es editorial básico; no analiza semánticamente coherencia, no importa informes en bruto y no llama a una IA externa.

## Verificación

Pruebas puras de jerarquía, movimientos, posiciones, inmutabilidad, límites, títulos repetidos y un libro sintético de 30 capítulos/150 escenas. Pruebas de acciones de permisos, workspace, concurrencia, vínculo ajeno, SQL parametrizado, archivo sin cascada, importación idempotente y aplicación conservando texto/títulos. La E2E nueva cubre creación, escena, movimiento entre partes, descarte protegido, creación de secciones, reordenación conservando texto, flujo, prellenado de guía, geometría móvil, axe y capturas de escritorio/móvil. Otro recorrido verifica el esquema de cinco partes y treinta capítulos sin prosa.

Los resultados ejecutados se registran en el PR; un archivo de prueba por sí solo no se considera evidencia de aprobación.

## Comprobación manual tras desplegar

1. Abrir un libro nuevo → Planificación. Crear a mano una parte/capítulo/escena, o elegir un esquema inicial vacío de contenido.
2. Editar resumen, objetivo y cierre. Probar mover capítulos entre partes y escenas entre capítulos con arrastre y con el diálogo Mover.
3. Cambiar de vista y estado de trabajo. Buscar una escena y comprobar que se conserva el contexto del capítulo y la parte.
4. Aplicar al manuscrito; abrir un capítulo en el editor. Escribir y guardar. Reordenar en el tablero y aplicar otra vez: el texto debe conservarse.
5. Abrir Guía para IA desde la tarjeta: revisar la propuesta procedente del plan y aprobar explícitamente las fichas necesarias.
6. En dos pestañas, guardar sobre la misma revisión: una debe pedir recargar. En móvil, comprobar desplazamiento dentro del tablero, edición y movimiento táctil por diálogo.

## Rediseño: mapa completo

La vista inicial es ahora «Mapa completo»: hasta cinco partes en columnas que comparten el ancho disponible; cada capítulo se reduce a número, título, estado y cantidad de módulos. Los resúmenes, objetivos, conflictos y cierres se consultan al seleccionar la tarjeta. El mismo diálogo permite acceder a escenas, mover la tarjeta y abrir el editor o la guía vinculada. La navegación entre tarjetas exige guardar o descartar cambios pendientes. Los lectores sin permiso de edición pueden consultar el detalle sin controles de escritura.

«Tarjetas» conserva la vista detallada y «Flujo de trabajo» los estados. Cambiar de vista no altera datos. El selector del libro y la búsqueda/revisión se revelan al necesitarlos. En escritorio se prueba expresamente que los treinta capítulos de cinco partes estén dentro de la pantalla en 1366×768 y 1440×900; en móvil se usan dos columnas legibles y desplazamiento vertical, sin reducir treinta capítulos a texto ilegible. El arrastre y el diálogo Mover siguen disponibles. No se introducen migraciones adicionales.

Referencias de interacción: [Plottr Timeline](https://docs.plottr.com/article/54-timeline-overview), organización visual de capítulos y escenas; [Milanote Story Outline](https://milanote.com/guide/story-outline), organización del esquema. Se adapta el patrón de visión general con detalle al seleccionar, conservando la identidad y los componentes del proyecto.

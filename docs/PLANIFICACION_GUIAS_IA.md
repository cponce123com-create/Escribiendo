# Planificación: fichas aprobadas y guías para IA

## Entrega inicial

Base: main `b4bd3b5`, árbol inicialmente limpio; rama `feat/planificacion-guia-ia-20261029`. La planificación anterior de ideas, escenas y estados se conserva. Se añade un panel dentro de `/planning?book=ID` para un libro elegido.

- Ficha maestra: premisa, corriente literaria, narrador, tiempo verbal, tono, público y reglas. El título, autoría, género y lista ordenada de secciones se toman del libro al guardar; no se modifican desde esta herramienta.
- Guía vinculada por clave foránea a cada sección real: objetivo, inicio, escenas, final, restricciones, estado de personajes y resumen de lo escrito. Permite seleccionar personajes y lugares del mismo libro; copia sus nombres, alias y descripciones breves en la revisión.
- Borrador y aprobación explícita. Cada guardado inserta otra revisión; no reemplaza las anteriores. La combinación libro/versión o sección/versión es única. Los conflictos de otra pestaña requieren recargar y revisar.
- Vista previa de instrucciones y copia al portapapeles, con selección manual si el navegador rechaza el acceso. Usa Dialog, FormMessage, SubmitButton y los campos existentes, con textos en español.
- Contexto breve de hasta tres secciones anteriores o completo de todas las anteriores. No incluye resúmenes del capítulo elegido ni de capítulos futuros. Los títulos futuros forman parte de la lista canónica, identificada como estructura que no debe desarrollarse.
- Solo utiliza las últimas revisiones aprobadas. Una última revisión en borrador exige aprobarla antes de copiar. Al cambiar la ficha maestra debe revisarse/aprobarse de nuevo la guía objetivo. Un cambio de título, autoría, género u orden bloquea la copia hasta revisar la ficha maestra.
- El resumen de lo escrito es manual y revisado por el autor. Guarda la versión del manuscrito que lo respalda; si esta cambia, no se incorpora ese resumen al contexto. Un resumen ausente o desactualizado queda señalado y nunca se inventa.

## Límites declarados

No llama a servicios de IA ni utiliza claves/API de pago. La guía no puede garantizar que una IA externa obedezca; su respuesta sigue necesitando revisión. No analiza semánticamente el texto generado, no extrae automáticamente resúmenes y no importa informes en bruto: son las siguientes entregas. Tampoco hay todavía una interfaz para navegar/restaurar las revisiones conservadas en las nuevas tablas.

El panel admite hasta 200 secciones, personajes y lugares por libro; rechaza cargar un conjunto incompleto al superar el límite. Selección de hasta 20 personajes y 20 lugares por guía. Campos con límites y controles ilegales rechazados. La copia tiene un máximo de 120.000 caracteres; si se supera, devuelve un error y no recorta silenciosamente. Las fichas de personajes/lugares son una instantánea al guardar; si cambian después, deben revisarse y aprobarse las guías que deban incorporar esos cambios.

Las tarjetas de ideas anteriores siguen siendo material independiente; no se convierten automáticamente en guías aprobadas. Las decisiones editoriales del libro no se infieren a partir de mayúsculas, títulos parecidos o del contenido del manuscrito.

## Persistencia y migración

Migración aditiva `20261029224000_writing_briefs`: tablas `book_writing_briefs` y `chapter_writing_briefs`, contenido JSON validado con Zod, versiones únicas y claves foráneas hacia libro/sección. No cambia ni rellena contenido de libros existentes. Se actualiza expected-schema.ts para diagnosticar una migración pendiente.

Se intentó `pnpm db:migrate:create --name writing_briefs --create-only --skip-generate` con URLs explícitas de una base local desechable; falló al no existir PostgreSQL local. El SQL se generó con `prisma migrate diff` entre el esquema base y el nuevo, retirando la salida informativa del gestor de paquetes. No se accedió a Neon ni a producción. La aplicación de migraciones y el recorrido E2E deben aprobar en el PostgreSQL desechable de CI antes de integrar.

En el despliegue se aplica con `pnpm db:migrate`, igual que las demás migraciones. El Blueprint de Render ya incluye ese paso; si el servicio usa un comando personalizado, debe incluirlo antes del arranque del nuevo código. No ejecutar `db:migrate:create` contra producción.

## Verificación reproducible

- Unitarias: aislamiento de libro/capítulo, permisos/origen, versiones concurrentes, cambios del manuscrito durante el guardado, revisiones nuevas, títulos exactos, contexto previo, ausencia de datos y bloqueo de revisiones sin aprobar.
- E2E `tests/e2e/planificacion-ia.spec.ts`: crea un libro aislado, aprueba fichas, prepara/copia instrucciones, comprueba que el manuscrito no cambia y detecta un renombrado posterior. También toma captura móvil y comprueba ausencia de desbordamiento horizontal.
- Ejecutar `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` y las E2E contra una base desechable. Los resultados ejecutados se registran en el PR de esta entrega; no se considera aprobada una prueba por existir su archivo.

## Prueba manual

1. Abrir Planificación, elegir libro y Filtrar. Guardar una ficha maestra como borrador: no debe permitir copiar instrucciones hasta aprobar.
2. Aprobar la ficha maestra; elegir un capítulo real, completar objetivo/escenas/final, seleccionar fichas y aprobar.
3. Preparar contexto breve y completo; revisar títulos exactos, restricciones y ausencia de resúmenes futuros. Copiar y pegar en el editor de texto de tu elección.
4. Cambiar el manuscrito de una sección anterior: su resumen debe aparecer como no vigente hasta volver a revisarlo/aprobarlo.
5. Cambiar un título u orden del manuscrito: pedir de nuevo las instrucciones debe exigir revisar la ficha maestra.
6. Guardar desde dos pestañas con la misma versión: una debe recibir un conflicto sin reemplazar lo guardado por la otra.
7. En móvil, probar selector de sección, selección múltiple y diálogo de copia. Al cambiar de sección con una guía sin guardar, debe ofrecer conservar la edición o descartar explícitamente.

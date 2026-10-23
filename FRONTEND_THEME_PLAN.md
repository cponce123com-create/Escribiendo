# Tema editorial del frontend

- [x] Unificar colores, tarjetas, campos, botones y navegación en todas las rutas.
- [x] Rediseñar el panel siguiendo la referencia, con métricas y enlaces reales.
- [x] Mantener el editor, el menú retráctil, el tema oscuro y los permisos.
- [x] Añadir pruebas de navegación y verificar formato, lint, tipos, pruebas y build.
- [x] Publicar una rama y un PR con las limitaciones de verificación.

## Verificación y alcance

Tema común aplicado a navegación, tarjetas, campos, botones, formularios y pantallas de acceso. Panel compuesto con datos reales y permisos de creación. El editor conserva sus estilos específicos. Planificación, personajes y mundos están implementados y enlazados; no son botones simulados.

La actividad semanal cuenta días con palabras añadidas en la zona Europe/Madrid; no se presenta como una racha consecutiva ni como sesiones de escritura. Equipo muestra miembros reales. Las cubiertas tipográficas representan títulos reales, no portadas subidas.

Verificación visual local de los componentes reales con datos de prueba aislados (ruta temporal eliminada): 1672 px y 390 px, temas claro y oscuro, sin desbordamiento horizontal móvil. Axe: cero infracciones en el panel claro y oscuro. Menú plegado: oculto y contenido ocupando los 1672 px.

Suite E2E completa no ejecutada: Docker no está instalado en este entorno (`spawn docker ENOENT`). Se añade cobertura de navegación, búsqueda, persistencia del menú, guía y accesibilidad para ejecutarla con la base desechable. No se conectó a la base de producción.

## Recurso visual

`apps/web/public/images/studio/writing-desk.webp`: fotografía decorativa creada con la herramienta integrada de generación de imágenes. Prompt: escritorio literario con libros de tela crema y terracota, taza cerámica a la derecha, luz natural cálida, espacio marfil a la izquierda, sin texto ni logotipos.

Comprobación final: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (374 pruebas, 45 archivos) y `pnpm build` completados correctamente. No hay cambios de esquema ni migraciones.

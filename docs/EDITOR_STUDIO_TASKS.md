# Rediseño del estudio editorial

Referencia: imagen «Editor editorial en español(1).png», proporcionada por el usuario.
Rama: `feat/reference-editor-studio`.

## Plan

- [x] Analizar la referencia y leer los componentes y las reglas del repositorio.
- [x] Reproducir las cuatro zonas, la paleta marfil/carbón/terracota y la cabecera panorámica.
- [x] Conectar navegación, búsqueda, historial, notas y controles con datos y acciones reales.
- [x] Conservar ambos paneles retráctiles y adaptar móvil y tema oscuro.
- [ ] Ejecutar formato, lint, tipos, pruebas y compilación; revisar la pantalla renderizada.

## Base

El último cambio pasó formato, lint, tipos, 364 pruebas y build. La suite E2E anterior
presentó fallos preexistentes de datos compartidos y maquetación. Docker no está disponible
en este entorno; la configuración de base desechable y token ya está automatizada.

## Fidelidad y datos

Los títulos, capítulos, versiones, fechas y notas proceden del libro abierto. No se copian
los datos ficticios de la referencia. El asistente IA y las notificaciones conservan su
espacio visual e indican explícitamente su estado pendiente. No se modifica el esquema.

La cabecera es decorativa y no se exporta con el manuscrito. Se generó con la herramienta
integrada de imágenes y se guardó en `apps/web/public/images/studio/mountain-header.webp`.
Prompt: paisaje panorámico 3:1 de montañas con niebla al atardecer, cielo crema y melocotón,
mitad izquierda clara para texto y una silueta sobre un acantilado rocoso a la derecha;
sin texto, sin interfaz y sin marcas de agua.

## Verificación y límites

Formato, lint, TypeScript, 369 pruebas unitarias y compilación de producción pasan.
Se añadió una prueba E2E de búsqueda, notas, pestañas, concentración, accesibilidad
con axe y anchuras de 1672, 1280, 768 y 390 píxeles. No se declara ejecutada:
no hay una base de pruebas disponible localmente. La revisión visual no pudo
completarse: Chrome necesitó una descarga alternativa, el entorno bloqueó sockets
y posteriormente se reinició. La ruta temporal de prueba fue eliminada.

Pendientes explícitos conservados en el diseño: integración de IA, investigación,
notificaciones y alineación individual de párrafos. La alineación editorial actual
se sigue configurando en Maquetación. La búsqueda recorre el capítulo abierto.
La cabecera muestra el nombre del libro: aún no hay un campo de sinopsis por capítulo.

Se conservan los cambios actuales de main en el logo oficial y en la biblioteca.
El paisaje recrea la composición de la referencia; no es una extracción idéntica.
No se afirma una coincidencia visual del 100 % sin la comparación renderizada.

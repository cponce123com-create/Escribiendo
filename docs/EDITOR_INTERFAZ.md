# Interfaz del editor — 29 de octubre de 2026

Base: `c5fc690`, rama `fix/editor-interfaz-20261029`.

- Cabecera del capítulo más compacta y título largo ajustable; el manuscrito
  conserva su tipografía y contenido. La imagen se mantiene en escritorio y se
  simplifica en móvil para dar prioridad a la lectura.
- Navegación con título «Manuscrito» en una sola línea, controles dentro de la
  cabecera y accesos ordenados al laboratorio, personajes y plantillas.
- Panel editorial con Buscar, Historial, Notas y Detalles: solo se muestra la
  herramienta elegida. Se retira el bloque de sugerencias IA sin proveedor que
  únicamente ofrecía un botón deshabilitado.
- Por debajo de 768 px, capítulos y herramientas empiezan plegados. Sus
  preferencias se guardan aparte de las de escritorio; cambiar de tamaño no
  desmonta ni reemplaza el editor. Al abrir herramientas aparecen antes del
  manuscrito, sin tener que recorrer todo el capítulo.
- Diálogo existente para confirmar reemplazos, con consulta y sustitución
  visibles, cancelación y error controlado. Se elimina window.confirm.
- Estilos acotados al espacio del editor, en editor-workspace.css; no se cambia
  el motor de composición, vista previa, PDF, esquema ni guardado.

## Verificación

Pruebas unitarias de preferencias y estructura, más E2E de paneles, cancelación
de reemplazo, accesibilidad y geometría a 1672, 1280, 768, 390 y 320 px.
Formato, lint, tipos, 1131 unitarias y build pasan localmente. El build inicial
falló por una caché de Turbopack ilegible; con una caché nueva pasó. Chromium no
se pudo descargar en este entorno (archivo truncado); validación en CI pendiente.

## Comprobación manual

1. Abrir un prólogo con título largo: «Manuscrito» debe caber y el encabezado
   dejar más espacio al texto. Renombrar conserva las opciones editoriales.
2. Alternar Buscar/Historial/Notas/Detalles y plegar los dos paneles; sus controles
   deben seguir accesibles por teclado y recordar la elección al recargar.
3. A 390 y 320 px, el editor se abre con paneles plegados. Abrir/cerrar Capítulos
   y Herramientas, y volver a escritorio: se conserva cada preferencia.
4. Buscar en todo el libro, abrir la confirmación de reemplazo y cancelar:
   el manuscrito no cambia. Con texto sin guardar, confirmar debe pedir guardarlo.
5. Probar concentración, edición y guardado habituales; revisar temas claro y
   oscuro sin desplazamiento horizontal del documento.

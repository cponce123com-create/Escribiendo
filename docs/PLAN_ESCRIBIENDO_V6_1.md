# ESCRIBIENDO v6.1 — PLAN MAESTRO DE INGENIERÍA

## Auditoría, corrección, modernización, optimización, pruebas y mejora continua

**Proyecto:** ESCRIBIENDO  
**Marca:** Editorial No Para Todos  
**Repositorio:** Utiliza el repositorio de GitHub actualmente disponible en el entorno de trabajo.  
**Versión de referencia:** v6  
**Calificación inicial estimada:** 7,7/10  
**Objetivo técnico:** 9,5/10 o superior, siempre que exista evidencia suficiente.  
**Modalidad:** Intervención integral por fases, con validaciones y criterios de aceptación.

---

# 1. MISIÓN GENERAL

Actúa como un equipo de ingeniería de software de alto nivel, formado por los siguientes especialistas:

1. Arquitecto principal de software.
2. Ingeniero full-stack senior.
3. Especialista en Next.js, React y TypeScript.
4. Ingeniero de PostgreSQL y Prisma.
5. Ingeniero de seguridad de aplicaciones.
6. Diseñador senior de experiencia de usuario (UX).
7. Diseñador de interfaces modernas (UI).
8. Especialista en sistemas de diseño.
9. Ingeniero de motores editoriales.
10. Especialista en publicación de libros digitales e impresos.
11. Ingeniero de pruebas automatizadas.
12. Especialista en accesibilidad.
13. Ingeniero de rendimiento.
14. Especialista en despliegues y DevOps.
15. Auditor técnico independiente.

Tu misión es transformar ESCRIBIENDO en una plataforma editorial profesional, estable, moderna, escalable, segura y visualmente refinada.

No debes limitarte a identificar errores. Debes corregirlos mediante modificaciones verificables del código.

El resultado esperado no es una demostración visual, sino una plataforma funcional que permita escribir, organizar, revisar, maquetar, previsualizar y exportar libros con seguridad editorial.

## Principios obligatorios

- No eliminar funcionalidades que ya trabajan correctamente.
- No sacrificar integridad de datos por mejoras visuales.
- No introducir dependencias innecesarias.
- No sustituir sistemas completos cuando sea posible corregirlos.
- No crear botones decorativos sin funcionalidad.
- No introducir datos de demostración en producción.
- No alterar manuscritos reales durante las pruebas.
- No ejecutar migraciones destructivas sin autorización.
- No afirmar que una prueba fue exitosa sin ejecutarla.
- No otorgar puntuaciones artificiales.
- No copiar literalmente diseños de otras plataformas.
- No ejecutar un bucle indefinido de correcciones.
- No detenerse después de redactar un diagnóstico cuando existan correcciones seguras y ejecutables.

**Prioridad absoluta: proteger los libros, manuscritos, revisiones y exportaciones de los usuarios.**

---

# 2. CONTEXTO TECNOLÓGICO

El repositorio utiliza actualmente una arquitectura basada en:

- Next.js 16 con App Router.
- React 19.
- TypeScript estricto.
- Node.js 24.
- pnpm 12.
- PostgreSQL con Neon.
- Prisma ORM.
- Tailwind CSS 4.
- Tiptap para edición de manuscritos.
- Cloudinary para recursos gráficos.
- Render como plataforma de despliegue.
- Zod para validación.
- Vitest para pruebas.
- Playwright para pruebas E2E.

También contiene motores para composición y exportación editorial.

Respeta esta arquitectura salvo que la auditoría demuestre la necesidad de modificarla.

## Restricciones de infraestructura

La solución debe seguir siendo compatible con:

- Render Free.
- Neon Free.
- Cloudinary Free.

No introducir obligatoriamente Redis, servidores adicionales, colas comerciales, servicios de IA de pago ni infraestructura permanente.

Puedes recomendar tecnologías nuevas, pero implementa únicamente aquellas cuya utilidad técnica esté justificada.

## Importante sobre Next.js

El repositorio contiene:

`apps/web/AGENTS.md`

Antes de modificar código de Next.js, revisa sus instrucciones y la documentación local correspondiente a la versión instalada.

No utilices patrones obsoletos procedentes de versiones anteriores sin comprobar su compatibilidad.

---

# FASE 0 — PREPARACIÓN, INVENTARIO Y LÍNEA BASE

**Prioridad: P0**

## Objetivo

Conocer el estado real del repositorio antes de introducir cambios.

## Actividades

### 0.1. Inspección estructural

Analizar:

- Aplicaciones.
- Paquetes.
- Componentes.
- Modelos de datos.
- Migraciones.
- Server Actions.
- Endpoints.
- Servicios internos.
- Librerías compartidas.
- Motores editoriales.
- Pruebas.
- Configuración de despliegue.
- Workflows de GitHub Actions.

Construir un mapa de dependencias.

### 0.2. Auditoría inicial

Revisar las siguientes áreas:

1. Diseño visual.
2. UX.
3. Arquitectura.
4. Editor.
5. Integridad de datos.
6. Jerarquía editorial.
7. Gestión de portadas.
8. Personajes.
9. Estadísticas.
10. Maquetación.
11. PDF.
12. EPUB.
13. DOCX.
14. Seguridad.
15. Rendimiento.
16. Pruebas.
17. Despliegue.
18. Mantenibilidad.

### 0.3. Reproducción de problemas

Confirmar los hallazgos de la auditoría anterior.

No asumir que todos continúan presentes si el repositorio cambió.

Para cada problema, registrar:

- Identificador.
- Severidad.
- Archivo.
- Función afectada.
- Causa raíz.
- Pasos de reproducción.
- Consecuencias.
- Solución.
- Prueba necesaria.

### 0.4. Protección del trabajo

Antes de modificar:

- Revisar el estado de Git.
- No sobrescribir cambios no confirmados.
- Crear una rama de trabajo.
- Identificar migraciones pendientes.
- Comprobar configuración de pruebas.
- Evitar cualquier escritura sobre producción.

**Entregable:** informe inicial y matriz de riesgos priorizados.

**Criterio de salida:** repositorio comprendido, problemas críticos localizados y plan de ejecución ordenado.

---

# FASE 1 — CORREGIR LA JERARQUÍA EDITORIAL

**Prioridad: P0**

Esta es una de las fases más importantes.

## Problema detectado

La plataforma utiliza relaciones jerárquicas para organizar secciones, pero determinadas consultas de vista previa y exportación siguen ordenando globalmente por:

`sortOrder`, `title`, `id`

Esto no garantiza el orden de lectura de un libro que contiene capítulos anidados dentro de partes.

## Archivos principales

- `apps/web/src/lib/books/section-tree.ts`
- `apps/web/src/lib/layout/preview.ts`
- `apps/web/src/lib/export/manuscript.ts`
- `apps/web/src/lib/layout/blocks.ts`
- `apps/web/src/lib/books/actions.ts`

## Objetivo

Implementar un **único modelo canónico de orden editorial**.

### 1.1. Crear un motor de recorrido jerárquico

Debe interpretar correctamente:

- Partes.
- Prólogos.
- Capítulos.
- Subcapítulos.
- Interludios.
- Epílogos.
- Apéndices.
- Otras secciones.

Utilizar un recorrido jerárquico determinista, respetando el orden entre hermanos y la relación padre-hijo.

No permitir que dos secciones de padres diferentes se mezclen simplemente porque tengan el mismo número `sortOrder`.

### 1.2. Centralizar la lógica

Crear o reutilizar una función compartida para obtener el orden de lectura.

Esta función debe utilizarse en:

- Árbol de secciones.
- Navegación del editor.
- Vista previa.
- Exportación PDF.
- Exportación EPUB.
- Exportación DOCX.
- Generación de índices.
- Búsqueda global, cuando el orden de resultados sea editorialmente relevante.

### 1.3. Gestionar estructuras inválidas

Comprobar:

- Padres inexistentes.
- Padres eliminados.
- Ciclos.
- Referencias cruzadas.
- Ordenamientos duplicados.
- Secciones huérfanas.

Diferenciar claramente entre recuperación visual tolerante y validación estricta de integridad.

La aplicación no debe quedarse bloqueada por una estructura corrupta.

Sin embargo, tampoco debe exportar silenciosamente un manuscrito con una jerarquía inválida sin advertirlo.

### 1.4. Pruebas

Crear casos con:

- Tres capítulos simples.
- Varias partes.
- Capítulos dentro de partes.
- Subcapítulos anidados.
- Ordenamientos repetidos.
- Secciones eliminadas.
- Ciclos inválidos.
- Referencias a padres inexistentes.

**Criterio de aceptación:** el orden de lectura debe ser coherente en todos los módulos editoriales.

---

# FASE 2 — BLINDAR LA INTEGRIDAD DE DATOS EN POSTGRESQL

**Prioridad: P0**

## Objetivo

Evitar que errores de lógica, concurrencia o solicitudes manipuladas dañen manuscritos.

## 2.1. Invariantes obligatorias

Garantizar que:

- Cada sección pertenezca a un libro válido.
- Una sección padre pertenezca al mismo libro.
- No existan ciclos.
- Una operación no modifique otro espacio de trabajo.
- Las eliminaciones estén delimitadas por libro.
- Las restauraciones sean coherentes.
- El ordenamiento no produzca resultados parciales.
- Una transacción fallida revierta todos sus cambios.

## 2.2. Restricciones de base de datos

Inspeccionar:

`packages/database/prisma/schema.prisma`

Evaluar claves compuestas, índices y restricciones necesarias.

La comprobación mediante Server Actions es necesaria, pero no debe ser la única protección cuando una restricción de base de datos puede reforzar la integridad.

Preparar migraciones aditivas y compatibles con los datos existentes.

Antes de añadir restricciones:

1. Auditar registros actuales.
2. Detectar referencias inválidas.
3. Generar un informe de inconsistencias.
4. Preparar un procedimiento de reparación.
5. Ensayar sobre una base desechable.
6. Comprobar el comportamiento de las migraciones.
7. Documentar la estrategia de reversión.

No reparar silenciosamente datos reales.

## 2.3. Concurrencia

Revisar las operaciones transaccionales que utilizan aislamiento serializable.

Comprobar:

- Conflictos simultáneos.
- Reintentos controlados.
- Errores recuperables.
- Ausencia de actualizaciones parciales.
- Consistencia de índices después de cada operación.

Implementar pruebas con dos sesiones modificando el mismo libro.

**Criterio de aceptación:** las operaciones de escritura no pueden corromper ni alterar manuscritos ajenos.

---

# FASE 3 — EXPORTACIONES HISTÓRICAS E INMUTABILIDAD

**Prioridad: P0**

## Problemas conocidos

La auditoría detectó escenarios en los que las exportaciones históricas podrían no reproducirse exactamente.

Entre ellos:

- Instantáneas vacías.
- Versiones iniciales sin revisión recuperable.
- Recursos gráficos identificados únicamente por URL.
- Cambios posteriores de metadatos editoriales.

## Archivos

- `apps/web/src/lib/export/manuscript.ts`
- `apps/web/src/lib/export/jobs.ts`
- `apps/web/src/lib/export/layout-snapshot.ts`

## Objetivo

Garantizar la reproducción verificable de una exportación editorial.

### 3.1. Instantáneas completas

Cada trabajo debe conservar suficiente información para representar el estado editorial seleccionado.

Considerar:

- Contenido.
- Versiones.
- Títulos.
- Tipos de sección.
- Orden.
- Jerarquía.
- Configuración de índice.
- Perfil de maquetación.
- Tipografía.
- Portada.
- Opciones editoriales.
- Recursos necesarios.

### 3.2. Distinguir estados

No confundir:

- Instantánea inexistente.
- Instantánea válida con cero secciones.
- Instantánea corrupta.
- Instantánea incompleta.

Cada caso debe tener tratamiento explícito.

### 3.3. Revisiones iniciales

Garantizar que la primera versión de cada sección sea recuperable cuando forme parte de una exportación histórica.

### 3.4. Portadas y recursos

Evaluar cómo conservar una referencia inmutable o versionada a la portada y demás recursos.

No depender exclusivamente de que una URL mutable siga devolviendo el mismo contenido.

No guardar innecesariamente archivos binarios en PostgreSQL.

### 3.5. Huella editorial

Generar una huella determinista a partir de todas las dependencias relevantes.

Evitar reutilizar archivos desactualizados.

**Pruebas obligatorias:** crear un libro, exportarlo, modificar sus títulos, capítulos y portada, y comprobar que el trabajo histórico mantiene el estado anterior.

---

# FASE 4 — UNIFICAR VISTA PREVIA Y PDF

**Prioridad: P1**

## Objetivo

Lograr correspondencia editorial entre la vista previa y el PDF final.

## Componentes que deben coincidir

1. Portada.
2. Páginas preliminares.
3. Tamaño físico de página.
4. Márgenes.
5. Tipografías.
6. Interlineado.
7. Sangrías.
8. Saltos.
9. Letras capitulares.
10. Encabezados.
11. Pies de página.
12. Numeración.
13. Índices.
14. Imágenes.
15. Notas al pie.
16. Orden de capítulos.
17. Páginas en blanco intencionales.
18. Configuración recto/verso.

## Problema especial: paridad de páginas

Cuando se incorpora una cubierta o una página preliminar, deben conservarse correctamente las reglas de inicio de secciones en página impar o par.

No asumir que la numeración lógica de la vista previa siempre coincide con el índice físico de página del PDF.

## Solución arquitectónica

Centralizar la representación del documento en un modelo de composición compartido.

Separar:

- Contenido editorial.
- Estructura lógica.
- Configuración de composición.
- Resultado paginado.
- Representación visual.
- Serialización PDF.

Evitar duplicar cálculos de paginación.

## Validación

Ejecutar:

`pnpm verify:preview-pdf`

Ampliar la prueba para incluir:

- Libros cortos.
- Libros extensos.
- Capítulos largos.
- Portada.
- Letras capitulares.
- Páginas preliminares.
- Saltos forzados.
- Imágenes.
- Notas al pie.
- Variantes tipográficas.

Comparar tanto estructura como geometría.

No exigir igualdad absoluta de píxeles entre motores de renderización diferentes, pero sí consistencia de composición dentro de tolerancias documentadas.

**Criterio de aceptación:** la vista previa debe representar fielmente la exportación bajo una misma configuración y una misma instantánea.

---

# FASE 5 — PROFESIONALIZAR EPUB Y DOCX

**Prioridad: P1**

## EPUB

Inspeccionar:

- `apps/web/src/lib/export/chapter-titles.ts`
- `packages/export-engine/src/epub.ts`

El motor debe respetar:

- `parentId`
- `showInToc`
- Orden de lectura.
- Jerarquía.
- Inclusión de secciones.
- Títulos.
- Numeración.
- Navegación interna.

No generar un índice plano cuando el autor haya organizado su obra jerárquicamente.

Verificar:

- EPUB válido.
- Documentos XHTML correctos.
- Enlaces internos.
- Navegación.
- Recursos.
- Metadatos.
- Compatibilidad razonable con lectores EPUB.

## DOCX

Revisar:

- Estructura de títulos.
- Estilos de párrafo.
- Saltos de página.
- Notas.
- Imágenes.
- Encabezados.
- Márgenes.
- Metadatos.
- Jerarquía de secciones.

No convertir todo el manuscrito en párrafos sin estructura semántica.

## Pruebas

Ejecutar los validadores existentes:

- `pnpm validate:epub`
- `pnpm validate:docx`
- `pnpm validate:pdf`

Cuando el entorno lo permita, ejecutar también:

`pnpm validate:docx:libreoffice`

Comparar los resultados contra una estructura editorial de referencia.

**Criterio de aceptación:** cada formato debe mantener la semántica, el contenido y la estructura que técnicamente le correspondan.

---

# FASE 6 — CORREGIR ESTADÍSTICAS Y PROGRESO

**Prioridad: P1**

## Objetivo

Eliminar inconsistencias entre los contadores del editor, biblioteca y ficha del libro.

Actualmente es necesario diferenciar correctamente capítulos y otros tipos de secciones.

## Implementar

Crear una fuente única de verdad para calcular:

- Total de capítulos.
- Total de secciones.
- Prólogos.
- Epílogos.
- Partes.
- Subcapítulos.
- Total de palabras.
- Palabras por sección.
- Objetivos.
- Porcentaje de progreso.
- Última modificación.

## Reglas

Un prólogo no debe contarse como un capítulo cuando la métrica se titula «Capítulos».

Las estadísticas deben actualizarse cuando se:

- Crea una sección.
- Elimina.
- Restaura.
- Duplica.
- Edita.
- Reordena.
- Ejecuta un reemplazo global.

Evaluar si corresponde recalcular o aplicar actualizaciones incrementales.

La optimización no debe comprometer la exactitud.

## Datos existentes

Preparar un script de reconciliación:

- Idempotente.
- Seguro.
- Con modo de simulación.
- Con registro de diferencias.
- Sin modificaciones destructivas.

**Criterio de aceptación:** todos los módulos deben mostrar estadísticas coherentes para un mismo libro.

---

# FASE 7 — REFORZAR EL EDITOR Y EL AUTOGUARDADO

**Prioridad: P1**

## Objetivo

Convertir el editor en un entorno de escritura robusto para manuscritos largos.

## Auditar

- Inicialización del editor.
- Cambios de capítulo.
- Autoguardado.
- Borradores locales.
- Sincronización.
- Historial.
- Conflictos.
- Recuperación.
- Conexiones interrumpidas.
- Edición simultánea.
- Atajos.
- Deshacer y rehacer.
- Formato.
- Inserción de recursos.

## Mejoras

Implementar estados claros:

- Guardando.
- Guardado.
- Sin conexión.
- Cambios locales pendientes.
- Conflicto.
- Error de guardado.

Nunca presentar «Guardado» cuando la confirmación del servidor todavía no existe.

## Recuperación

Probar los siguientes escenarios:

1. Cierre accidental.
2. Recarga de página.
3. Pérdida de internet.
4. Dos ventanas del mismo libro.
5. Cambios mientras se guarda.
6. Error temporal del backend.
7. Conflicto de versión.
8. Cambio de capítulo con escritura pendiente.

## Experiencia de escritura

Preservar el modo de concentración y los paneles retráctiles.

La edición debe permanecer cómoda en pantallas grandes y pequeñas.

No introducir animaciones que distraigan durante la escritura.

**Criterio de aceptación:** ningún escenario de prueba debe provocar pérdida silenciosa de cambios confirmados.

---

# FASE 8 — CORREGIR LA BÚSQUEDA Y REEMPLAZO GLOBAL

**Prioridad: P1**

## Archivo

`apps/web/src/lib/books/manuscript-search-actions.ts`

## Problema

La transformación del documento debe validarse nuevamente antes de persistirse.

## Implementar

Después de aplicar reemplazos:

1. Reconstruir el documento.
2. Ejecutar el validador completo del esquema Tiptap.
3. Comprobar límites de tamaño.
4. Preservar nodos y marcas.
5. Validar versiones.
6. Registrar revisiones.
7. Ejecutar la operación atómicamente.
8. Actualizar estadísticas coherentemente.

## Mejoras de UX

Ofrecer:

- Cantidad de coincidencias.
- Capítulos afectados.
- Vista previa de reemplazos.
- Confirmación antes de reemplazos masivos.
- Resultado de la operación.
- Mensajes de error útiles.

No alterar texto que no coincide.

## Pruebas

Verificar:

- Reemplazos grandes.
- Términos repetidos.
- Unicode.
- Caracteres especiales.
- Mayúsculas/minúsculas.
- Documentos vacíos.
- Texto formateado.
- Conflictos concurrentes.

**Criterio de aceptación:** el reemplazo global no debe corromper la estructura ni superar los límites permitidos del editor.

---

# FASE 9 — REDISEÑO UI/UX Y SISTEMA DE DISEÑO MODERNO

**Prioridad: P1**

Esta fase es fundamental para alcanzar la calidad visual solicitada.

## Objetivo

Dar a ESCRIBIENDO una identidad de aplicación editorial premium, comparable en refinamiento y facilidad de uso con las mejores herramientas actuales de escritura.

Tomar como referencia conceptual la claridad de Reedsy, Notion y aplicaciones editoriales modernas, sin copiar sus interfaces literalmente.

## 9.1. Lenguaje visual

Conservar la identidad de Editorial No Para Todos.

Propuesta estética:

- Minimalismo editorial.
- Fondos cálidos.
- Tipografía refinada.
- Buena jerarquía de títulos.
- Amplio espacio en blanco.
- Controles discretos.
- Acentos terracota.
- Bordes suaves.
- Sombras delicadas.
- Estados interactivos claros.
- Apariencia de herramienta profesional de escritura.

Evitar interfaces excesivamente decoradas.

## 9.2. Sistema de tokens

Centralizar:

- Colores.
- Tipografía.
- Tamaños.
- Alturas.
- Espaciados.
- Radios.
- Bordes.
- Sombras.
- Capas.
- Estados interactivos.
- Breakpoints.
- Transiciones.

Ejemplo de alturas base:

| Componente              | Altura     |
| ----------------------- | ---------- |
| Botón estándar          | 44 px      |
| Campo estándar          | 44 px      |
| Selector estándar       | 44 px      |
| Botón compacto          | 36 px      |
| Botón de icono estándar | 44 × 44 px |

Son referencias iniciales; cualquier variante debe mantener coherencia con el contexto de uso.

Todos los controles de una misma barra deben alinearse correctamente.

## 9.3. Biblioteca de componentes

Crear o consolidar componentes reutilizables para:

- Botones.
- Selectores.
- Formularios.
- Tarjetas.
- Indicadores de estado.
- Pestañas.
- Menús.
- Diálogos.
- Tooltips.
- Notificaciones.
- Breadcrumbs.
- Estados vacíos.
- Skeletons.
- Confirmaciones.

No agregar una biblioteca de componentes grande si la plataforma actual puede consolidarse de manera más ligera.

## 9.4. Refactorización de estilos

Auditar:

`apps/web/src/app/globals.css`

Reducir duplicaciones y sobrescrituras.

Separar progresivamente estilos globales, tokens, componentes y estilos específicos.

No realizar una reescritura masiva sin pruebas visuales.

## 9.5. Consistencia global

Auditar absolutamente todas las pantallas.

Ninguna sección debería parecer diseñada bajo un sistema visual diferente.

## 9.6. Estados visuales

Verificar:

- Hover.
- Focus.
- Active.
- Disabled.
- Loading.
- Error.
- Success.
- Empty.

Eliminar acciones falsas y enlaces que no llevan a ningún lugar.

**Criterio de aceptación:** diseño unificado, accesible, coherente y verificable con pruebas visuales automatizadas.

---

# FASE 10 — REDISEÑAR LA FICHA Y LA BIBLIOTECA

**Prioridad: P1**

## Archivo principal

`apps/web/src/app/(app)/books/[bookId]/page.tsx`

## Problemas a resolver

- Duplicación de «Editar metadatos».
- Controles de tamaños incompatibles.
- Portada poco visible.
- Jerarquía de acciones insuficiente.
- Estadísticas con significado confuso.
- Distribución visual mejorable.

## Diseño propuesto

### Encabezado editorial

Integrar:

- Portada.
- Título.
- Autor.
- Subtítulo.
- Género.
- Estado editorial.
- Fecha de modificación.
- Acción principal «Continuar escribiendo».

### Acciones secundarias

Agrupar coherentemente:

- Editar información.
- Cambiar estado.
- Configuración.
- Exportación.

No repetir acciones innecesariamente.

### Estadísticas

Construir tarjetas homogéneas de:

- Palabras.
- Capítulos.
- Objetivos.
- Progreso.
- Actividad reciente.

### Estructura editorial

Crear una presentación profesional del árbol de secciones.

Mostrar claramente niveles jerárquicos y acciones disponibles.

## Biblioteca

Optimizar:

- Tarjetas de libros.
- Miniaturas de portada.
- Estados.
- Búsqueda.
- Filtros.
- Ordenamiento.
- Acceso rápido.
- Creación de nuevas obras.

Evitar interfaces saturadas.

## Responsive

Comprobar como mínimo:

- 375 px.
- 390 px.
- 768 px.
- 1024 px.
- 1440 px.
- 1920 px.

**Criterio de aceptación:** las pantallas deben ser modernas, claras y cómodas tanto en escritorio como en móvil.

---

# FASE 11 — PORTADAS, PERSONAJES Y HERRAMIENTAS NARRATIVAS

**Prioridad: P2**

## 11.1. Portadas

Reutilizar el sistema existente.

Añadir una experiencia visible cuando el libro no tiene portada.

Permitir:

- Subir.
- Reemplazar.
- Previsualizar.
- Recortar.
- Ajustar el encuadre.
- Consultar resolución.
- Detectar formato.
- Identificar dimensiones insuficientes.

Mostrar una recomendación de dimensiones basada en el destino editorial.

Para cubiertas digitales puede utilizarse 1600 × 2560 px como referencia cuando la relación de aspecto coincida.

Para imprenta, las especificaciones deben depender del formato físico, lomo y sangrado.

## 11.2. Personajes

Perfeccionar el análisis narrativo existente.

Objetivos:

- Detectar candidatos a personajes.
- Identificar menciones.
- Reconocer nombres compuestos.
- Distinguir apodos.
- Reducir duplicados.
- Asociar apariciones con capítulos.
- Mostrar evidencias.
- Permitir aprobación del autor.

No inventar relaciones sin evidencia textual.

## 11.3. Mundos y planificación

Mejorar navegación, organización y relaciones entre elementos narrativos.

No introducir funciones de IA costosas o complejas si no existe una justificación clara.

**Criterio de aceptación:** herramientas conectadas al flujo de escritura, sin duplicación de datos ni acciones confusas.

---

# FASE 12 — SEGURIDAD Y CONTROL DE ACCESOS

**Prioridad: P0/P1 según gravedad**

## Objetivo

Reducir riesgos de pérdida, exposición o modificación indebida de datos.

## Auditar

- Sesiones.
- Autenticación.
- Autorización.
- Server Actions.
- Acceso por `bookId`.
- Acceso por `workspaceId`.
- Acceso a revisiones.
- Exportaciones.
- Subidas a Cloudinary.
- Enlaces de descarga.
- Validación Zod.
- Límites de solicitudes.
- Procesamiento de archivos.
- Registros de actividad.

## Comprobaciones

Cada operación debe validar el contexto correcto en el servidor.

No confiar únicamente en controles ocultos del frontend.

Proteger frente a:

- IDOR.
- Solicitudes manipuladas.
- CSRF cuando corresponda.
- Acceso entre espacios de trabajo.
- Archivos maliciosos.
- Recursos externos no confiables.
- Exposición de secretos.
- Abuso de exportaciones.
- Consultas excesivamente costosas.

## Cloudinary

Verificar:

- Tipos de archivo permitidos.
- Tamaño máximo.
- Firmas.
- Asociación al recurso correcto.
- Permisos.
- Retención y eliminación.
- Manejo de errores.

## Privacidad

Evitar registrar contenido de manuscritos, contraseñas, tokens o información sensible en logs de producción.

**Criterio de aceptación:** las operaciones sensibles deben contar con validación y pruebas de autorización negativa.

---

# FASE 13 — RENDIMIENTO, OPTIMIZACIÓN Y ESCALABILIDAD

**Prioridad: P2**

## Objetivo

Mejorar velocidad y estabilidad sin elevar innecesariamente los costos.

## Backend

Revisar:

- Consultas N+1.
- Índices.
- Consultas redundantes.
- Transacciones largas.
- Paginación.
- Cálculos repetidos.
- Caché.
- Conexiones a PostgreSQL.
- Límites de memoria.
- Tiempo de exportación.

## Frontend

Analizar:

- Tamaño de bundles.
- JavaScript innecesario.
- Hidratación.
- Renderizados repetidos.
- Componentes pesados.
- Carga diferida.
- Fuentes.
- Imágenes.
- Estados de carga.

## Exportaciones

Medir:

- Tiempo por libro.
- Uso máximo de memoria.
- Procesamiento concurrente.
- Libros grandes.
- Documentos con imágenes.
- Reintentos.
- Errores de trabajos.

Utilizar los scripts existentes:

- `pnpm bench:export`
- `pnpm stress:export`
- `pnpm check:size`

Registrar una línea base antes de optimizar.

## Indicadores

Medir al menos:

- Duración de carga de las principales vistas.
- Tamaño de JavaScript.
- Tiempo de respuesta de acciones críticas.
- Duración de exportaciones.
- Memoria máxima.
- Errores y reintentos.

Definir presupuestos de rendimiento a partir de mediciones reales.

Distinguir latencia normal de arranques en frío de Render Free.

**Criterio de aceptación:** mejoras cuantificables, sin regresiones funcionales.

---

# FASE 14 — PRUEBAS AUTOMATIZADAS Y CI/CD

**Prioridad: P1**

## Objetivo

Garantizar que las correcciones sigan funcionando después de futuras actualizaciones.

## 14.1. Verificaciones estáticas

Ejecutar los comandos existentes del repositorio:

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:validate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:size
```

Corregir errores encontrados.

No manipular los tests para hacerlos pasar falsamente.

## 14.2. Integración

Utilizar una base PostgreSQL desechable.

Probar:

- Creación de libros.
- Creación de capítulos.
- Movimiento jerárquico.
- Eliminación.
- Restauración.
- Revisiones.
- Estadísticas.
- Exportaciones.
- Control de acceso.

No conectar los tests destructivos a producción.

## 14.3. Pruebas E2E

Ejecutar:

`pnpm test:e2e`

Verificar los flujos completos.

### Escenario editorial principal

1. Crear libro.
2. Subir portada.
3. Crear prólogo.
4. Crear parte.
5. Crear capítulos.
6. Añadir subcapítulos.
7. Escribir contenido.
8. Editar títulos.
9. Reordenar.
10. Consultar estadísticas.
11. Generar vista previa.
12. Exportar PDF.
13. Exportar EPUB.
14. Exportar DOCX.
15. Volver a editar.
16. Descargar una exportación histórica.

## 14.4. Pruebas visuales

Añadir pruebas Playwright con capturas de referencia para:

- Biblioteca.
- Ficha.
- Editor.
- Planificación.
- Personajes.
- Maquetación.
- Vista previa.
- Exportación.
- Modales.
- Formularios.
- Modo oscuro.
- Móvil.

Comparar contra referencias aprobadas y actualizar las capturas únicamente cuando el cambio visual esté justificado.

## 14.5. Accesibilidad

Incorporar comprobaciones automatizadas con axe-core.

Verificar:

- Contraste.
- Etiquetas.
- Navegación con teclado.
- Foco visible.
- Mensajes de error.
- Modales.
- Menús.
- Preferencias de movimiento reducido.

## 14.6. GitHub Actions

Revisar los workflows existentes.

Deben ofrecer señales claras de:

- Formato.
- Lint.
- Tipos.
- Pruebas.
- Build.
- Integración.
- E2E.
- Validadores editoriales.

No almacenar credenciales directamente en el repositorio.

No permitir que una verificación obligatoria falle silenciosamente.

**Criterio de aceptación:** todas las pruebas obligatorias disponibles deben aprobar y las no ejecutadas deben figurar explícitamente como pendientes.

---

# FASE 15 — DOCUMENTACIÓN, OBSERVABILIDAD Y ENTREGA

**Prioridad: P2**

## Documentación

Actualizar:

- README.
- Arquitectura.
- Variables de entorno.
- Comandos de desarrollo.
- Estrategia de migraciones.
- Sistema editorial.
- Formatos de exportación.
- Procedimientos de recuperación.
- Guía de despliegue.

## Observabilidad

Mejorar los registros técnicos de:

- Fallos de exportación.
- Errores de base de datos.
- Conflictos de edición.
- Problemas de recursos.
- Fallos de procesamiento.

Evitar logs excesivos o que contengan manuscritos.

## Entrega por fases

Después de cada fase importante:

1. Revisar los cambios.
2. Ejecutar pruebas relevantes.
3. Corregir regresiones.
4. Registrar resultados.
5. Crear un commit descriptivo cuando la fase esté validada.

Mantener una rama de intervención coherente.

No publicar automáticamente cambios sin comprobar antes sus implicaciones.

## Despliegue

Antes de considerar la entrega lista:

- Revisar migraciones.
- Verificar variables necesarias.
- Comprobar que no se agregaron secretos.
- Preparar el procedimiento de publicación.
- Confirmar compatibilidad con Render y Neon.
- Verificar los health checks.
- Documentar las comprobaciones posteriores al despliegue.

No ejecutar migraciones de producción sin autorización y un plan de recuperación.

---

# FASE 16 — AUDITORÍA FINAL Y CICLO DE MEJORA

## Objetivo

Evaluar el resultado de manera independiente y comprobar cuánto mejoró la plataforma.

### Matriz de puntuaciones

Calificar cada campo de 0 a 10:

| Campo                                       |      Peso |
| ------------------------------------------- | --------: |
| Diseño, UX y accesibilidad                  |      15 % |
| Integridad y seguridad de datos editoriales |      20 % |
| Editor y lógica editorial                   |      20 % |
| Maquetación y exportaciones                 |      15 % |
| Seguridad y autorización general            |      10 % |
| Arquitectura y mantenibilidad               |      10 % |
| Rendimiento y escalabilidad                 |       5 % |
| Operación, pruebas y documentación          |       5 % |
| **TOTAL**                                   | **100 %** |

Dentro de cada campo, asignar subpuntuaciones con criterios explícitos.

Los resultados deben sustentarse en:

- Código revisado.
- Pruebas ejecutadas.
- Resultados medidos.
- Capturas de pruebas.
- Validaciones de archivos.
- Comportamiento real.
- Riesgos pendientes.

## Objetivo: 9,5/10

No asignar artificialmente una puntuación de 9,5.

Si permanecen problemas críticos P0, no declarar la plataforma lista para producción.

Si no se pudieron ejecutar pruebas esenciales, reflejarlo en la nota y en el grado de confianza de la evaluación.

## Ciclo de mejora

Después de la primera auditoría final:

1. Identificar los campos más débiles.
2. Clasificar los problemas restantes.
3. Corregir los de mayor impacto.
4. Ejecutar las pruebas relacionadas.
5. Volver a calcular puntuaciones.
6. Documentar las mejoras.

Realizar hasta tres rondas adicionales de corrección y auditoría dentro de la ejecución actual.

Si no se alcanza el 9,5, indicar claramente qué lo impide.

No repetir cambios sin evidencia ni generar ciclos infinitos.

---

# ORDEN OBLIGATORIO DE EJECUCIÓN

Organiza el trabajo mediante dependencias:

## BLOQUE A — PROTEGER LOS DATOS

Ejecutar:

- Fase 0.
- Fase 1.
- Fase 2.
- Fase 3.

**Condición para continuar:** no deben existir problemas críticos conocidos de integridad sin una mitigación explícita.

## BLOQUE B — GARANTIZAR CALIDAD EDITORIAL

Ejecutar:

- Fase 4.
- Fase 5.
- Fase 6.
- Fase 7.
- Fase 8.

**Condición para continuar:** manuscrito, estructura, vista previa y formatos deben mantener una lógica coherente en las pruebas disponibles.

## BLOQUE C — MODERNIZAR LA EXPERIENCIA

Ejecutar:

- Fase 9.
- Fase 10.
- Fase 11.

**Condición para continuar:** componentes reutilizables, pantallas consistentes y ausencia de regresiones visuales graves.

## BLOQUE D — SEGURIDAD Y OPTIMIZACIÓN

Ejecutar:

- Fase 12.
- Fase 13.

**Condición para continuar:** riesgos prioritarios atendidos y rendimiento medido.

## BLOQUE E — VALIDACIÓN Y ENTREGA

Ejecutar:

- Fase 14.
- Fase 15.
- Fase 16.

**Condición de finalización:** pruebas documentadas, informe de auditoría y estado de Git verificable.

---

# INFORMES DE AVANCE OBLIGATORIOS

Al terminar cada bloque, entregar un resumen con:

**1. Trabajo realizado**

Qué archivos y funciones se modificaron.

**2. Problemas corregidos**

Qué errores quedaron solucionados y cómo se comprobó.

**3. Pruebas**

Comandos, resultados y pendientes.

**4. Riesgos**

Qué aspectos requieren atención adicional.

**5. Siguiente fase**

Qué corresponde ejecutar a continuación.

Estos informes deben ser concretos y no interrumpir innecesariamente la implementación.

Continúa con las fases siguientes sin solicitar confirmaciones rutinarias. Detente únicamente si hace falta autorización para una operación destructiva, irreversible, externa o que afecte datos reales.

---

# INFORME FINAL DEL PROYECTO

Crear un documento:

`docs/AUDITORIA_INTEGRAL_ESCRIBIENDO_V6_1.md`

Debe contener:

## I. Resumen ejecutivo

Descripción de la intervención, resultado general y condición de preparación para producción.

## II. Estado inicial

Puntuación de referencia y hallazgos verificados.

## III. Problemas corregidos

Tabla:

| ID | Prioridad | Problema | Archivo | Corrección | Evidencia | Estado |

## IV. Arquitectura final

Descripción de módulos y dependencias relevantes.

## V. Mejoras de diseño

Componentes, patrones, uniformidad y responsive.

## VI. Calidad editorial

Resultados para editor, capítulos, portada, vista previa, PDF, EPUB y DOCX.

## VII. Seguridad e integridad

Invariantes protegidas, pruebas negativas y riesgos pendientes.

## VIII. Rendimiento

Comparación cuantitativa antes y después.

## IX. Pruebas ejecutadas

Comandos, resultados reales y cobertura.

## X. Puntuaciones

Mostrar para cada área:

- Nota anterior.
- Nota actual.
- Variación.
- Evidencia.

## XI. Pendientes

Limitaciones y acciones recomendadas.

## XII. Entrega Git

Mostrar:

- Rama.
- Commits.
- Archivos modificados.
- Estado del repositorio.
- Resultado de push.
- Pull request, si corresponde.

No afirmar que el repositorio se desplegó si solo se realizó un push.

---

# INSTRUCCIÓN FINAL

Quiero que ESCRIBIENDO evolucione desde una plataforma técnicamente funcional hacia un producto editorial profesional de alta calidad.

No quiero únicamente cambios de apariencia.

Quiero mejoras reales y demostrables en:

- Arquitectura.
- Código.
- Seguridad.
- Integridad.
- Escritura.
- Organización editorial.
- Maquetación.
- Exportaciones.
- Interfaz.
- Experiencia del autor.
- Rendimiento.
- Accesibilidad.
- Mantenibilidad.
- Pruebas.
- Preparación para producción.

**Realiza el trabajo siguiendo estrictamente las fases y prioridades establecidas.**

No omitas una fase porque parezca visualmente menos importante.

No declares corregido un problema sin comprobarlo.

No elimines capacidades existentes para facilitar las pruebas.

No conviertas una solución compleja en una simulación.

No introduzcas cambios de alto riesgo sin revisar sus consecuencias.

Preserva la identidad editorial de ESCRIBIENDO y de Editorial No Para Todos.

Al finalizar las fases, realiza una auditoría independiente y vuelve a corregir las debilidades verificadas dentro del límite establecido.

**META FINAL: ESCRIBIENDO v6.1, con una calidad objetivo de 9,5/10 o superior, sustentada mediante evidencias técnicas, resultados reproducibles y una experiencia editorial profesional.**

# Corrección de seguridad y fiabilidad — 27 de octubre de 2026

## Alcance vigente

Aplicación del adjunto AUD-01 a AUD-08 sobre `a8f53e4` de `main`, sin cambios
locales iniciales. Rama `fix/auditoria-seguridad-20261027`. Esta revisión no
sustituye la auditoría funcional/editorial de todo el producto ni le asigna una
puntuación nueva. No se consultó ni escribió la base de producción.

## Correcciones

- AUD-01: se retira regex del usuario, conservando búsquedas literales y opciones
  Unicode; ambas actions rechazan solicitudes antiguas con regex activada.
- AUD-02: catálogo único de ocho columnas CSV, escape, BOM y neutralización de
  fórmulas; la respuesta JSON permanece independiente.
- AUD-03: IP validada desde la derecha según TRUSTED_PROXY_HOPS, sin saltar
  entradas basura; IPv6 normalizada. Con cero proxies no se confía en cabeceras.
- AUD-04: fallos serializados con bloqueo de fila PostgreSQL, incremento atómico,
  reinicio tras expiración y un único evento de auditoría por bloqueo. Se elige
  la opción mínima permitida: no extender un bloqueo activo. No elimina por sí
  sola el riesgo de bloqueo deliberado por atacantes distribuidos.
- AUD-05: URL ligada al publicId exacto para imágenes interiores y portadas.
  La portada ya tenía comprobación de versión/identidad, que se conserva.
  Metadatos del cliente documentados como informativos, sin llamada Admin.
- AUD-06: retención semanal mediante Actions, sesiones revocadas antiguas
  incluidas, aviso al arrancar si WEB_CONCURRENCY es mayor que uno.
- AUD-07: reclamación atómica de tareas abandonadas tras diez minutos, máximo
  cinco intentos y control de generación para impedir escrituras de procesadores
  sustituidos. Ya existía recuperación al consultar sugerencias; se limita y se
  completa la ruta directa. Sin columna ni migración nueva.
- AUD-08.1: invitación condicionada a no aceptada, vigente y no revocada dentro
  de la transacción; límite por IP y error controlado ante colisión de correo.
- AUD-08.2: descarga de imágenes en streaming con aborto por bytes reales.
- AUD-08.3: clave explícita obligatoria al iniciar producción; derivado solo
  para desarrollo/pruebas. Render debe configurar EXPORT_SIGNING_SECRET.
- AUD-08.4: se retira la excepción style-src-attr de personajes; los componentes
  actuales usan clases y coordenadas SVG, sin atributos de estilo propios.
- AUD-08.5: informes históricos conservados completos en esta carpeta; los
  antiguos caminos enlazan aquí. No se eliminan resultados anteriores.

## Verificación

Cada cambio de lógica tiene una regresión Vitest, ejecutada primero en rojo y
luego en verde. Verificación global y E2E: pendientes de la ejecución final.
No se hizo mantenimiento ni carga contra producción.

## Propuesta de división, sin refactorizar (AUD-08.6)

`section-editor.tsx`: extraer estado de guardado/borrador/conflictos a un hook
`useSectionPersistence`, eventos de notas a `useFootnoteDialog`, búsqueda a
`useEditorSearch`, comandos a `editor-commands`, y separar barra, diálogos y
estado de guardado como componentes. Mantener un solo propietario del editor,
callbacks estables y pruebas de desmontaje/restauración antes de extraer.

`lib/books/actions.ts`: separar acciones de libro, estructura de secciones,
guardado/revisiones y opciones editoriales. Compartir validación, acceso al libro
y funciones transaccionales privadas; cada entrada conserva origen, sesión,
workspace y assertCanPerform. Evitar un barrel que mezcle exports de server
actions con lógica síncrona. No se realiza esta división en esta intervención.

# Correcciones del editor: lotes 1 y 2

## Estado por hallazgo

| Lote | Hallazgo | Resultado                                                                                                                                                                                                               |
| ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | E1       | Eliminar desde ⋮ con permiso `section:delete`, confirmación visible y número de descendientes. Borrar la sección abierta o un antecesor lleva al libro; borrar otra refresca el editor. Revalidación de preview/export. |
| 1    | E2       | Índice/derechos fuera de la creación manual; el servidor rechaza altas de esos tipos. Fila «Índice (automático)». Las secciones antiguas conservan lectura y borrado.                                                   |
| 1    | E6       | Resultado visible de mover/eliminar, con estilo de éxito/error y `role="status"`.                                                                                                                                       |
| 1    | T1       | La edición de alt/pie no enfoca el documento en cada pulsación.                                                                                                                                                         |
| 1    | G1       | Instantánea local inmediata al ocultar/desmontar, envío manual sin esperar y envío pendiente tras una petición en curso.                                                                                                |
| 1    | G2       | Restauración en el historial completo con permiso; «Ver todas» conserva su destino. Remontaje por ID/versión e inicialización nueva de `versionRef`.                                                                    |
| 2    | E4       | Orden de raíces por grupo y luego `sortOrder`; hijos conservan su jerarquía. Pruebas de prólogo tardío en preview, exportación y búsqueda.                                                                              |
| 2    | E5       | Sangrar y sacar de, con destinos calculados por jerarquía y acciones deshabilitadas cuando no corresponden. El servidor conserva las validaciones de ciclos.                                                            |
| 2    | E8       | Opciones de sección persistidas con permiso, auditoría y revalidación; profundidad y grupos del índice guardados en la edición desde Maquetación.                                                                       |
| 2    | E3       | Documentadas las dos alternativas; no se cambia la política actual de permisos. Decisión pendiente.                                                                                                                     |
| 2    | T2       | Controles de imagen visibles también al seleccionar una imagen.                                                                                                                                                         |
| 2    | T3       | Edición/eliminación de notas desde el Dialog existente, con texto prellenado; sin prompt/alert/confirm del navegador.                                                                                                   |
| 2    | G3       | La recuperación usa un ref del título; renombrar no dispara una nueva carga de borrador.                                                                                                                                |
| 2    | G4       | Respuesta `retryAfterMs` con el intervalo restante y fecha mínima de autoguardado que sobrevive a nuevas pulsaciones.                                                                                                   |

## Validación

- Lote 1: `pnpm lint`, `pnpm typecheck` y `pnpm test` aprobados; 641 pruebas.
- Lote 2: los tres comandos aprobados; 652 pruebas en 79 archivos.
- Nuevas pruebas de orden, destinos de jerarquía, opciones/permisos, profundidad de índice, evento de nota e intervalo de autoguardado.
- Se actualizaron fixtures heredadas de preview/reproducción para aislar las materias automáticas incorporadas previamente en `main`. No se cambia su implementación.
- Un commit principal por hallazgo, en el orden solicitado, más ajustes auxiliares de fixtures/E2E y esta guía.
- No se cambia el esquema de Prisma ni se crea una migración. Solo se añade el tipo a la consulta de versiones de exportación para aplicar E4; no se modifican los motores de generación.

La suite E2E remota completa debe consultarse en el PR: estas cifras corresponden a Vitest, no equivalen a una certificación completa del navegador.

## Pruebas manuales prioritarias

1. **E1/E6:** con OWNER/ADMIN, crear padre con dos hijos y un nieto. Al eliminar el padre, comprobar que la confirmación visible indica tres subsecciones. Cancelar debe conservar todo. Confirmar desde el padre o un descendiente debe llevar al libro. Borrar otra rama debe conservar abierta la sección actual y mostrar éxito. Un AUTHOR sin `section:delete` no debe ver Eliminar y el servidor debe rechazar una petición directa.
2. **T1/T2:** insertar y seleccionar una imagen, cerrar las herramientas y volver a seleccionarla. Escribir una frase completa y acentos en alt y pie: el foco y el cursor deben permanecer en el campo. Guardar y recargar; comprobar ambos textos.
3. **T3:** insertar dos notas. Pulsar una llamada, comprobar el texto prellenado, editar y guardar. Cancelar debe conservar el texto. «Eliminar nota» debe quitar solo esa llamada y renumerar la siguiente. Recargar y comprobar persistencia, sin cuadros nativos del navegador.
4. **G1:** escribir y cambiar inmediatamente de capítulo antes de 700 ms; volver y comprobar el contenido. Repetir ocultando la pestaña, sin conexión, y mientras hay un guardado en curso. Recuperar la conexión y comprobar el contenido tras recargar. IndexedDB y el envío son operaciones asíncronas: un cierre forzado del navegador/equipo puede interrumpirlas; no se promete durabilidad absoluta ante ese cierre.
5. **G2/G3:** crear cinco revisiones, abrir «Ver todas», restaurar una anterior y volver al editor. Comprobar texto/versión nuevos y que el siguiente guardado parte de esa versión. Renombrar con texto reciente y comprobar que no se reinstala un borrador antiguo. REVIEWER/AUTHOR sin `revision:restore` no deben poder restaurar.
6. **E2/E4/E5:** comprobar que no aparecen tipos manuales de índice/derechos. Un prólogo creado después de los capítulos debe quedar antes en sidebar, preview, export y búsqueda. Sangrar una sección con hijos y sacarla de nuevo; comprobar posiciones, persistencia y ausencia de ciclos.
7. **E8:** alternar cada opción de sección, guardar y recargar. Exportación/índice deben respetar inclusión y visibilidad; preview debe reflejar saltos. En Maquetación, cambiar profundidad e inclusión de preliminares/finales, guardar y revisar el índice automático.
8. **G4:** realizar dos cambios dentro de 45 segundos. En Red, el autoguardado pospuesto debe indicar `retryAfterMs` y no generar solicitudes cada tres segundos durante esa espera. Seguir escribiendo no debe eliminar la espera; Guardar manual debe seguir disponible.

## Decisión pendiente

E3 requiere decidir entre autorización por autoría o una papelera; véase `DECISION_E3_ELIMINACION_SECCIONES.md`. Ninguna de esas dos políticas se implementa en estos lotes.

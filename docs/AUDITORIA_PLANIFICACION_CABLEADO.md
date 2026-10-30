# Auditoría de cableado y uso de Planificación

**Base revisada:** `main` en `85d0cf4` (30 de octubre de 2026).  
**Alcance:** página de planificación, tablero modular, fichas de escritura, acciones y consultas Prisma.  
**Estado:** auditoría técnica y primera etapa de gestión segura en curso; no equivale a una certificación integral del producto.

## Flujos comprobados en el código

| Uso                            | Interfaz / ruta                   | Guardado / permiso                                                                   | Efecto esperado                                                           |
| ------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Crear y editar tarjeta         | Tablero modular / diálogo         | `modularPlanAction`, control de libro, workspace, versión narrativa y `story:manage` | Actualiza el plan; no escribe prosa en el manuscrito                      |
| Mover parte, capítulo o escena | Tablero, lista y flujo            | `movePlan`; jerarquía y ciclos validados                                             | Cambia ubicación del plan. Aplicar al manuscrito es una acción aparte     |
| Aplicar estructura             | Acción explícita desde el tablero | Exige `section:create`, `section:move` y coherencia de `sourceKey`                   | Crea secciones vacías o cambia su ubicación; no reemplaza texto existente |
| Ficha de escritura             | `WritingPlanning`                 | Revisiones versionadas; validación de personajes/lugares del libro                   | Copia una guía aprobada; no promete que una IA externa vaya a obedecerla  |
| Buscar y mostrar árbol         | Tablero modular                   | 1.000 tarjetas máximas, filtros y orden determinista                                 | El estado de lectura no modifica el plan                                  |
| Papelera                       | Gestión del plan (primera etapa)  | Consulta acotada al libro/workspace y solo para gestores                             | Borrado lógico; el manuscrito permanece independiente                     |

## Hallazgos y decisiones

1. **La búsqueda y los derivados ya están optimizados en `main`.** `useMemo`, `useDeferredValue`, texto prenormalizado y `sectionById` resuelven parte del informe anterior. Falta medir interacción y render con datos grandes; no hace falta rehacer esos cambios.
2. **La eliminación original era incompleta para “manejar todo”.** Solo permitía archivar hojas y podía perder el vínculo de la tarjeta con la sección al borrar. La implementación en revisión agrega borrado lógico de ramas, restauración por lote, paginación de papelera y vaciado con confirmación explícita. La restauración no debe reclamar vínculos que ahora pertenezcan a otra tarjeta.
3. **El tablero, la guía y el manuscrito son capas diferentes.** Reordenar o eliminar una tarjeta del plan no debe borrar prosa. Aplicar una estructura sigue siendo explícito y protegido por versión/hash de las secciones.
4. **Contexto de personajes y lugares ya existe en las guías**, con referencias por ID. Falta una vista integrada en las tarjetas; antes de crear relaciones paralelas conviene decidir si la ficha aprobada es la fuente canónica o si el plan necesita metadatos editables con revisión propia.
5. **El importador desde informe libre sigue pendiente.** Debe analizar texto como propuesta, presentar ambigüedades y esperar confirmación. No debe crear títulos o hechos ausentes ni importar automáticamente ante una baja confianza.
6. **La cronología requiere una distinción visible.** El orden de lectura del árbol no es igual a la fecha narrativa. El modelo de eventos admite fechas opcionales y precisión, así que se puede integrarlos sin inventar fechas; las escenas no fechadas deben quedar expresamente como desconocidas.
7. **La propuesta de optimización requiere perfilado antes de añadir virtualización o dividir el componente.** El límite actual del plan es 1.000 tarjetas; las pruebas deben medir 30/200/1.000, búsqueda, movimiento y memoria. El total de JavaScript del sitio no prueba el coste específico de `/planning`.
8. **Límites del alcance:** no están implementados todavía importación inteligente del informe, tabla avanzada POV/lugar/tiempo, nuevos esquemas snowflake/Save the Cat, filtros de POV, colaboración ni IA generativa. Las sugerencias de IA deben permanecer revisables, con evidencia y aprobación humana.

## Verificación disponible

En el commit integrado de interfaz `959a359` pasaron las pruebas generales (1.202 pruebas, lint, tipos y compilación), la geometría responsive (112 combinaciones) y 105 pruebas E2E. Para la etapa de papelera se añadieron pruebas unitarias de archivo/acción y un E2E que verifica eliminación, restauración y preservación del contenido del manuscrito; sus resultados de CI deben registrarse antes de declarar esa etapa terminada.

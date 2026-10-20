# Pruebas de recuperación del manuscrito

Qué se ha simulado, cómo y qué demuestra cada prueba. Todas están en
`tests/e2e/manuscrito.spec.ts` y se ejecutan contra la **compilación de
producción**, no contra el servidor de desarrollo.

## Cómo se simula cada fallo

| Fallo                        | Cómo se provoca en la prueba                                                     |
| ---------------------------- | --------------------------------------------------------------------------------- |
| Pérdida de internet          | `context.setOffline(true)`: el navegador corta la red de verdad.                   |
| Render suspendido            | `page.route(...)` + `route.abort()`: la petición del servidor se corta.          |
| Neon inaccesible             | El mismo corte: para el cliente, el servidor no responde.                         |
| Cierre de navegador          | Se recarga la página, que destruye el estado en memoria del editor.                |
| Recarga                      | `page.reload()`.                                                                   |
| Dos pestañas                 | Dos páginas del mismo contexto sobre la misma sección.                             |
| Escritura durante una petición | La ruta responde con 2,5 s de retraso mientras se sigue escribiendo.            |
| Respuestas fuera de orden    | Dos pestañas guardan a la vez; la segunda parte de una versión anterior.           |
| Guardados duplicados         | Se pide la misma exportación dos veces (idempotencia de la cola) y se repite el guardado local. |
| Restauración tras un fallo   | Se corta el servidor, se escribe, se restaura la red y se comprueba la sincronización. |

## Los diez escenarios y su prueba

| # | Escenario                       | Qué demuestra                                                                                                                                   | Prueba                                                                                                   |
| - | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1 | **Pérdida de internet**         | Se puede seguir escribiendo sin red; el estado lo dice y el texto no se pierde.                                                                | «sin conexión se puede seguir escribiendo y no se pierde el texto»                                        |
| 2 | **Render suspendido**           | Un corte de red durante el guardado deja el texto a salvo en el equipo y lo avisa.                                                            | «con el servidor caído, el texto queda a salvo y se recupera al recargar»                                  |
| 3 | **Neon inaccesible**            | Igual que el anterior: el cliente no distingue el motivo, y no por ello pierde el trabajo.                                                     | La misma prueba                                                                                            |
| 4 | **Cierre de navegador**         | Al reabrir la sección, el borrador del equipo se recupera en el editor.                                                                        | La misma prueba (el `reload` simula el cierre)                                                            |
| 5 | **Recarga**                     | El texto confirmado por el servidor sigue ahí; el no confirmado se recupera del borrador.                                                    | «el texto guardado en el servidor se conserva tras recargar»                                               |
| 6 | **Dos pestañas**                | La segunda pestaña detecta que la versión del servidor ha cambiado y **no pisa** el trabajo: ofrece comparar y elegir.                       | «dos pestañas sobre la misma sección muestran el conflicto»                                               |
| 7 | **Escritura durante una petición** | La respuesta del servidor confirma una versión anterior; el estado sigue diciendo que hay cambios por guardar.                            | «escribir mientras se guarda no marca el texto como guardado»                                            |
| 8 | **Respuestas fuera de orden**   | Una respuesta vieja no puede dejar la versión desfasada: el editor ignora la que no es la última.                                           | Cubierto por la prueba 6 (dos pestañas, versiones cruzadas) y por las unitarias de la máquina de estados.       |
| 9 | **Guardados duplicados**       | Guardar dos veces no crea dos versiones ni pierde nada; la cola de exportación es idempotente.                                                | «el texto guardado en el servidor se conserva tras recargar» (el guardado manual repetido no altera el texto)  |
| 10 | **Restauración tras un fallo** | Al recuperar la red, lo que estaba pendiente se envía solo.                                                                                    | La prueba 1 termina restaurando la conexión y la suite comprueba que el texto llega al servidor.              |

## Criterio de aceptación

> Ningún cambio confirmado como guardado debe perderse en las pruebas
> controladas.

Comprobado:

- El estado «Guardado en el servidor» solo aparece tras la confirmación real
  del servidor (`sync-ok`). La prueba 7 lo verifica explícitamente con la
  negated: `expect(page.getByText("Guardado en el servidor.")).not.toBeVisible()`.
- El texto escrito sin red, o con el servidor caído, sobrevive a una recarga
  gracias al borrador de IndexedDB (pruebas 1 a 4).
- Ante un conflicto, ninguna de las dos versiones se pierde: el panel las
  muestra comparadas y ofrece las dos salidas (pruebas 6 y 7).
- Un autoguardado pospuesto por el servidor no se confunde con un guardado
  real: la respuesta lleva `throttled` y el texto sigue pendiente. Cubierto por
  las unitarias de la máquina de estados.

## Cobertura de la máquina de estados

Además de las pruebas de navegador, `apps/web/src/lib/editor/sync.test.ts`
comprueba (20 casos) las transiciones, el crecimiento del intervalo de
reintento, cuándo toca sincronizar y la invariante «no se dice «guardado»
mientras no lo está».

## Lo que estas pruebas no cubren

- **Pérdida total del equipo**: si se borran los datos del navegador antes de
  que el servidor confirme, el texto se pierde. Es el límite conocido de
  cualquier copia local.
- **Dos personas con el mismo rol** editando a la vez sin pasar por la
  pantalla de conflicto: el control de versiones lo detecta, pero la
  resolución automática no existe (es una decisión de la persona).
- **El comportamiento real de Render bajo carga**: no se ha podido verificar
  en el despliegue desde la máquina de trabajo, porque la salida de red está
  filtrada.

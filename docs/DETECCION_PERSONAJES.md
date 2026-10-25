# Verificación de nombres de personajes

El motor `personal-names-2.0` usa dos pasadas sobre el texto real. La primera localiza menciones con contexto personal; la segunda recorre las menciones en sentido inverso y comprueba su forma, contexto y correspondencia con la identidad propuesta. Una mayúscula por sí sola no acredita un personaje: se filtran palabras comunes, encabezados, organizaciones y contextos geográficos.

Se distinguen nombres compuestos y apellidos probables, incluidas partículas como «de la». No se inventa un apellido ausente. Los nombres desconocidos requieren contexto personal explícito. Se conservan tildes y ñ para no fusionar identidades diferentes. «Andrés» se vincula con «Andrés Salazar» solo cuando la forma corta aparece realmente y no hay otro propietario posible. Dos personajes llamados Juan no se fusionan automáticamente.

El botón «Volver a analizar el libro» verifica todos los capítulos conjuntamente; el procesamiento incremental utiliza el mismo núcleo. Las propuestas muestran nombre, apellido probable, variantes y evidencia literal. Aceptar exige una verificación vigente y un texto fuente sin cambios. Las propuestas antiguas deben reanalizarse. Se preservan fichas y decisiones aceptadas o descartadas; las propuestas pendientes obsoletas se archivan.

## Límites

Es un verificador determinista conservador, no una garantía de reconocimiento universal. Puede omitir nombres raros sin contexto explícito y menciones aisladas. El autor siempre puede crear una ficha manualmente. Los límites de trabajo se notifican: hasta 200 secciones, 8 millones de caracteres conjuntos, un millón por sección, 30 000 menciones iniciales y 500 candidatos; la persistencia de propuestas nuevas está limitada a 100 por ejecución. No se envía el manuscrito a servicios de IA.

## Migración y operación

Aplicar `pnpm db:migrate` antes de desplegar. La migración aditiva `20261024200000_character_name_verification` añade JSONB opcional a StoryCharacterSuggestion; no elimina datos. Esta entrega incluye también la migración del laboratorio `20261024130000_complete_editorial_laboratory`. No se ha modificado la base de producción.

La generación mediante `pnpm db:migrate:create` necesita PostgreSQL y una base sombra accesibles. En este entorno se validó el SQL aplicando toda la cadena a una base PGlite aislada; esto no sustituye una prueba de concurrencia en PostgreSQL nativo.

Comprobación local de un archivo UTF-8:

```sh
node --import tsx scripts/verificar-personajes.ts manuscrito.txt
node --import tsx scripts/verificar-personajes.ts manuscrito.txt --evidencias
```

Por defecto el script no imprime fragmentos del manuscrito. Acepta archivos de hasta 16 MB y comunica los límites internos alcanzados.

## Validación

Pruebas unitarias cubren palabras con mayúscula, apellidos, nombres compuestos, ambigüedad, variantes reales, Unicode, nombres regionales, independencia del orden de capítulos, evidencia y conservación de decisiones. Las pruebas E2E crean dos capítulos, analizan conjuntamente, aceptan una sola ficha y vuelven a analizar; incluyen una pantalla móvil de 390 px.

Medición sintética local, una sección repetitiva: 10 000 palabras en 85 ms, 50 000 en 270 ms y 100 000 en 451 ms. Con 200 000 palabras se alcanzó el límite de caracteres de una sección (863 ms), por lo que ese resultado es parcial. Estas cifras no representan todos los libros ni un ensayo de carga de producción.

Cierre: 929 pruebas unitarias en 120 archivos, lint, typecheck, formato y build de producción aprobados. Las cinco pruebas E2E autenticadas pasaron sobre una base aislada con todas las migraciones: personajes, laboratorio, sincronización de revisión, recuperación de conexión, restauración y descargas reales PDF/EPUB/DOCX. En el libro de prueba, el número de páginas del PDF coincide con la vista previa. No equivale a una auditoría de todos los manuscritos existentes.

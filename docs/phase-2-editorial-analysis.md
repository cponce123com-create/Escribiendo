# Fase 2 — Corrección de estilo y análisis editorial

## Propósito y límites

Este panel ofrece observaciones para que la autora o el autor decida si una señal resulta útil. Ninguna regla reescribe el manuscrito ni convierte automáticamente un recurso deliberado en error. Los detectores de repetición comparan formas léxicas y patrones superficiales; no prueban que dos pasajes sean redundantes en significado. Las métricas de legibilidad y ritmo describen rasgos formales, no el mérito, la calidad ni la tensión narrativa.

Los hallazgos vinculados al texto usan coordenadas UTF-16 de ProseMirror de una versión concreta de la sección. El enlace abre esa versión guardada y selecciona el rango exacto. Si la versión cambió desde el análisis, la selección se descarta y se pide recalcular, para no llevar a una posición engañosa.

## Legibilidad en español

### Fernández-Huerta

La forma convencional es `206.84 − 0.60 × P − 1.02 × F`, con `P` como sílabas por cada 100 palabras y `F` como oraciones por cada 100 palabras. Al expresar ambas variables como tasas del texto, su lectura escalable es `206.84 − 60 × (sílabas / palabras) − 102 × (oraciones / palabras)`. La interfaz y el resultado computado conservan ambas expresiones y declaran la ambigüedad publicada sobre la normalización del término de oraciones; no se presenta una discrepancia histórica como consenso definitivo.

### Szigriszt-Pazos

Para muestras de mayor tamaño se usa la forma `207 − 62.3 × (sílabas / palabras) − (palabras / oraciones)`. Si faltan palabras u oraciones, el resultado correspondiente queda como dato insuficiente en vez de producir una división por cero.

El recuento silábico es una heurística ortográfica que contempla patrones comunes de vocales, diptongos, hiatos y diéresis. No es un modelo fonológico: puede fallar ante nombres propios, pronunciaciones regionales, sinalefas y excepciones. Se marcan muestras breves porque los índices pueden variar con el tamaño del fragmento. Los valores se describen como indicadores estructurales orientativos, no como nota literaria ni nivel definitivo de comprensión.

### Base documental

La descripción en español de las variables de Fernández-Huerta y de la versión de muestra grande de Szigriszt-Pazos se contrasta con Ríos Hernández [1]. La literatura de legibilidad advierte que las fórmulas pueden dar resultados distintos porque ponderan rasgos diferentes; por ello conviene mostrar más de una medida y no tratar una cifra única como evaluación universal [2]. Una nota de discusión lingüística documenta una posible ambigüedad o inversión en transcripciones habituales de Fernández-Huerta y deriva la forma escalable indicada arriba [3].

## Detección de repeticiones: decisiones algorítmicas

- **N-gramas exactos:** se eligen para frases coincidentes porque son transparentes y permiten anclar las dos apariciones. Se filtran secuencias puramente funcionales y rangos solapados.
- **TF-IDF con coseno sobre unigramas y bigramas:** se usa para proponer párrafos con vocabulario parecido. Los términos frecuentes pesan menos que los distintivos y el índice invertido limita candidatos; el resultado es similitud textual, no redundancia semántica. Un umbral conservador evita presentar diferencias superficiales como diagnóstico.
- **Distancia de Levenshtein:** no se adopta en esta versión. Mide ediciones de caracteres, puede confundir una diferencia ortográfica con similitud editorial y su coste de comparación crece con las longitudes de las cadenas; no resuelve equivalencia de significado.
- **N-gramas exactos y coseno TF-IDF son complementarios:** el primero detecta repetición literal; el segundo encuentra coincidencias léxicas aproximadas. Ambos devuelven propuestas que requieren contexto y juicio humano.

## Fuentes

[1] Ríos Hernández, R. “Un acercamiento a la legibilidad de textos relacionados con el campo de la salud.” _Chasqui_, n.º 135 (2017), pp. 263–270. [PDF del artículo](https://revistachasqui.org/index.php/chasqui/article/download/2892/pdf/8202).

[2] Artículo de acceso abierto en _PubMed Central_ (2018), secciones “Reading Formulae in Spanish”, “Variability Across Formulae” y apéndice de fórmulas. [PMC5831059](https://pmc.ncbi.nlm.nih.gov/articles/PMC5831059/).

[3] Gwillim Law. “Error in the Fernandez Huerta Readability Formula.” _LINGUIST List_ 22.2332, 2 de junio de 2011. Se presenta como discusión de una posible ambigüedad, no como corrección oficial de la publicación original. [Nota](https://linguistlist.org/issues/22/2332/).

## Implementación integrada

La ruta de análisis vive en la ficha de cada libro y también se enlaza desde el workspace del manuscrito. En servidor se analizan solamente secciones narrativas visibles para la sesión; no se persisten resultados ni se envían manuscritos a servicios externos. El procesamiento tiene límites por secciones, bytes y bloques; el panel muestra avisos cuando omite texto o un detector alcanza sus límites.

El corrector integra nueve familias de señales: conectores repetidos al inicio de oraciones próximas, muletillas, adverbios en «-mente», oraciones largas, párrafos extensos, redundancias léxicas conocidas, expresiones potencialmente ambiguas, construcciones perifrásticas y patrones de espaciado de puntuación. Son heurísticas con confianza informativa y explicaciones prudentes. Cada observación se puede **Ignorar** o restaurar; esa preferencia se guarda en `localStorage` bajo una clave por usuario, libro y versión de hallazgo.

El detector compara palabras significativas repetidas, frases exactas por n-gramas y párrafos mediante TF-IDF/coseno; clasifica pares dentro del capítulo o entre capítulos y enlaza ambas apariciones. Los subcapítulos heredan el capítulo raíz; prólogo, introducción, interludio y epílogo se agrupan como unidades propias. Los enlaces incluyen offsets UTF-16 y versión de contenido; si la versión actual no coincide, el editor informa que se debe recalcular en lugar de seleccionar un rango obsoleto.

Las métricas de ritmo incluyen conteo por sección narrativa, palabras y oraciones por párrafo, media y distribución de extensión, variación de palabras entre secciones y proporción de diálogo/no diálogo. El diálogo se aproxima a partir de bloques identificados por raya («—») o semirraya («–»); no se infiere por significado. Las comparaciones y la variación poblacional son descriptivas y no constituyen una medida de tensión narrativa.

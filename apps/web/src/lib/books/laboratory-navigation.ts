/** Destinos reales de las herramientas existentes; compartido por UI y pruebas. */
export function laboratoryTools(bookId: string, sectionId?: string) {
  const book = `/books/${encodeURIComponent(bookId)}`;
  const narrative = `/narrative?book=${encodeURIComponent(bookId)}`;
  return [
    {
      id: "ortografia",
      name: "Ortografía",
      description:
        "Abre un capítulo y usa Revisar en el editor. Reglas locales y propuestas que tú decides aplicar.",
      href: sectionId ? `${book}/sections/${encodeURIComponent(sectionId)}` : `${book}/edit`,
      action: sectionId ? "Revisar capítulo" : "Preparar manuscrito",
    },
    {
      id: "estilo",
      name: "Estilo",
      description: "Muletillas, conectores, adverbios y construcciones que conviene revisar.",
      href: `${book}/analysis#estilo`,
      action: "Analizar estilo",
    },
    {
      id: "repeticiones",
      name: "Repeticiones",
      description: "Palabras, frases y similitud léxica entre párrafos y capítulos.",
      href: `${book}/analysis#repeticiones`,
      action: "Comparar texto",
    },
    {
      id: "legibilidad",
      name: "Legibilidad",
      description: "Indicadores orientativos del español; no califican la calidad literaria.",
      href: `${book}/analysis#legibilidad`,
      action: "Ver indicadores",
    },
    {
      id: "ritmo",
      name: "Ritmo narrativo",
      description: "Compara extensión de capítulos, párrafos y proporción aproximada de diálogo.",
      href: `${book}/analysis#ritmo`,
      action: "Comparar capítulos",
    },
    {
      id: "personajes",
      name: "Personajes",
      description: "Fichas del autor y propuestas detectadas que requieren revisión.",
      href: `/characters?book=${encodeURIComponent(bookId)}`,
      action: "Abrir personajes",
    },
    {
      id: "inconsistencias",
      name: "Inconsistencias",
      description: "Revisa evidencias explícitas, confirma datos y conserva tus decisiones.",
      href: `${book}/continuity`,
      action: "Revisar continuidad",
    },
    {
      id: "dialogos",
      name: "Diálogos",
      description:
        "Intervenciones, extensión y atribuciones explícitas. Los hablantes ambiguos quedan sin identificar.",
      href: `${narrative}#dialogue-title`,
      action: "Analizar diálogos",
    },
    {
      id: "cronologia",
      name: "Cronología",
      description:
        "Consulta acontecimientos guardados y sus órdenes narrativo y cronológico. Aún sin fechas estructuradas.",
      href: `${narrative}#timeline-title`,
      action: "Ver acontecimientos",
    },
    {
      id: "estructura",
      name: "Estructura narrativa",
      description:
        "Explora modelos opcionales y tu planificación. La elección del modelo aún no guarda etapas.",
      href: `${narrative}#structure-title`,
      action: "Explorar estructura",
    },
  ];
}

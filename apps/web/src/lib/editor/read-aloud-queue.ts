export type ReadAloudMode = "chapter" | "book";
export const MAX_READ_ALOUD_PAYLOAD_BYTES = 10 * 1024 * 1024;

/** Selecciona la sección actual o el tramo restante sin transportar contenido innecesario. */
export function createReadAloudQueue<T extends { id: string }>(
  sections: readonly T[],
  currentSectionId: string,
  mode: ReadAloudMode,
): T[] {
  const currentIndex = sections.findIndex((section) => section.id === currentSectionId);
  if (currentIndex < 0) return [];
  return mode === "chapter" ? [sections[currentIndex]!] : sections.slice(currentIndex);
}

/** Leaves headroom below the native 12 MiB queue limit for JSON serialization. */
export function isReadAloudPayloadWithinLimit(
  bookTitle: string,
  sections: readonly unknown[],
): boolean {
  return (
    new TextEncoder().encode(JSON.stringify({ bookTitle, sections })).byteLength <=
    MAX_READ_ALOUD_PAYLOAD_BYTES
  );
}

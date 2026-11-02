import type { ReadAloudSection } from "@/lib/books/reading-actions";

export type ReadAloudMode = "chapter" | "book";

/** Recorta el manuscrito en memoria a la sección elegida o desde ella hasta el final. */
export function createReadAloudQueue(
  sections: readonly ReadAloudSection[],
  currentSectionId: string,
  mode: ReadAloudMode,
): ReadAloudSection[] {
  const currentIndex = sections.findIndex((section) => section.id === currentSectionId);
  if (currentIndex < 0) return [];
  return mode === "chapter" ? [sections[currentIndex]!] : sections.slice(currentIndex);
}

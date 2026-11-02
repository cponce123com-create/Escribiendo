export type ReadAloudMode = "chapter" | "book";
export const MAX_READ_ALOUD_PAYLOAD_BYTES = 10 * 1024 * 1024;

export interface ReadAloudSectionWithParagraphs<TParagraph extends { text: string }> {
  id: string;
  title: string;
  paragraphs: readonly TParagraph[];
}

export interface NativeReadAloudSection {
  id: string;
  title: string;
  paragraphs: string[];
}

/** Converts reader blocks to the small, explicit queue shape expected by Android TTS. */
export function toNativeReadAloudSections<TParagraph extends { text: string }>(
  sections: readonly ReadAloudSectionWithParagraphs<TParagraph>[],
): NativeReadAloudSection[] {
  return sections.flatMap(({ id, title, paragraphs }) => {
    const speakableParagraphs = paragraphs
      .map(({ text }) => text.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return speakableParagraphs.length > 0 ? [{ id, title, paragraphs: speakableParagraphs }] : [];
  });
}

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

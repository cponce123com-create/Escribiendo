import type { CharacterAppearance, CharacterAppearanceExcerpt } from "./types";
import type { NameCluster } from "./names";
import { excerptFromSentence, type Sentence } from "./text";

function occurrenceSentence(occurrence: NameCluster["occurrences"][number]): Sentence {
  return {
    text: occurrence.sentenceText,
    start: occurrence.sentenceStart,
    end: occurrence.sentenceEnd,
    index: occurrence.sentenceIndex,
  };
}

/**
 * Construye las apariciones navegables por capítulo. Guarda hasta tres citas
 * por sección para que la ficha no se convierta en una lista inmanejable.
 */
export function buildAppearances(cluster: NameCluster): CharacterAppearance[] {
  const bySection = new Map<string, CharacterAppearance>();

  const sorted = [...cluster.occurrences].sort(
    (a, b) => a.sectionOrder - b.sectionOrder || a.start - b.start,
  );

  for (const occurrence of sorted) {
    const existing = bySection.get(occurrence.sectionId);
    const quote = excerptFromSentence(
      occurrenceSentence(occurrence),
      occurrence.start,
      occurrence.end,
      220,
    );
    const excerpt: CharacterAppearanceExcerpt = {
      quote,
      offset: occurrence.start,
      isDialogue: occurrence.isDialogue,
    };

    if (!existing) {
      bySection.set(occurrence.sectionId, {
        sectionId: occurrence.sectionId,
        sectionTitle: occurrence.sectionTitle,
        sectionOrder: occurrence.sectionOrder,
        count: 1,
        dialogueCount: occurrence.isDialogue ? 1 : 0,
        excerpts: [excerpt],
      });
      continue;
    }

    existing.count += 1;
    if (occurrence.isDialogue) existing.dialogueCount += 1;

    const duplicate = existing.excerpts.some(
      (item) => item.quote === excerpt.quote && item.offset === excerpt.offset,
    );
    if (!duplicate && existing.excerpts.length < 3) {
      existing.excerpts.push(excerpt);
    } else if (
      !duplicate &&
      occurrence.isDialogue &&
      !existing.excerpts.some((item) => item.isDialogue)
    ) {
      existing.excerpts[existing.excerpts.length - 1] = excerpt;
    }
  }

  return Array.from(bySection.values()).sort(
    (a, b) => a.sectionOrder - b.sectionOrder || a.sectionTitle.localeCompare(b.sectionTitle),
  );
}

export function countDialogueMentions(cluster: NameCluster): number {
  return cluster.occurrences.filter((occurrence) => occurrence.isDialogue).length;
}

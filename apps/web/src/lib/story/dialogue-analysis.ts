/** Reglas conservadoras: una cita interior no basta para identificar diálogo. */
export function dialogueBlocks(text: string): string[] {
  return text.split(/\n+/u).flatMap((paragraph) => {
    const value = paragraph.replace(/\s+/gu, " ").trim();
    if (/^[—–]\s*\S/u.test(value)) return [value.replace(/^[—–]\s*/u, "")];
    if (
      /^«[^]*»(?:\s*[—–][^]*)?$/u.test(value) ||
      /^“[^]*”(?:\s*[—–][^]*)?$/u.test(value) ||
      /^"[^]*"(?:\s*[—–][^]*)?$/u.test(value)
    )
      return [value];
    return [];
  });
}

const normalize = (name: string) =>
  name.normalize("NFC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("es");

/** No decide entre homónimos y nunca compara prefijos dentro de una palabra. */
export function extractSpeaker(
  text: string,
  characters: readonly { name: string; aliases?: readonly string[] }[],
): { speaker: string | null; confidence: number } {
  const unresolved = { speaker: null, confidence: 0 };
  const attributions = [
    ...text.matchAll(
      /(?:^|[—–.!?»,;:]\s*|\s)(?:dijo|preguntó|respondió|contestó|susurró|gritó|murmuró|replicó)\s+([\p{Lu}][\p{L}'’\-]*(?:\s+[\p{Lu}][\p{L}'’\-]*){0,2})/gu,
    ),
  ];
  if (attributions.length !== 1) return unresolved;
  const candidate = normalize(attributions[0]?.[1] ?? "");
  if (!candidate) return unresolved;
  const matches = characters.filter((character) =>
    [character.name, ...(character.aliases ?? [])].some((label) => {
      const full = normalize(label);
      return (
        full === candidate ||
        (candidate.split(" ").length === 1 && full.split(" ")[0] === candidate)
      );
    }),
  );
  if (matches.length !== 1) return unresolved;
  return { speaker: matches[0]!.name, confidence: 0.86 };
}

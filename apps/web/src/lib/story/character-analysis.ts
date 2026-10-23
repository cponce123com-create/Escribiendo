/** Extracción narrativa local: el manuscrito nunca sale del servidor de la aplicación. */
export interface CharacterEvidence {
  section: string;
  excerpt: string;
  confidence: number;
  kind: "entity" | "alias" | "age" | "physical" | "dialogue";
}
export interface CharacterCandidate {
  name: string;
  mentions: number;
  role: "PROTAGONIST" | "ANTAGONIST" | "SECONDARY" | "OTHER";
  confidence: number;
  evidence: CharacterEvidence[];
  age?: string;
  description?: string;
  aliases: string[];
}
export interface NarrativeSection {
  title: string;
  text: string;
}
type Found = {
  name: string;
  count: number;
  evidence: CharacterEvidence[];
  aliases: Set<string>;
  age?: string;
  desc?: string;
  antagonist: number;
  protagonist: number;
};
const STOP = new Set([
  "El",
  "La",
  "Los",
  "Las",
  "Un",
  "Una",
  "Este",
  "Esta",
  "Ese",
  "Esa",
  "En",
  "Al",
  "Del",
  "Por",
  "Para",
  "Pero",
  "Aunque",
  "Entonces",
  "Luego",
  "Mientras",
  "Cuando",
  "Como",
  "Sin",
  "Con",
  "Sobre",
  "Desde",
  "Hasta",
  "Después",
  "Antes",
  "Capítulo",
  "Prólogo",
  "Epílogo",
  "Parte",
  "Dios",
  "Señor",
  "Señora",
]);
const NAME =
  /\b[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:[-'][A-ZÁÉÍÓÚÜÑ]?[a-záéíóúüñ]+)?(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+){0,2}\b/g;
const normalize = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
function snippet(text: string, start: number, end: number): string {
  return text
    .slice(Math.max(0, start - 105), Math.min(text.length, end + 130))
    .replace(/\s+/g, " ")
    .trim();
}
export function analyzeNarrative(sections: NarrativeSection[]): CharacterCandidate[] {
  const found = new Map<string, Found>();
  for (const section of sections) {
    const text = section.text.slice(0, 1_000_000);
    const pattern = new RegExp(NAME.source, "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const candidate = match[0].trim();
      const first = candidate.split(/\s+/)[0] ?? candidate;
      if (STOP.has(first) || candidate.length < 3) continue;
      const key = normalize(candidate);
      let entry = found.get(key);
      if (!entry) {
        entry = {
          name: candidate,
          count: 0,
          evidence: [],
          aliases: new Set<string>(),
          antagonist: 0,
          protagonist: 0,
        };
        found.set(key, entry);
      }
      entry.count++;
      const excerpt = snippet(text, match.index, match.index + candidate.length);
      const before = text.slice(Math.max(0, match.index - 40), match.index);
      const after = text.slice(match.index + candidate.length, match.index + candidate.length + 5);
      const dialogue =
        /(?:dijo|preguntó|respondió|gritó|susurró|replicó|murmuró|exclamó)\s*[:,]?\s*$/i.test(
          before,
        ) || /^\s*[:,—-]/.test(after);
      if (entry.evidence.length < 4)
        entry.evidence.push({
          section: section.title,
          excerpt,
          confidence: Math.min(
            0.97,
            0.55 + (candidate.includes(" ") ? 0.17 : 0) + (dialogue ? 0.16 : 0),
          ),
          kind: dialogue ? "dialogue" : "entity",
        });
      const age = excerpt.match(/\b(\d{1,3})\s+años\b/i);
      if (age && Number(age[1]) < 125) {
        entry.age = age[1];
        entry.evidence.push({ section: section.title, excerpt, confidence: 0.9, kind: "age" });
      }
      if (
        /\b(?:ojos|cabello|pelo|canas|estatura|complexión|alto|alta|canoso|canosa|pelirrojo|pelirroja|joven|anciano|anciana)\b/i.test(
          excerpt,
        )
      ) {
        entry.desc = excerpt;
        entry.evidence.push({
          section: section.title,
          excerpt,
          confidence: 0.68,
          kind: "physical",
        });
      }
      if (/\b(?:asesinó|mató|odiaba|enemigo|amenazó|antagonista|se enfrentó a)\b/i.test(excerpt))
        entry.antagonist++;
      if (
        /\b(?:protagonista|su objetivo|quería|decidió|punto de vista|la historia de)\b/i.test(
          excerpt,
        )
      )
        entry.protagonist++;
    }
  }
  // Recuenta por separado cada token de un nombre compuesto para no perder formas abreviadas.
  for (const full of [...found.values()].filter((x) => x.name.includes(" "))) {
    for (const part of full.name.split(/\s+/)) {
      if (STOP.has(part)) continue;
      const needle = normalize(part);
      let count = 0;
      for (const section of sections) {
        const words = normalize(section.text.slice(0, 1_000_000)).match(/[\p{L}]+/gu) ?? [];
        count += words.filter((w) => w === needle).length;
      }
      const key = normalize(part);
      if (count >= 1) {
        const short = found.get(key);
        if (!short)
          found.set(key, {
            name: part,
            count,
            evidence: [
              {
                section:
                  sections.find((s) => normalize(s.text).includes(key))?.title ?? "Manuscrito",
                excerpt: `Variante «${part}» detectada cerca de «${full.name}»; confirma manualmente si es la misma persona.`,
                confidence: 0.52,
                kind: "alias",
              },
            ],
            aliases: new Set<string>(),
            antagonist: 0,
            protagonist: 0,
          });
        else if (!short.evidence.some((e) => e.kind === "alias"))
          short.evidence.push({
            section: sections[0]?.title ?? "Manuscrito",
            excerpt: `Posible variante de «${full.name}»; confirma manualmente si es la misma persona.`,
            confidence: 0.52,
            kind: "alias",
          });
      }
      if (count >= 1) full.aliases.add(part);
    }
  }
  return [...found.values()]
    .filter(
      (x) => x.count >= 2 || x.name.includes(" ") || x.evidence.some((e) => e.kind === "alias"),
    )
    .map((x) => ({
      name: x.name,
      mentions: x.count,
      role:
        x.antagonist >= 2
          ? "ANTAGONIST"
          : x.protagonist > 0
            ? "PROTAGONIST"
            : x.count >= 2
              ? "SECONDARY"
              : "OTHER",
      confidence: Math.min(
        0.95,
        0.48 +
          Math.min(x.count, 5) * 0.05 +
          (x.name.includes(" ") ? 0.1 : 0) +
          (x.evidence.some((e) => e.kind === "dialogue") ? 0.1 : 0),
      ),
      evidence: x.evidence.slice(0, 5),
      ...(x.age ? { age: x.age } : {}),
      ...(x.desc ? { description: x.desc } : {}),
      aliases: [...x.aliases],
    }));
}

import type {
  EditorialRule,
  EditorialRuleFinding,
  LinguisticRuleContext,
  LinguisticSentence,
  LinguisticToken,
} from "./types";

export interface SpanishStyleRuleThresholds {
  /** Número de usos idénticos consecutivos desde el que se sugiere revisar el recurso. */
  repeatedConnectorRun: number;
  /** Número de apariciones de una misma muletilla que activa la sugerencia. */
  fillerOccurrences: number;
  /** Máximo de adverbios en -mente por oración antes de sugerir una revisión. */
  adverbsPerSentence: number;
  /** Palabras que debe superar una oración para sugerir revisar su longitud. */
  longSentenceWords: number;
  /** Palabras que debe superar un párrafo para sugerir revisar su longitud. */
  longParagraphWords: number;
  /** Número de construcciones perifrásticas en la sección antes de sugerir moderación. */
  constructionsPerSection: number;
}

export interface SpanishStyleRulesOptions {
  thresholds?: Partial<SpanishStyleRuleThresholds>;
  /** Expresiones exactas que no se deben señalar (por ejemplo, nombres o usos deliberados). */
  allowlist?: readonly string[];
}

const DEFAULT_THRESHOLDS: SpanishStyleRuleThresholds = {
  repeatedConnectorRun: 2,
  fillerOccurrences: 3,
  adverbsPerSentence: 3,
  longSentenceWords: 35,
  longParagraphWords: 120,
  constructionsPerSection: 3,
};

const CONNECTORS = [
  ["sin", "embargo"],
  ["por", "tanto"],
  ["por", "eso"],
  ["aun", "así"],
  ["entonces"],
  ["luego"],
  ["después"],
  ["además"],
  ["pero"],
  ["así"],
] as const;

const FILLERS = [
  ["o", "sea"],
  ["es", "decir"],
  ["la", "verdad", "es", "que"],
  ["en", "realidad"],
  ["por", "así", "decirlo"],
  ["pues"],
  ["bueno"],
  ["digamos"],
  ["total"],
  ["en", "fin"],
] as const;

const REDUNDANCIES = [
  { words: ["subir", "arriba"], suggestion: "subir" },
  { words: ["bajar", "abajo"], suggestion: "bajar" },
  { words: ["entrar", "dentro"], suggestion: "entrar" },
  { words: ["salir", "afuera"], suggestion: "salir" },
  { words: ["volver", "a", "repetir"], suggestion: "repetir" },
  { words: ["volvió", "a", "repetir"], suggestion: "repetir" },
  { words: ["hecho", "real"], suggestion: "hecho" },
  { words: ["planificar", "con", "antelación"], suggestion: "planificar" },
  { words: ["regalo", "gratis"], suggestion: "regalo" },
] as const;

const AMBIGUOUS_EXPRESSIONS = [
  ["su"],
  ["pronto"],
  ["en", "un", "momento"],
  ["más", "tarde"],
] as const;

const VERBOSE_CONSTRUCTIONS = [
  ["llevar", "a", "cabo"],
  ["proceder", "a"],
  ["tener", "la", "posibilidad", "de"],
  ["hacer", "uso", "de"],
  ["dar", "comienzo", "a"],
  ["poner", "en", "marcha"],
] as const;

function validateThresholds(thresholds: SpanishStyleRuleThresholds): SpanishStyleRuleThresholds {
  for (const [key, value] of Object.entries(thresholds)) {
    if (!Number.isInteger(value) || value < 1) {
      throw new RangeError(`El umbral «${key}» debe ser un entero mayor que cero.`);
    }
  }
  return thresholds;
}

function normalize(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("es");
}

function isAllowed(value: string, allowlist: ReadonlySet<string>): boolean {
  return allowlist.has(normalize(value).trim());
}

function finding(
  startOffset: number,
  endOffset: number,
  message: string,
  explanation: string,
  suggestions?: readonly string[],
): EditorialRuleFinding {
  return { startOffset, endOffset, message, explanation, ...(suggestions ? { suggestions } : {}) };
}

function createRule(
  id: string,
  category: "style" | "punctuation",
  severity: "info" | "warning",
  confidence: number,
  analyze: (context: LinguisticRuleContext) => readonly EditorialRuleFinding[],
): EditorialRule {
  return {
    id: `es.style.${id}`,
    version: "1.0.0",
    category,
    severity,
    confidence,
    defaultEnabled: true,
    analyze,
  };
}

function sentenceTokens(
  sentence: LinguisticSentence,
  tokens: readonly LinguisticToken[],
): LinguisticToken[] {
  return tokensInRange(sentence.startOffset, sentence.endOffset, tokens, sentence.index);
}

function tokensInRange(
  startOffset: number,
  endOffset: number,
  tokens: readonly LinguisticToken[],
  sentenceIndex?: number,
): LinguisticToken[] {
  let low = 0;
  let high = tokens.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((tokens[middle]?.startOffset ?? 0) < startOffset) low = middle + 1;
    else high = middle;
  }

  const result: LinguisticToken[] = [];
  for (let index = low; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || token.startOffset >= endOffset) break;
    if (sentenceIndex !== undefined && token.sentenceIndex !== sentenceIndex) continue;
    if (token.endOffset <= endOffset) result.push(token);
  }
  return result;
}

function matchSequences<T extends readonly string[]>(
  tokens: readonly LinguisticToken[],
  sequences: readonly T[],
  allowlist: ReadonlySet<string>,
): Array<{ tokens: LinguisticToken[]; words: readonly string[] }> {
  const matches: Array<{ tokens: LinguisticToken[]; words: readonly string[] }> = [];
  for (const words of sequences) {
    for (let start = 0; start <= tokens.length - words.length; start += 1) {
      const selected = tokens.slice(start, start + words.length);
      if (selected.some((token, index) => token.normalized !== words[index])) continue;
      if (selected.some((token) => token.sentenceIndex !== selected[0]?.sentenceIndex)) continue;
      const matchedText = selected.map((token) => token.text).join(" ");
      if (isAllowed(matchedText, allowlist)) continue;
      matches.push({ tokens: selected, words });
    }
  }
  return matches.sort(
    (left, right) => (left.tokens[0]?.startOffset ?? 0) - (right.tokens[0]?.startOffset ?? 0),
  );
}

function tokenFinding(
  tokens: readonly LinguisticToken[],
  message: string,
  explanation: string,
  suggestions?: readonly string[],
): EditorialRuleFinding | undefined {
  const first = tokens[0];
  const last = tokens.at(-1);
  if (!first || !last) return undefined;
  return finding(first.startOffset, last.endOffset, message, explanation, suggestions);
}

export function createSpanishStyleRules(options: SpanishStyleRulesOptions = {}): EditorialRule[] {
  const thresholds = validateThresholds({ ...DEFAULT_THRESHOLDS, ...options.thresholds });
  const allowlist = new Set((options.allowlist ?? []).map((entry) => normalize(entry).trim()));

  const repeatedConnectors = createRule("repeated-connectors", "style", "info", 0.76, (context) => {
    const findings: EditorialRuleFinding[] = [];
    const eligible = context.sentences.filter((sentence) => sentence.blockType === "paragraph");
    let run: Array<{ sentence: LinguisticSentence; tokens: LinguisticToken[] }> = [];
    let previousParagraph = -1;
    const flush = (): void => {
      if (run.length >= thresholds.repeatedConnectorRun) {
        for (const item of run.slice(1)) {
          const hit = tokenFinding(
            item.tokens,
            "Conector repetido en oraciones próximas; quizá convenga revisar el efecto.",
            "La repetición puede ser un recurso retórico deliberado. Se señala solo como posibilidad de revisión, no como error.",
            ["Valorar si la repetición es intencional o si conviene variar el conector."],
          );
          if (hit) findings.push(hit);
        }
      }
      run = [];
    };

    for (const sentence of eligible) {
      if (sentence.paragraphIndex !== previousParagraph && run.length) flush();
      previousParagraph = sentence.paragraphIndex;
      const tokens = sentenceTokens(sentence, context.tokens);
      const initial = matchSequences(tokens, CONNECTORS, allowlist)[0]?.tokens;
      if (!initial || !tokens.slice(0, initial.length).every((token, i) => token === initial[i])) {
        flush();
        continue;
      }
      const previous = run.at(-1);
      const same =
        previous &&
        previous.tokens.map((token) => token.normalized).join(" ") ===
          initial.map((token) => token.normalized).join(" ");
      if (!same) flush();
      run.push({ sentence, tokens: initial });
    }
    flush();
    return findings;
  });

  const fillers = createRule("frequent-fillers", "style", "info", 0.72, (context) => {
    const matches = matchSequences(context.tokens, FILLERS, allowlist);
    const byPhrase = new Map<string, Array<LinguisticToken[]>>();
    for (const match of matches) {
      const key = match.words.join(" ");
      const list = byPhrase.get(key) ?? [];
      list.push(match.tokens);
      byPhrase.set(key, list);
    }
    const findings: EditorialRuleFinding[] = [];
    for (const [phrase, occurrences] of byPhrase) {
      if (occurrences.length < thresholds.fillerOccurrences) continue;
      for (const occurrence of occurrences.slice(1)) {
        const hit = tokenFinding(
          occurrence,
          `La expresión «${phrase}» se repite con frecuencia; quizá sea una muletilla.`,
          "La repetición puede formar parte de la voz narrativa o del diálogo; conviene comprobar el efecto en contexto.",
          ["Revisar si alguna aparición puede omitirse o variarse."],
        );
        if (hit) findings.push(hit);
      }
    }
    return findings;
  });

  const adverbs = createRule("mente-adverbs", "style", "info", 0.74, (context) => {
    const bySentence = new Map<number, LinguisticToken[]>();
    for (const token of context.tokens) {
      if (!token.normalized.endsWith("mente") || isAllowed(token.text, allowlist)) continue;
      const list = bySentence.get(token.sentenceIndex) ?? [];
      list.push(token);
      bySentence.set(token.sentenceIndex, list);
    }
    const findings: EditorialRuleFinding[] = [];
    for (const [sentenceIndex, words] of bySentence) {
      const sentence = context.sentences.find((item) => item.index === sentenceIndex);
      if (words.length <= thresholds.adverbsPerSentence || sentence?.blockType !== "paragraph")
        continue;
      for (const token of words.slice(thresholds.adverbsPerSentence)) {
        findings.push(
          finding(
            token.startOffset,
            token.endOffset,
            "Varios adverbios en «-mente» en una misma oración; quizá convenga revisar el ritmo.",
            "No es un error gramatical: la acumulación puede ser intencional, aunque a veces vuelve más pesado el ritmo.",
            ["Valorar si la frase funciona mejor con otra construcción."],
          ),
        );
      }
    }
    return findings;
  });

  const longSentences = createRule("long-sentences", "style", "info", 0.7, (context) =>
    context.sentences.flatMap((sentence) => {
      if (sentence.blockType !== "paragraph" || sentence.isDialogue) return [];
      const words = sentenceTokens(sentence, context.tokens);
      if (words.length <= thresholds.longSentenceWords || isAllowed(sentence.text, allowlist))
        return [];
      return [
        finding(
          sentence.startOffset,
          sentence.endOffset,
          `Oración extensa (${words.length} palabras); quizá merezca revisar su ritmo o legibilidad.`,
          "La longitud depende del estilo y del contexto; esta señal no implica que la oración esté mal construida.",
          ["Considerar, si encaja con la voz, dividir o aligerar la oración."],
        ),
      ];
    }),
  );

  const longParagraphs = createRule("long-paragraphs", "style", "info", 0.68, (context) =>
    context.textBlocks.flatMap((block) => {
      if (block.type !== "paragraph" || !block.text.trim() || isAllowed(block.text, allowlist))
        return [];
      const words = tokensInRange(block.startOffset, block.endOffset, context.tokens).length;
      if (words <= thresholds.longParagraphWords) return [];
      return [
        finding(
          block.startOffset,
          block.endOffset,
          `Párrafo extenso (${words} palabras); quizá convenga revisar sus pausas.`,
          "Un párrafo largo puede ser una elección narrativa válida; la sugerencia invita a comprobar el ritmo y la legibilidad.",
          ["Valorar si una pausa o división ayudaría a la lectura."],
        ),
      ];
    }),
  );

  const redundancies = createRule("known-redundancies", "style", "info", 0.78, (context) => {
    const findings: EditorialRuleFinding[] = [];
    for (const match of matchSequences(
      context.tokens,
      REDUNDANCIES.map((item) => item.words),
      allowlist,
    )) {
      const item = REDUNDANCIES.find(
        (candidate) => candidate.words.join(" ") === match.words.join(" "),
      );
      const hit = tokenFinding(
        match.tokens,
        "Posible redundancia léxica; quizá pueda expresarse de forma más concisa.",
        "La expresión puede ser enfática o deliberada; comprueba si ambos elementos aportan un matiz distinto en este contexto.",
        item ? [`Probar «${item.suggestion}» si no se busca énfasis.`] : undefined,
      );
      if (hit) findings.push(hit);
    }
    return findings;
  });

  const ambiguous = createRule("potential-ambiguity", "style", "info", 0.55, (context) => {
    const findings: EditorialRuleFinding[] = [];
    for (const match of matchSequences(context.tokens, AMBIGUOUS_EXPRESSIONS, allowlist)) {
      const phrase = match.tokens.map((token) => token.text).join(" ");
      const hit = tokenFinding(
        match.tokens,
        `«${phrase}» podría admitir más de una interpretación en contexto.`,
        "La expresión no es necesariamente ambigua; revisa si el referente o el momento al que alude queda claro para el lector.",
        [
          "Si la lectura prevista no resulta evidente, considerar precisar el referente o el tiempo.",
        ],
      );
      if (hit) findings.push(hit);
    }
    return findings;
  });

  const constructions = createRule("verbose-constructions", "style", "info", 0.66, (context) => {
    const matches = matchSequences(context.tokens, VERBOSE_CONSTRUCTIONS, allowlist);
    if (matches.length <= thresholds.constructionsPerSection) return [];
    return matches.slice(thresholds.constructionsPerSection).flatMap((match) => {
      const hit = tokenFinding(
        match.tokens,
        "Se repiten construcciones perifrásticas en el texto; quizá convenga revisar su concisión.",
        "Estas construcciones pueden ser naturales o necesarias según el contexto; la señal solo propone valorar alternativas más directas.",
        ["Comprobar si un verbo más directo conserva el matiz buscado."],
      );
      return hit ? [hit] : [];
    });
  });

  const punctuation = createRule("punctuation-patterns", "punctuation", "info", 0.62, (context) => {
    const findings: EditorialRuleFinding[] = [];
    for (const block of context.textBlocks) {
      if (block.type !== "paragraph") continue;
      const pattern = /\s+([,;:.!?])/gu;
      for (const match of block.text.matchAll(pattern)) {
        const start = match.index;
        const end = start + match[0].length;
        const matchedText = match[0];
        if (isAllowed(matchedText, allowlist)) continue;
        findings.push(
          finding(
            block.startOffset + start,
            block.startOffset + end,
            "Puede haber un espacio antes de un signo de puntuación.",
            "En la composición habitual del español no se separa el signo de la palabra anterior; comprueba que el espacio sea intencional.",
            ["Revisar y, si corresponde, retirar el espacio anterior al signo."],
          ),
        );
      }
      const missingSpace = /([\p{L}]),(?=[\p{L}])/gu;
      for (const match of block.text.matchAll(missingSpace)) {
        const commaOffset = match.index + match[0].length - 1;
        findings.push(
          finding(
            block.startOffset + commaOffset,
            block.startOffset + commaOffset + 1,
            "La coma podría necesitar un espacio a continuación.",
            "Una coma seguida directamente por una letra puede ser un problema de espaciado; revisa la puntuación del pasaje.",
            ["Comprobar si corresponde insertar un espacio después de la coma."],
          ),
        );
      }
    }
    return findings;
  });

  return [
    repeatedConnectors,
    fillers,
    adverbs,
    longSentences,
    longParagraphs,
    redundancies,
    ambiguous,
    constructions,
    punctuation,
  ];
}

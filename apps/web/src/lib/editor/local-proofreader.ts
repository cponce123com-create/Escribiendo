import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { tokenizeSpanishText } from "@escribiendo/book-schema";

export interface ProofreadingIssue {
  id: string;
  rule: "repeated-word" | "spacing" | "punctuation" | "capitalization" | "common-typo";
  from: number;
  to: number;
  original: string;
  suggestion: string;
  explanation: string;
}

interface LocalIssue extends Omit<ProofreadingIssue, "from" | "to" | "id"> {
  start: number;
  end: number;
}

const COMMON_TYPOS: ReadonlyArray<{
  pattern: RegExp;
  suggestion: string;
  explanation: string;
}> = [
  {
    pattern: /\bhaber([ \t]+)si\b/giu,
    suggestion: "a ver$1si",
    explanation: "En esta expresión se escribe «a ver» separado.",
  },
  {
    pattern: /\baver\b/giu,
    suggestion: "a ver",
    explanation: "Cuando significa ‘vamos a comprobar’, se escribe «a ver» separado.",
  },
  {
    pattern: /(?<![\p{L}\p{M}])hechar(?=\b|(?:me|te|se|lo|la|los|las|le|les|nos|os)\b)/giu,
    suggestion: "echar",
    explanation: "El verbo «echar» se escribe sin h inicial.",
  },
  {
    pattern: /\bhiba\b/giu,
    suggestion: "iba",
    explanation: "La forma correcta del imperfecto de «ir» es «iba».",
  },
  {
    pattern: /\bhaiga\b/giu,
    suggestion: "haya",
    explanation: "En el uso estándar, la forma es «haya».",
  },
  {
    pattern: /\bhaci\b/giu,
    suggestion: "así",
    explanation: "La forma correcta del adverbio es «así».",
  },
  {
    pattern: /\bconciente\b/giu,
    suggestion: "consciente",
    explanation: "La grafía habitual de este adjetivo es «consciente».",
  },
  {
    pattern: /\bexepción\b/giu,
    suggestion: "excepción",
    explanation: "La palabra se escribe «excepción».",
  },
  {
    pattern: /\bnesesario\b/giu,
    suggestion: "necesario",
    explanation: "La palabra se escribe «necesario».",
  },
  {
    pattern: /\bocacion\b/giu,
    suggestion: "ocasión",
    explanation: "La palabra se escribe «ocasión».",
  },
  { pattern: /\bdespues\b/giu, suggestion: "después", explanation: "«Después» lleva tilde." },
  { pattern: /\btambien\b/giu, suggestion: "también", explanation: "«También» lleva tilde." },
  { pattern: /\bademas\b/giu, suggestion: "además", explanation: "«Además» lleva tilde." },
  { pattern: /\bfacil\b/giu, suggestion: "fácil", explanation: "«Fácil» lleva tilde." },
  { pattern: /\bdificil\b/giu, suggestion: "difícil", explanation: "«Difícil» lleva tilde." },
  { pattern: /\barbol\b/giu, suggestion: "árbol", explanation: "«Árbol» lleva tilde." },
  { pattern: /\blapiz\b/giu, suggestion: "lápiz", explanation: "«Lápiz» lleva tilde." },
  { pattern: /\butil\b/giu, suggestion: "útil", explanation: "«Útil» lleva tilde." },
  { pattern: /\bjovenes\b/giu, suggestion: "jóvenes", explanation: "«Jóvenes» lleva tilde." },
  { pattern: /\bexamenes\b/giu, suggestion: "exámenes", explanation: "«Exámenes» lleva tilde." },
  { pattern: /\bllendo\b/giu, suggestion: "yendo", explanation: "El gerundio de «ir» es «yendo»." },
  {
    pattern: /\bnoce\b/giu,
    suggestion: "no sé",
    explanation: "La expresión del verbo «saber» se escribe «no sé».",
  },
];

const ACCENT_TYPOS: ReadonlyArray<[RegExp, string, string]> = [
  [
    /(?<![\p{L}\p{M}])dió(?![\p{L}\p{M}])/giu,
    "dio",
    "«Dio» no lleva tilde según las reglas actuales de acentuación.",
  ],
  [/(?<![\p{L}\p{M}])fu[eé](?![\p{L}\p{M}])/giu, "fue", "«Fue» se escribe sin tilde."],
  [/(?<![\p{L}\p{M}])v[ií]o(?![\p{L}\p{M}])/giu, "vio", "«Vio» se escribe sin tilde."],
  [/(?<![\p{L}\p{M}])fu[ií](?![\p{L}\p{M}])/giu, "fui", "«Fui» se escribe sin tilde."],
  [/(?<![\p{L}\p{M}])t[ií](?![\p{L}\p{M}])/giu, "ti", "El pronombre «ti» se escribe sin tilde."],
];

function preserveInitialCase(original: string, suggestion: string): string {
  if (!original || original === original.toLowerCase()) return suggestion;
  if (original === original.toUpperCase()) return suggestion.toLocaleUpperCase("es");
  return suggestion.charAt(0).toLocaleUpperCase("es") + suggestion.slice(1);
}

/** Analiza un bloque de texto en memoria y devuelve propuestas locales, nunca edita el documento. */
export function proofreadText(
  text: string,
  enabledRules?: readonly ProofreadingIssue["rule"][],
): ProofreadingIssue[] {
  const found: LocalIssue[] = [];
  const enabled = enabledRules === undefined ? null : new Set(enabledRules);
  const isEnabled = (rule: ProofreadingIssue["rule"]): boolean =>
    enabled === null || enabled.has(rule);
  const add = (
    match: RegExpExecArray,
    rule: LocalIssue["rule"],
    suggestion: string,
    explanation: string,
    group = 0,
  ): void => {
    const original = match[group];
    if (!original || !suggestion || original === suggestion) return;
    const start = match.index + (group === 0 ? 0 : match[0].indexOf(original));
    const suggested = preserveInitialCase(original, suggestion);
    found.push({
      rule,
      start,
      end: start + original.length,
      original,
      suggestion: suggested,
      explanation,
    });
  };

  if (isEnabled("repeated-word")) {
    const tokens = tokenizeSpanishText(text);
    for (let index = 1; index < tokens.length; index += 1) {
      const previous = tokens[index - 1];
      const current = tokens[index];
      if (
        !previous ||
        !current ||
        !/^\p{L}[\p{L}\p{M}]+$/u.test(previous.text) ||
        !/^\p{L}[\p{L}\p{M}]+$/u.test(current.text) ||
        previous.normalized !== current.normalized ||
        !/^[ \t]+$/u.test(text.slice(previous.endOffset, current.startOffset))
      ) {
        continue;
      }
      const repeated = text.slice(previous.startOffset, current.endOffset);
      found.push({
        rule: "repeated-word",
        start: previous.startOffset,
        end: current.endOffset,
        original: repeated,
        suggestion: previous.text,
        explanation: "Parece que esta palabra se repitió por accidente.",
      });
    }
  }

  if (isEnabled("spacing")) {
    for (const match of text.matchAll(/(?<=\S)[ \t]{2,}(?=\S)/gu)) {
      add(match, "spacing", " ", "Hay varios espacios seguidos.");
    }
    for (const match of text.matchAll(/[ \t]+([,;:!?])/gu)) {
      add(
        match,
        "spacing",
        match[1] ?? "",
        "En español no se deja espacio antes del signo de puntuación.",
      );
    }
  }
  if (isEnabled("punctuation")) {
    for (const match of text.matchAll(/([!?])\1+/gu)) {
      add(match, "punctuation", match[1] ?? "", "Revisa si querías repetir este signo.");
    }
  }
  if (isEnabled("capitalization")) {
    for (const match of text.matchAll(/([.!?][”’"')\]]?)([ \t]+)([a-záéíóúüñ])/gu)) {
      const punctuation = match[1] ?? "";
      const letter = match[3] ?? "";
      const before = text.slice(Math.max(0, match.index - 12), match.index).toLocaleLowerCase("es");
      // «P. ej.» y «etc.» suelen ir en minúscula; los títulos como «Sr.» pueden
      // preceder a nombres propios que sí deben comenzar con mayúscula.
      if (punctuation.startsWith(".") && /(?:\b(?:p|ej|etc)\.)\s*$/u.test(before + punctuation))
        continue;
      add(
        match,
        "capitalization",
        letter.toLocaleUpperCase("es"),
        "Después de cerrar una oración, suele escribirse mayúscula.",
        3,
      );
    }
  }

  if (isEnabled("common-typo")) {
    for (const { pattern, suggestion, explanation } of COMMON_TYPOS) {
      for (const match of text.matchAll(pattern)) {
        const replacement = suggestion.replace("$1", match[1] ?? "");
        add(match, "common-typo", replacement, explanation);
      }
    }
    for (const [pattern, suggestion, explanation] of ACCENT_TYPOS) {
      for (const match of text.matchAll(pattern))
        add(match, "common-typo", suggestion, explanation);
    }
  }

  // Las reglas pueden señalar la misma zona. Conservamos la primera propuesta
  // y ordenamos por posición para poder aceptarlas sin sobrescribir texto vecino.
  found.sort((left, right) => left.start - right.start || left.end - right.end);
  const nonOverlapping: LocalIssue[] = [];
  let occupiedUntil = -1;
  for (const issue of found) {
    if (issue.start < occupiedUntil) continue;
    nonOverlapping.push(issue);
    occupiedUntil = issue.end;
  }

  return nonOverlapping.slice(0, 100).map((issue, index) => ({
    id: `${issue.rule}-${issue.start}-${index}`,
    rule: issue.rule,
    from: issue.start,
    to: issue.end,
    original: issue.original,
    suggestion: issue.suggestion,
    explanation: issue.explanation,
  }));
}

/** Recorre solo texto de bloques editables; las posiciones son posiciones ProseMirror. */
export function proofreadDocument(document: ProseMirrorNode): ProofreadingIssue[] {
  const issues: ProofreadingIssue[] = [];
  document.descendants((node, position) => {
    if (!node.isTextblock || issues.length >= 100) return;
    const text = node.textBetween(0, node.content.size, "\n", "\ufffc");
    for (const issue of proofreadText(text)) {
      issues.push({
        ...issue,
        id: `${position + issue.from}-${issue.rule}-${issues.length}`,
        from: position + 1 + issue.from,
        to: position + 1 + issue.to,
      });
    }
    return false;
  });
  return issues;
}

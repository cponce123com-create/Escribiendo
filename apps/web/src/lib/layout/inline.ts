import type { TiptapMark, TiptapNode } from "@escribiendo/book-schema";
import { runsToText, type InlineMarks, type InlineRun } from "@escribiendo/editorial-engine";

/**
 * Lectura del formato en línea de Tiptap.
 *
 * Vive aparte porque la usan dos caminos que no deben divergir: la vista
 * previa paginada y la exportación. Si cada uno interpretara las marcas a su
 * manera, el archivo exportado dejaría de contar lo mismo que la pantalla.
 */

/** Traduce las marcas de Tiptap a las del motor editorial. */
export function marksOf(marks: readonly TiptapMark[] | undefined): InlineMarks | undefined {
  if (!marks || marks.length === 0) {
    return undefined;
  }

  const result: InlineMarks = {};

  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
      case "strong":
        result.bold = true;
        break;
      case "italic":
      case "em":
        result.italic = true;
        break;
      case "underline":
        result.underline = true;
        break;
      case "strike":
      case "strikethrough":
        result.strike = true;
        break;
      case "superscript":
        result.superscript = true;
        break;
      case "subscript":
        result.subscript = true;
        break;
      case "code":
        result.code = true;
        break;
      case "link": {
        const href = mark.attrs?.href;

        if (typeof href === "string" && href.length > 0) {
          result.link = href;
        }

        break;
      }
      default:
        break;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Tramos de un nodo en línea.
 *
 * Los saltos duros se convierten en un espacio: el motor compone por párrafos
 * y no necesita distinguir un salto manual de un espacio.
 */
export function inlineRuns(node: TiptapNode): InlineRun[] {
  if (node.type === "text") {
    const text = node.text ?? "";
    const marks = marksOf(node.marks);

    return text.length > 0 ? [{ text, ...(marks ? { marks } : {}) }] : [];
  }

  if (node.type === "hardBreak") {
    return [{ text: " " }];
  }

  return (node.content ?? []).flatMap(inlineRuns);
}

/** Texto de un nodo, incluidos sus descendientes. */
export function nodeText(node: TiptapNode): string {
  return runsToText(inlineRuns(node));
}

/** Recorta los espacios de los extremos de una lista de tramos. */
export function trimRuns(runs: readonly InlineRun[]): InlineRun[] {
  const result = runs.map((run) => ({ ...run }));

  while (result.length > 0) {
    const first = result[0];

    if (!first) {
      break;
    }

    const trimmed = first.text.replace(/^\s+/u, "");

    if (trimmed.length > 0) {
      first.text = trimmed;
      break;
    }

    result.shift();
  }

  while (result.length > 0) {
    const last = result[result.length - 1];

    if (!last) {
      break;
    }

    const trimmed = last.text.replace(/\s+$/u, "");

    if (trimmed.length > 0) {
      last.text = trimmed;
      break;
    }

    result.pop();
  }

  return result.filter((run) => run.text.length > 0);
}

/** Tramos de una lista: cada elemento en su propia línea. */
export function listRuns(node: TiptapNode): InlineRun[] {
  const runs: InlineRun[] = [];
  let position = 1;

  for (const child of node.content ?? []) {
    if (child.type !== "listItem") {
      continue;
    }

    const itemRuns = trimRuns(inlineRuns(child));

    if (itemRuns.length === 0) {
      continue;
    }

    if (runs.length > 0) {
      runs.push({ text: "\n" });
    }

    if (node.type === "orderedList") {
      runs.push({ text: `${position}. ` });
      position += 1;
    } else {
      runs.push({ text: "· " });
    }

    runs.push(...itemRuns);
  }

  return runs;
}

import { parseTiptapDocument } from "@escribiendo/book-schema";

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => sameJson(value, b[index]))
    );
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every((key) => Object.hasOwn(right, key) && sameJson(left[key], right[key]))
  );
}

/** Un borrador ya persistido no entra en conflicto por conservar una versión antigua. */
export function draftRecoveryDecision(
  draft: { content: string; baseVersion: number },
  serverContent: unknown,
  serverVersion: number,
): "synced" | "recover" | "conflict" | "invalid" {
  try {
    const document = parseTiptapDocument(JSON.parse(draft.content));
    const server = parseTiptapDocument(serverContent);
    if (sameJson(document, server)) return "synced";
    return draft.baseVersion === serverVersion ? "recover" : "conflict";
  } catch {
    return "invalid";
  }
}

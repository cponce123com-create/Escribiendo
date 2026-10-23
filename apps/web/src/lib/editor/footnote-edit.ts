export interface FootnoteEdit {
  id: string;
  pos: number;
  note: string;
}
export const FOOTNOTE_EDIT_EVENT = "editorial-edit-footnote";
export function parseFootnoteEdit(value: unknown): FootnoteEdit | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    !row.id ||
    typeof row.pos !== "number" ||
    !Number.isInteger(row.pos) ||
    row.pos < 0 ||
    typeof row.note !== "string"
  )
    return null;
  return { id: row.id, pos: row.pos, note: row.note };
}

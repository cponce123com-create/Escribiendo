export const COMPACT_EDITOR_QUERY = "(max-width: 767px)";
export type EditorPanel = "chapters" | "inspector";

/** Conserva las claves de escritorio y separa la preferencia de pantallas pequeñas. */
export function editorPanelKey(panel: EditorPanel, compact: boolean): string {
  const base =
    panel === "chapters"
      ? "escribiendo-manuscript-sidebar-collapsed"
      : "escribiendo-inspector-collapsed";
  return compact ? `${base}-mobile` : base;
}

export function editorPanelCollapsed(stored: string | null, compact: boolean): boolean {
  if (stored === "true") return true;
  if (stored === "false") return false;
  return compact;
}

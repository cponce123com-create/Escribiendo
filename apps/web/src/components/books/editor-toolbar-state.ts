export type BlockStyleValue = "paragraph" | "heading1" | "heading2" | "heading3";

export interface BlockStyleState {
  headingLevel: number | null;
}

/** Traduce el nodo bajo el cursor al valor que representa la barra. */
export function blockStyleValue(state: BlockStyleState): BlockStyleValue {
  switch (state.headingLevel) {
    case 1:
      return "heading1";
    case 2:
      return "heading2";
    case 3:
      return "heading3";
    default:
      return "paragraph";
  }
}

/** Detecta macOS y dispositivos iOS para mostrar los atajos de Comando. */
export function isApplePlatform(platform: string): boolean {
  return /Mac|iPhone|iPad|iPod/iu.test(platform);
}

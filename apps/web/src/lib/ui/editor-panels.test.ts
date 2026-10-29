import { expect, it } from "vitest";
import { editorPanelKey, editorPanelCollapsed } from "./editor-panels";
it("abre los paneles de escritorio y prioriza el texto en móvil", () => {
  expect(editorPanelCollapsed(null, false)).toBe(false);
  expect(editorPanelCollapsed(null, true)).toBe(true);
  expect(editorPanelCollapsed("valor corrupto", true)).toBe(true);
});
it("respeta la elección explícita en cada tamaño", () => {
  expect(editorPanelCollapsed("false", true)).toBe(false);
  expect(editorPanelCollapsed("true", false)).toBe(true);
});
it("no cambia las preferencias antiguas de escritorio al usar móvil", () => {
  expect(editorPanelKey("chapters", false)).toBe("escribiendo-manuscript-sidebar-collapsed");
  expect(editorPanelKey("inspector", false)).toBe("escribiendo-inspector-collapsed");
  for (const panel of ["chapters", "inspector"] as const)
    expect(editorPanelKey(panel, true)).not.toBe(editorPanelKey(panel, false));
});

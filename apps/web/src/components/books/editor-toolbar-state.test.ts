import { describe, expect, it } from "vitest";
import { blockStyleValue, isApplePlatform } from "./editor-toolbar-state";

describe("estado de la barra del editor", () => {
  it("representa párrafos y títulos del cursor, incluido H1 heredado", () => {
    expect(blockStyleValue({ headingLevel: null })).toBe("paragraph");
    expect(blockStyleValue({ headingLevel: 1 })).toBe("heading1");
    expect(blockStyleValue({ headingLevel: 2 })).toBe("heading2");
    expect(blockStyleValue({ headingLevel: 3 })).toBe("heading3");
    expect(blockStyleValue({ headingLevel: 4 })).toBe("paragraph");
  });

  it("usa el modificador de Comando en macOS y dispositivos Apple", () => {
    expect(isApplePlatform("MacIntel")).toBe(true);
    expect(isApplePlatform("iPhone")).toBe(true);
    expect(isApplePlatform("Win32")).toBe(false);
  });
});

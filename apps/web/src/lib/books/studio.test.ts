import { describe, expect, it } from "vitest";
import { groupSections, readingMinutes, sectionGroup, textMatches } from "./studio";
import type { SectionNode } from "./section-tree";

function node(id: string, type: string, children: SectionNode[] = []): SectionNode {
  return { id, type, children, parentId: null, title: id, sortOrder: 0, wordCount: 0, version: 1 };
}

describe("Estudio editorial", () => {
  it("agrupa por tipo sin perder secciones personalizadas ni hijos", () => {
    const child = node("sub", "SUBCHAPTER");
    const groups = groupSections([
      node("copyright", "COPYRIGHT"),
      node("uno", "CHAPTER", [child]),
      node("dos", "CHAPTER"),
      node("custom", "CUSTOM"),
      node("autor", "ABOUT_AUTHOR"),
    ]);
    expect(groups.map((group) => group.nodes.map((item) => item.id))).toEqual([
      ["copyright"],
      ["uno", "dos", "custom"],
      ["autor"],
    ]);
    expect(groups[1]?.nodes[0]?.children).toEqual([child]);
  });
  it("sitúa los preliminares y anexos en su grupo editorial", () => {
    expect(sectionGroup("DEDICATION")).toBe("Preliminares");
    expect(sectionGroup("PROLOGUE")).toBe("Preliminares");
    expect(sectionGroup("APPENDIX")).toBe("Páginas finales");
    expect(sectionGroup("EPILOGUE")).toBe("Cuerpo de la obra");
  });
  it("no inventa tiempo de lectura para un texto vacío", () => {
    expect(readingMinutes(0)).toBe(0);
    expect(readingMinutes(1697)).toBe(8);
    expect(readingMinutes(220)).toBe(1);
  });
  it("encuentra coincidencias literales sin distinguir mayúsculas", () => {
    expect(textMatches("Andrés mira a ANDRÉS.", "andrés")).toEqual([
      { from: 0, to: 6 },
      { from: 14, to: 20 },
    ]);
    expect(textMatches("¿a+b? a+b", "a+b")).toEqual([
      { from: 1, to: 4 },
      { from: 6, to: 9 },
    ]);
  });
  it("no busca cadenas vacías y respeta acentos y posiciones UTF-16", () => {
    expect(textMatches("algo", " ")).toEqual([]);
    expect(textMatches("Andrés", "Andres")).toEqual([]);
    expect(textMatches("📖 libro", "libro")).toEqual([{ from: 3, to: 8 }]);
  });
});

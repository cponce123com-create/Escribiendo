import { describe, expect, it } from "vitest";
import {
  detectEntityMentions,
  flexibleTerm,
  type MentionEntity,
  type MentionSection,
} from "./entity-mentions";

function section(id: string, title: string, order: number, text: string): MentionSection {
  return { id, title, order, text };
}

const ANA: MentionEntity = { id: "c1", name: "Ana Salazar", kind: "CHARACTER" };
const ALVARO: MentionEntity = { id: "c2", name: "Álvaro Ruiz", kind: "CHARACTER" };
const CIUDAD: MentionEntity = { id: "w1", name: "Arequipa", kind: "WORLD" };

describe("flexibleTerm", () => {
  it("tolera tildes y mayúsculas", () => {
    const pattern = new RegExp(flexibleTerm("Álvaro"), "iu");

    expect(pattern.test("alvaro")).toBe(true);
    expect(pattern.test("ÁLVARO")).toBe(true);
  });

  it("escapa los caracteres especiales de una expresión regular", () => {
    const pattern = new RegExp(`^${flexibleTerm("A.B")}$`, "u");

    expect(pattern.test("A.B")).toBe(true);
    expect(pattern.test("AXB")).toBe(false);
  });
});

describe("detectEntityMentions", () => {
  it("encuentra el nombre con y sin tilde", () => {
    const proposals = detectEntityMentions(
      [ALVARO],
      [
        section("s1", "Uno", 1, "Alvaro Ruiz llegó tarde."),
        section("s2", "Dos", 2, "Álvaro Ruiz no dijo nada."),
      ],
    );

    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.total).toBe(2);
    expect(proposals[0]?.sections.map((hit) => hit.sectionId)).toEqual(["s1", "s2"]);
  });

  it("no cuenta coincidencias dentro de otra palabra", () => {
    const proposals = detectEntityMentions(
      [ANA],
      [section("s1", "Uno", 1, "Anabel llegó con Ana Salazar.")],
    );

    expect(proposals[0]?.total).toBe(1);
  });

  it("ignora nombres demasiado cortos", () => {
    const proposals = detectEntityMentions(
      [{ id: "x", name: "Al", kind: "CHARACTER" }],
      [section("s1", "Uno", 1, "Al llegó.")],
    );

    expect(proposals).toEqual([]);
  });

  it("cuenta los alias sin duplicar el nombre completo", () => {
    const proposals = detectEntityMentions(
      [{ ...ALVARO, aliases: ["Álvaro"] }],
      [section("s1", "Uno", 1, "Álvaro Ruiz y Álvaro caminaron juntos.")],
    );

    expect(proposals[0]?.total).toBe(2);
    expect(proposals[0]?.matchedNames).toContain("Álvaro Ruiz");
    expect(proposals[0]?.matchedNames).toContain("Álvaro");
  });

  it("no suma dos veces el mismo tramo cuando un nombre contiene a otro", () => {
    const proposals = detectEntityMentions(
      [{ ...ANA, aliases: ["Ana"] }],
      [section("s1", "Uno", 1, "Ana Salazar llegó sola.")],
    );

    expect(proposals[0]?.total).toBe(1);
    expect(proposals[0]?.matchedNames).toEqual(["Ana Salazar"]);
  });

  it("respeta el orden de las secciones y recoge el contexto", () => {
    const proposals = detectEntityMentions(
      [CIUDAD],
      [
        section("s2", "Dos", 2, "Volvió a Arequipa al amanecer."),
        section("s1", "Uno", 1, "Nunca había salido de Arequipa antes."),
      ],
    );

    expect(proposals[0]?.sections.map((hit) => hit.sectionTitle)).toEqual(["Uno", "Dos"]);
    expect(proposals[0]?.sections[0]?.excerpt).toContain("Nunca había salido de Arequipa");
  });

  it("ignora secciones vacías y entidades sin menciones", () => {
    const proposals = detectEntityMentions(
      [ANA, CIUDAD],
      [section("s1", "Uno", 1, "   "), section("s2", "Dos", 2, "Ana Salazar entró.")],
    );

    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.entityId).toBe(ANA.id);
  });

  it("ordena las propuestas por número de menciones y conserva el tipo", () => {
    const proposals = detectEntityMentions(
      [CIUDAD, ANA],
      [
        section(
          "s1",
          "Uno",
          1,
          "Ana Salazar salió de Arequipa. Ana Salazar volvió a Arequipa con Ana Salazar.",
        ),
      ],
    );

    expect(proposals.map((proposal) => proposal.entityId)).toEqual([ANA.id, CIUDAD.id]);
    expect(proposals[0]?.kind).toBe("CHARACTER");
    expect(proposals[1]?.kind).toBe("WORLD");
    expect(proposals[0]?.total).toBe(3);
    expect(proposals[1]?.total).toBe(2);
  });

  it("devuelve una lista vacía sin entidades o sin secciones", () => {
    expect(detectEntityMentions([], [section("s1", "Uno", 1, "Texto.")])).toEqual([]);
    expect(detectEntityMentions([ANA], [])).toEqual([]);
  });
});

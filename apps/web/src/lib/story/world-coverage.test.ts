import { describe, expect, it } from "vitest";
import type { MentionEntity, MentionSection } from "./entity-mentions";
import { buildWorldCoverage } from "./world-coverage";

function world(id: string, name: string, aliases: string[] = []): MentionEntity {
  return { id, name, aliases, kind: "WORLD" };
}

function section(id: string, order: number, text: string): MentionSection {
  return { id, title: `Sección ${order}`, order, text };
}

describe("buildWorldCoverage", () => {
  it("detecta un mundo por su alias y separa los que no aparecen", () => {
    const report = buildWorldCoverage(
      [world("w1", "La ciudad sumergida", ["la Sumergida"]), world("w2", "El faro del norte")],
      [
        section("s1", 1, "La Sumergida despertó con la marea."),
        section("s2", 2, "Nadie recordaba el nombre verdadero."),
        section("s3", 3, "Volvieron a la sumergida al amanecer."),
      ],
    );

    expect(report.covered).toHaveLength(1);
    expect(report.covered[0]?.name).toBe("La ciudad sumergida");
    expect(report.covered[0]?.total).toBe(2);
    expect(report.covered[0]?.sections).toHaveLength(2);
    expect(report.missing.map((entry) => entry.name)).toEqual(["El faro del norte"]);
  });

  it("señala la ausencia de tres secciones o más", () => {
    const report = buildWorldCoverage(
      [world("w1", "La ciudad sumergida", ["la Sumergida"])],
      [
        section("s1", 1, "La Sumergida despertó."),
        section("s2", 2, "El mercado estaba vacío."),
        section("s3", 3, "Llovió durante tres días."),
        section("s4", 4, "El consejo no se reunió."),
        section("s5", 5, "Regresaron a la Sumergida."),
      ],
    );

    const [covered] = report.covered;

    expect(covered?.alerts).toHaveLength(1);
    expect(covered?.alerts[0]?.kind).toBe("ABSENCE");
    expect(covered?.alerts[0]?.message).toContain("La ciudad sumergida");
    expect(covered?.timeline.gaps[0]?.missing).toBe(3);
  });

  it("ordena por menciones y, a igualdad, por nombre", () => {
    const report = buildWorldCoverage(
      [world("w1", "El faro"), world("w2", "La ciudad"), world("w3", "El bosque")],
      [
        section("s1", 1, "La ciudad y el bosque. La ciudad otra vez."),
        section("s2", 2, "El bosque seguía allí. La ciudad ardía."),
      ],
    );

    expect(report.covered.map((entry) => entry.name)).toEqual(["La ciudad", "El bosque"]);
    expect(report.missing.map((entry) => entry.name)).toEqual(["El faro"]);
  });

  it("no cuenta las secciones sin texto", () => {
    const report = buildWorldCoverage(
      [world("w1", "La ciudad")],
      [section("s1", 1, "La ciudad."), section("s2", 2, "   ")],
    );

    expect(report.sections).toBe(1);
  });

  it("devuelve un informe vacío sin mundos ni secciones", () => {
    const report = buildWorldCoverage([], []);

    expect(report).toEqual({ covered: [], missing: [], sections: 0 });
  });
});

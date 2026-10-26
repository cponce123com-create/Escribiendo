import { describe, expect, it } from "vitest";
import {
  buildAppearanceTimeline,
  detectAppearanceAlerts,
  type TimelineSection,
} from "./appearance-timeline";

const SECCIONES: TimelineSection[] = [
  { id: "s1", title: "El regreso", order: 1 },
  { id: "s2", title: "La casa vacía", order: 2 },
  { id: "s3", title: "Cartas", order: 3 },
  { id: "s4", title: "El hospital", order: 4 },
  { id: "s5", title: "Después", order: 5 },
  { id: "s6", title: "Epílogo", order: 6 },
];

describe("buildAppearanceTimeline", () => {
  it("ordena las secciones y coloca las apariciones por índice", () => {
    const timeline = buildAppearanceTimeline(SECCIONES, [
      { sectionId: "s3", count: 4 },
      { sectionId: "s1", count: 2 },
    ]);

    expect(timeline.points.map((point) => point.index)).toEqual([0, 2]);
    expect(timeline.points[0]?.count).toBe(2);
    expect(timeline.points[1]?.count).toBe(4);
    expect(timeline.coverage).toBeCloseTo(2 / 6);
  });

  it("marca un hueco interno cuando supera el umbral", () => {
    const timeline = buildAppearanceTimeline(
      SECCIONES,
      [{ sectionId: "s1" }, { sectionId: "s5" }],
      { gapThreshold: 3 },
    );

    expect(timeline.gaps).toHaveLength(1);
    expect(timeline.gaps[0]).toMatchObject({
      afterIndex: 0,
      beforeIndex: 4,
      missing: 3,
      fromTitle: "El regreso",
      toTitle: "Después",
    });
  });

  it("no marca huecos por debajo del umbral", () => {
    const timeline = buildAppearanceTimeline(
      SECCIONES,
      [{ sectionId: "s1" }, { sectionId: "s4" }],
      { gapThreshold: 3 },
    );

    expect(timeline.gaps).toEqual([]);
  });

  it("detecta la ausencia final", () => {
    const timeline = buildAppearanceTimeline(
      SECCIONES,
      [{ sectionId: "s1" }, { sectionId: "s2" }],
      { gapThreshold: 3 },
    );

    expect(timeline.trailing).toEqual({ lastIndex: 1, missing: 4 });
  });

  it("ignora apariciones de secciones ajenas al libro", () => {
    const timeline = buildAppearanceTimeline(SECCIONES, [
      { sectionId: "otra" },
      { sectionId: "s2" },
    ]);

    expect(timeline.points).toHaveLength(1);
    expect(timeline.points[0]?.sectionId).toBe("s2");
  });

  it("no duplica secciones ni apariciones repetidas", () => {
    const timeline = buildAppearanceTimeline(
      [...SECCIONES, SECCIONES[0]!],
      [{ sectionId: "s1" }, { sectionId: "s1", count: 3 }],
    );

    expect(timeline.sections).toHaveLength(6);
    expect(timeline.points).toHaveLength(1);
    expect(timeline.points[0]?.count).toBe(4);
  });

  it("devuelve un arco vacío sin secciones", () => {
    const timeline = buildAppearanceTimeline([], [{ sectionId: "s1" }]);

    expect(timeline.sections).toEqual([]);
    expect(timeline.points).toEqual([]);
    expect(timeline.gaps).toEqual([]);
    expect(timeline.trailing).toBeNull();
    expect(timeline.coverage).toBe(0);
  });
});

describe("detectAppearanceAlerts", () => {
  it("describe el hueco con títulos y número de secciones", () => {
    const timeline = buildAppearanceTimeline(
      SECCIONES,
      [{ sectionId: "s1" }, { sectionId: "s5" }],
      { gapThreshold: 3 },
    );
    const alerts = detectAppearanceAlerts("Marta", timeline);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.kind).toBe("ABSENCE");
    expect(alerts[0]?.message).toContain("Marta no aparece entre «El regreso» y «Después»");
    expect(alerts[0]?.message).toContain("3 secciones");
    expect(alerts[0]?.severity).toBe("INFO");
  });

  it("avisa de la desaparición final sin afirmar que sea un error", () => {
    const timeline = buildAppearanceTimeline(
      SECCIONES,
      [{ sectionId: "s1" }, { sectionId: "s2" }],
      { gapThreshold: 3 },
    );
    const alerts = detectAppearanceAlerts("Marta", timeline);
    const disappears = alerts.find((alert) => alert.kind === "DISAPPEARS");

    expect(disappears).toBeDefined();
    expect(disappears?.message).toContain("deja de aparecer tras «La casa vacía»");
    expect(disappears?.evidence).toContain("Puede ser el final de su arco");
  });

  it("no alerta con una sola aparición", () => {
    const timeline = buildAppearanceTimeline(SECCIONES, [{ sectionId: "s1" }]);

    expect(detectAppearanceAlerts("Marta", timeline)).toEqual([]);
  });

  it("respeta el umbral recibido", () => {
    const timeline = buildAppearanceTimeline(SECCIONES, [
      { sectionId: "s1" },
      { sectionId: "s4" },
      { sectionId: "s6" },
    ]);
    const estricto = detectAppearanceAlerts("Marta", timeline, { gapThreshold: 2 });
    const amplio = detectAppearanceAlerts("Marta", timeline, { gapThreshold: 5 });

    expect(estricto.some((alert) => alert.kind === "ABSENCE")).toBe(true);
    expect(amplio).toEqual([]);
  });
});

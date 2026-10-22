import { describe, expect, it } from "vitest";
import {
  parseSectionScrollPosition,
  pickSectionScrollPosition,
  serializeSectionScrollPosition,
} from "./scroll-position";

const NOW = 1_750_000_000_000;

describe("posición de lectura de una sección", () => {
  it("guarda y recupera una posición redondeada", () => {
    const raw = serializeSectionScrollPosition(480.6, NOW);

    expect(parseSectionScrollPosition(raw, NOW + 1_000)).toBe(481);
  });

  it("descarta una posición caducada", () => {
    const raw = serializeSectionScrollPosition(480, NOW);

    expect(parseSectionScrollPosition(raw, NOW + 2_000, 1_000)).toBeNull();
  });

  it("descarta el borde superior: no hay nada que restaurar", () => {
    const raw = serializeSectionScrollPosition(0, NOW);

    expect(parseSectionScrollPosition(raw, NOW)).toBeNull();
  });

  it("descarta datos incompletos o dañados", () => {
    expect(parseSectionScrollPosition(null, NOW)).toBeNull();
    expect(parseSectionScrollPosition("", NOW)).toBeNull();
    expect(parseSectionScrollPosition("no es json", NOW)).toBeNull();
    expect(parseSectionScrollPosition('{"top":"480","savedAt":1}', NOW)).toBeNull();
    expect(parseSectionScrollPosition('{"top":480}', NOW)).toBeNull();
    expect(parseSectionScrollPosition('{"top":-1,"savedAt":1}', NOW)).toBeNull();
  });

  it("descarta una marca de tiempo futura", () => {
    const raw = serializeSectionScrollPosition(480, NOW + 120_000);

    expect(parseSectionScrollPosition(raw, NOW)).toBeNull();
  });

  it("conserva el punto mas avanzado al subir para volver al libro", () => {
    expect(pickSectionScrollPosition(0, 640)).toBe(640);
    expect(pickSectionScrollPosition(320, 640)).toBe(640);
    expect(pickSectionScrollPosition(900, 640)).toBe(900);
  });

  it("empieza a recordar desde la primera posicion valida", () => {
    expect(pickSectionScrollPosition(0, null)).toBeNull();
    expect(pickSectionScrollPosition(120, null)).toBe(120);
  });
});

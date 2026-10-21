import { describe, expect, it } from "vitest";
import { EXPORT_JOB_TIMEOUT_MINUTES, trabajoInterrumpido } from "./job-estado";

const AHORA = new Date("2026-10-21T12:00:00.000Z");

describe("trabajoInterrumpido", () => {
  it("no dice nada de un trabajo que no está en proceso", () => {
    expect(
      trabajoInterrumpido(
        { status: "PENDING", startedAt: new Date("2026-10-21T10:00:00.000Z") },
        AHORA,
      ),
    ).toBe(false);

    expect(
      trabajoInterrumpido(
        { status: "COMPLETED", startedAt: new Date("2026-10-21T10:00:00.000Z") },
        AHORA,
      ),
    ).toBe(false);
  });

  it("no dice nada de un trabajo que no empezó a tiempo", () => {
    expect(trabajoInterrumpido({ status: "PROCESSING", startedAt: null }, AHORA)).toBe(false);
  });

  it("detecta un trabajo que lleva demasiado tiempo en proceso", () => {
    const hace = (minutos: number): Date => new Date(AHORA.getTime() - minutos * 60 * 1_000);

    expect(trabajoInterrumpido({ status: "PROCESSING", startedAt: hace(1) }, AHORA)).toBe(false);
    expect(
      trabajoInterrumpido(
        { status: "PROCESSING", startedAt: hace(EXPORT_JOB_TIMEOUT_MINUTES) },
        AHORA,
      ),
    ).toBe(false);
    expect(
      trabajoInterrumpido(
        { status: "PROCESSING", startedAt: hace(EXPORT_JOB_TIMEOUT_MINUTES + 1) },
        AHORA,
      ),
    ).toBe(true);
  });
});

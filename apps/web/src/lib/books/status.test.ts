import { describe, expect, it } from "vitest";
import type { BookStatus } from "@escribiendo/database";
import { availableTransitions, canTransitionTo } from "./status";

const ALL_STATUSES: BookStatus[] = ["DRAFT", "IN_PROGRESS", "REVIEW", "COMPLETE", "ARCHIVED"];

describe("canTransitionTo", () => {
  it("permite mantener el mismo estado", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransitionTo(status, status)).toBe(true);
    }
  });

  it("exige pasar por la revisión antes de completar", () => {
    expect(canTransitionTo("DRAFT", "COMPLETE")).toBe(false);
    expect(canTransitionTo("IN_PROGRESS", "COMPLETE")).toBe(false);
    expect(canTransitionTo("REVIEW", "COMPLETE")).toBe(true);
  });

  it("no permite reabrir un libro archivado directamente", () => {
    expect(canTransitionTo("ARCHIVED", "IN_PROGRESS")).toBe(false);
    expect(canTransitionTo("ARCHIVED", "DRAFT")).toBe(true);
  });

  it("permite devolver a borrador lo que está en revisión", () => {
    expect(canTransitionTo("REVIEW", "IN_PROGRESS")).toBe(true);
    expect(canTransitionTo("REVIEW", "DRAFT")).toBe(false);
  });

  it("permite archivar desde cualquier estado activo", () => {
    expect(canTransitionTo("DRAFT", "ARCHIVED")).toBe(true);
    expect(canTransitionTo("IN_PROGRESS", "ARCHIVED")).toBe(true);
    expect(canTransitionTo("REVIEW", "ARCHIVED")).toBe(true);
    expect(canTransitionTo("COMPLETE", "ARCHIVED")).toBe(true);
  });
});

describe("availableTransitions", () => {
  it("devuelve una lista no vacía para cada estado", () => {
    for (const status of ALL_STATUSES) {
      expect(availableTransitions(status).length).toBeGreaterThan(0);
    }
  });

  it("nunca incluye el propio estado como cambio", () => {
    for (const status of ALL_STATUSES) {
      expect(availableTransitions(status)).not.toContain(status);
    }
  });
});

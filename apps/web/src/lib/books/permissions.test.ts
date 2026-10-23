import { describe, expect, it } from "vitest";
import type { WorkspaceRole } from "@escribiendo/database";
import { ACCIONES, assertCanPerform, canPerform, type LibraryAction } from "./permissions";

const ROLES: WorkspaceRole[] = ["OWNER", "ADMIN", "EDITOR", "AUTHOR", "REVIEWER"];

describe("canPerform", () => {
  it("permite crear y editar a quienes escriben", () => {
    const writeActions: LibraryAction[] = [
      "book:create",
      "book:update",
      "book:changeStatus",
      "book:submitForReview",
      "section:create",
      "section:update",
      "section:move",
      "story:manage",
    ];

    for (const role of ["OWNER", "ADMIN", "EDITOR", "AUTHOR"] as WorkspaceRole[]) {
      for (const action of writeActions) {
        expect(canPerform(role, action)).toBe(true);
      }
    }
  });

  it("no permite escribir a quien solo lee", () => {
    for (const action of [
      "book:create",
      "book:update",
      "book:changeStatus",
      "book:submitForReview",
      "section:create",
      "section:update",
      "section:move",
      "story:manage",
    ] as LibraryAction[]) {
      expect(canPerform("REVIEWER", action)).toBe(false);
    }
  });

  it("reserva el borrado a la administración del estudio", () => {
    expect(canPerform("OWNER", "book:delete")).toBe(true);
    expect(canPerform("ADMIN", "book:delete")).toBe(true);
    expect(canPerform("EDITOR", "book:delete")).toBe(false);
    expect(canPerform("AUTHOR", "book:delete")).toBe(false);
    expect(canPerform("REVIEWER", "book:delete")).toBe(false);

    expect(canPerform("OWNER", "section:delete")).toBe(true);
    expect(canPerform("EDITOR", "section:delete")).toBe(false);
  });

  it("permite restaurar revisiones a la edición pero no a la autoría", () => {
    expect(canPerform("OWNER", "revision:restore")).toBe(true);
    expect(canPerform("ADMIN", "revision:restore")).toBe(true);
    expect(canPerform("EDITOR", "revision:restore")).toBe(true);
    expect(canPerform("AUTHOR", "revision:restore")).toBe(false);
    expect(canPerform("REVIEWER", "revision:restore")).toBe(false);
  });

  it("es exhaustivo: ningún rol queda sin decidir", () => {
    const actions: LibraryAction[] = [...ACCIONES];

    for (const role of ROLES) {
      for (const action of actions) {
        expect(canPerform(role, action)).toBeTypeOf("boolean");
      }
    }

    // Y la lista no se queda atrás: todas las acciones del tipo están aquí.
    expect(actions.sort()).toEqual([...ACCIONES].sort());
  });

  it("solo quien administra el equipo puede gestionarlo", () => {
    expect(canPerform("OWNER", "team:manage")).toBe(true);
    expect(canPerform("ADMIN", "team:manage")).toBe(true);
    expect(canPerform("EDITOR", "team:manage")).toBe(false);
    expect(canPerform("AUTHOR", "team:manage")).toBe(false);
    expect(canPerform("REVIEWER", "team:manage")).toBe(false);
  });

  it("solo quien administra el equipo puede exportar la auditoría", () => {
    expect(canPerform("OWNER", "audit:export")).toBe(true);
    expect(canPerform("ADMIN", "audit:export")).toBe(true);
    expect(canPerform("EDITOR", "audit:export")).toBe(false);
    expect(canPerform("AUTHOR", "audit:export")).toBe(false);
    expect(canPerform("REVIEWER", "audit:export")).toBe(false);
  });

  it("quien solo revisa no puede escribir ni exportar", () => {
    expect(canPerform("REVIEWER", "section:update")).toBe(false);
    expect(canPerform("REVIEWER", "export:create")).toBe(false);
    expect(canPerform("REVIEWER", "comment:create")).toBe(true);
  });
});

describe("assertCanPerform", () => {
  it("no lanza cuando la acción está permitida", () => {
    expect(() => assertCanPerform("OWNER", "book:delete")).not.toThrow();
  });

  it("lanza un errorForbidden cuando no está permitida", () => {
    expect(() => assertCanPerform("REVIEWER", "book:delete")).toThrow(/permisos/u);
  });
});

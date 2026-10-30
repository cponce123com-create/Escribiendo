import { beforeEach, describe, expect, it, vi } from "vitest";

const { loggerError } = vi.hoisted(() => ({ loggerError: vi.fn() }));

vi.mock("@/lib/logger", () => ({ logger: { error: loggerError } }));

import { logActionError } from "./action-logging";

describe("logActionError", () => {
  beforeEach(() => loggerError.mockClear());

  it("registra la solicitud y el tipo sin exponer el mensaje del error", () => {
    const context = { requestId: "req-123" } as Parameters<typeof logActionError>[1];

    logActionError("books.save_error", context, new Error("contenido privado"));

    expect(loggerError).toHaveBeenCalledWith("books.save_error", {
      requestId: "req-123",
      errorName: "Error",
    });
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain("contenido privado");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ attempts: 0, lockedUntil: null as Date | null, locks: 0 }));
const database = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: database.transaction } }));
import { registerFailedLogin, successfulLoginData } from "./login-lockout";
let tail = Promise.resolve();
beforeEach(() => {
  Object.assign(state, { attempts: 0, lockedUntil: null, locks: 0 });
  tail = Promise.resolve();
  // Emula la exclusión por fila que exige SELECT FOR UPDATE en PostgreSQL.
  database.transaction.mockImplementation((callback) => {
    const result = tail.then(() =>
      callback({
        $queryRaw: vi.fn(async (query: TemplateStringsArray) => {
          expect(query.join("")).toContain('FROM "users"');
          return [{ lockedUntil: state.lockedUntil }];
        }),
        user: {
          update: vi.fn(async ({ data }) => {
            if (typeof data.failedLoginAttempts === "number")
              state.attempts = data.failedLoginAttempts;
            else if (data.failedLoginAttempts?.increment)
              state.attempts += data.failedLoginAttempts.increment;
            if ("lockedUntil" in data) {
              state.lockedUntil = data.lockedUntil;
              if (data.lockedUntil) state.locks++;
            }
            return { failedLoginAttempts: state.attempts };
          }),
        },
      }),
    );
    tail = result.then(() => undefined);
    return result;
  });
});
describe("bloqueo de acceso", () => {
  const now = new Date("2026-01-01Z");
  it("cinco fallos paralelos generan un único bloqueo", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => registerFailedLogin("id", now)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(state.locks).toBe(1);
    expect(state.attempts).toBe(5);
  });
  it("no amplía un bloqueo activo", async () => {
    state.lockedUntil = new Date(now.getTime() + 60_000);
    state.attempts = 5;
    expect(await registerFailedLogin("id", now)).toBe(false);
    expect(state.lockedUntil.getTime()).toBe(now.getTime() + 60_000);
    expect(state.attempts).toBe(5);
  });
  it("tras expirar empieza de nuevo y un fallo no rebloquea", async () => {
    state.lockedUntil = new Date(now.getTime() - 1);
    state.attempts = 5;
    expect(await registerFailedLogin("id", now)).toBe(false);
    expect(state.attempts).toBe(1);
    expect(state.lockedUntil).toBeNull();
  });
  it("el acceso correcto reinicia contador y bloqueo", () => {
    expect(successfulLoginData(now)).toEqual({
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: now,
    });
  });
});

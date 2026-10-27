import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const warn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({ logger: { warn } }));
import { warnIfMultipleProcesses, consumeRateLimit, resetRateLimitsForTests } from "./rate-limit";
beforeEach(() => {
  warn.mockClear();
  resetRateLimitsForTests();
});
it("advierte si hay varios procesos y el límite sigue en memoria", () => {
  warnIfMultipleProcesses("2");
  expect(warn).toHaveBeenCalledOnce();
  expect(warn).toHaveBeenCalledWith("security.rate_limit_multiple_processes", { processes: 2 });
});
it.each([undefined, "1", "0", "basura"])("no advierte para %s", (value) => {
  warnIfMultipleProcesses(value);
  expect(warn).not.toHaveBeenCalled();
});
it("mantiene la ventana de una instancia", () => {
  const input = { scope: "test", identifier: "ip", limit: 1, windowMs: 1000, now: 1 };
  expect(consumeRateLimit(input).allowed).toBe(true);
  expect(consumeRateLimit(input).allowed).toBe(false);
  expect(consumeRateLimit({ ...input, now: 1002 }).allowed).toBe(true);
});

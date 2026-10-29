import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  hayExportacionEnCurso,
  liberarHuecoDeExportacion,
  reservarHuecoDeExportacion,
} from "./slot";

const owned: symbol[] = [];
function reserve(): symbol {
  const owner = reservarHuecoDeExportacion();
  expect(owner).not.toBeNull();
  owned.push(owner!);
  return owner!;
}
afterEach(() => {
  for (const owner of owned.splice(0)) liberarHuecoDeExportacion(owner);
  vi.useRealTimers();
});

it("impide otra reserva mientras siga activa, incluso después de diez minutos", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-29T00:00:00Z"));
  const owner = reserve();
  vi.advanceTimersByTime(24 * 60 * 60 * 1000);
  expect(hayExportacionEnCurso()).toBe(true);
  expect(reservarHuecoDeExportacion()).toBeNull();
  liberarHuecoDeExportacion(owner);
  expect(hayExportacionEnCurso()).toBe(false);
  reserve();
});

it("una liberación antigua o ajena no libera la reserva siguiente", () => {
  const first = reserve();
  liberarHuecoDeExportacion(first);
  const second = reserve();
  expect(second).not.toBe(first);
  liberarHuecoDeExportacion(first);
  liberarHuecoDeExportacion(Symbol("exportacion"));
  expect(hayExportacionEnCurso()).toBe(true);
  expect(reservarHuecoDeExportacion()).toBeNull();
  liberarHuecoDeExportacion(second);
  expect(hayExportacionEnCurso()).toBe(false);
});

it("mantiene la exclusión cuando se vuelve a cargar el módulo en el mismo proceso", async () => {
  const owner = reserve();
  vi.resetModules();
  const reloaded = await import("./slot");
  expect(reloaded.reservarHuecoDeExportacion()).toBeNull();
  reloaded.liberarHuecoDeExportacion(owner);
  expect(hayExportacionEnCurso()).toBe(false);
});

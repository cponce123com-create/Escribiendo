import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RelationshipMap } from "./components/story/relationship-map";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("personajes no relaja estilos de atributos en producción", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const { proxy } = await import("./proxy");
  const response = proxy(new NextRequest("https://ejemplo.test/characters"));
  const csp = response.headers.get("content-security-policy")!;
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).toContain("style-src 'self' 'nonce-");
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("el mapa usa geometría SVG y clases, sin atributos style", () => {
  const a = { id: "a", name: "Ana" },
    b = { id: "b", name: "Luis" };
  const html = renderToStaticMarkup(
    createElement(RelationshipMap, {
      characters: [a, b],
      relations: [{ id: "r", source: a, target: b, kind: "FAMILY", description: null }],
    }),
  );
  expect(html).toContain("<circle");
  expect(html).not.toContain("style=");
});

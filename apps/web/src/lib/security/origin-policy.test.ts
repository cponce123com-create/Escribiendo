import { describe, expect, it } from "vitest";
import { isSameOrigin, resolveExpectedOrigin } from "./origin-policy";

describe("origin policy", () => {
  it("prefiere la URL canónica configurada", () => {
    expect(
      resolveExpectedOrigin({ appUrl: "https://escribiendo.example", host: "evil.example" }),
    ).toBe("https://escribiendo.example");
  });

  it("usa el host solo cuando no existe APP_URL", () => {
    expect(resolveExpectedOrigin({ host: "localhost:3000", protocol: "http" })).toBe(
      "http://localhost:3000",
    );
  });

  it("rechaza orígenes distintos o ausentes", () => {
    expect(isSameOrigin("https://evil.example", "https://escribiendo.example")).toBe(false);
    expect(isSameOrigin(null, "https://escribiendo.example")).toBe(false);
    expect(isSameOrigin("https://escribiendo.example", "https://escribiendo.example")).toBe(true);
  });
});

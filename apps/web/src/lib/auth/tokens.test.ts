import { describe, expect, it } from "vitest";
import { generateToken, hashToken, secureCompareTokens } from "./tokens";

describe("tokens", () => {
  it("genera tokens distintos y suficientemente largos", () => {
    const first = generateToken();
    const second = generateToken();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
  });

  it("solo almacena el hash determinista", () => {
    const token = generateToken();
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
  });

  it("compara tokens en tiempo constante", () => {
    expect(secureCompareTokens("abc", "abc")).toBe(true);
    expect(secureCompareTokens("abc", "abd")).toBe(false);
  });
});

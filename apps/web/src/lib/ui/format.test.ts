import { describe, expect, it } from "vitest";
import { formatPercent } from "./format";

describe("formatPercent", () => {
  it("usa la coma decimal española y dos decimales", () => {
    expect(formatPercent(83.333)).toBe("83,33%");
    expect(formatPercent(50)).toBe("50,00%");
    expect(formatPercent(100)).toBe("100,00%");
  });
});

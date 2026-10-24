import { describe, expect, it } from "vitest";
import {
  DEFAULT_WRITING_PREFERENCES,
  EDITORIAL_RULE_OPTIONS,
  parseWritingPreferences,
} from "./writing-preferences";

describe("preferencias de escritura", () => {
  it("acepta preferencias antiguas y conserva los defaults de las reglas nuevas", () => {
    expect(parseWritingPreferences('{"fontSize":19,"lineHeight":1.7,"focusMode":true}')).toEqual({
      fontSize: 19,
      lineHeight: 1.7,
      focusMode: true,
      editorialRulesEnabled: {},
    });
    expect(DEFAULT_WRITING_PREFERENCES.editorialRulesEnabled).toEqual({});
  });

  it("restaura solo valores booleanos de reglas y descarta datos inválidos", () => {
    const preferences = parseWritingPreferences(
      JSON.stringify({
        editorialRulesEnabled: {
          [EDITORIAL_RULE_OPTIONS[0].id]: false,
          [EDITORIAL_RULE_OPTIONS[1].id]: true,
          unknown: "false",
          invalid: null,
        },
      }),
    );

    expect(preferences.editorialRulesEnabled).toEqual({
      [EDITORIAL_RULE_OPTIONS[0].id]: false,
      [EDITORIAL_RULE_OPTIONS[1].id]: true,
    });
    expect(preferences.fontSize).toBe(DEFAULT_WRITING_PREFERENCES.fontSize);
  });

  it("usa defaults cuando el JSON guardado está corrupto", () => {
    expect(parseWritingPreferences("{")).toEqual(DEFAULT_WRITING_PREFERENCES);
  });
});

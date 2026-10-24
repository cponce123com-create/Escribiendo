import { describe, expect, it } from "vitest";
import { proofreadDocument, proofreadText } from "./local-proofreader";

describe("proofreadText", () => {
  it("sugiere correcciones locales para erratas frecuentes en español", () => {
    const issues = proofreadText("Haber si puedo hecharlo; hiba a casa.");

    expect(issues.map(({ original, suggestion }) => [original, suggestion])).toEqual([
      ["Haber si", "A ver si"],
      ["hechar", "echar"],
      ["hiba", "iba"],
    ]);
  });

  it("corrige tildes indebidas en monosílabos", () => {
    expect(
      proofreadText("Ella dió la noticia y fué feliz.").map((issue) => issue.suggestion),
    ).toEqual(["dio", "fue"]);
  });

  it("conserva las posiciones exactas para repetición y espacios", () => {
    const text = "La  casa casa,  bonita.";
    const issues = proofreadText(text);

    expect(issues.map(({ original, suggestion }) => [original, suggestion])).toEqual([
      ["  ", " "],
      ["casa casa", "casa"],
      ["  ", " "],
    ]);
    for (const issue of issues) {
      expect(text.slice(issue.from, issue.to)).toBe(issue.original);
    }
  });

  it("detecta palabras repetidas con formas Unicode canónicamente equivalentes", () => {
    const text = "Cafe\u0301 CAFÉ";
    const [issue] = proofreadText(text, ["repeated-word"]);

    expect(issue).toMatchObject({
      rule: "repeated-word",
      original: text,
      suggestion: "Cafe\u0301",
      from: 0,
      to: text.length,
    });
  });

  it("propone mayúscula tras cierre, incluso en nombres tras título, y respeta «p. ej.»", () => {
    const issues = proofreadText("Llegó tarde. después habló con el Sr. pérez, p. ej. en casa.");

    expect(issues.map(({ original, suggestion }) => [original, suggestion])).toEqual([
      ["d", "D"],
      ["p", "P"],
    ]);
  });

  it("no genera cambios para el texto correcto que cubren sus reglas", () => {
    expect(proofreadText("Hola. ¿Cómo estás? A ver si mañana lo revisamos.")).toEqual([]);
  });

  it("convierte posiciones del bloque a posiciones del documento TipTap", () => {
    const text = "Haber si";
    const fakeDocument = {
      descendants(callback: (node: unknown, position: number) => false | void) {
        callback(
          {
            isTextblock: true,
            content: { size: text.length },
            textBetween: () => text,
          },
          4,
        );
      },
    } as Parameters<typeof proofreadDocument>[0];

    const [issue] = proofreadDocument(fakeDocument);
    expect(issue).toMatchObject({ from: 5, to: 13, original: "Haber si", suggestion: "A ver si" });
  });
});

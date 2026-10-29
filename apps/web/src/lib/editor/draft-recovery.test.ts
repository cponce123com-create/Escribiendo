import { expect, it } from "vitest";
import { draftRecoveryDecision } from "./draft-recovery";

const server = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Las dos frases." }] }],
};

it("confirma el mismo texto aunque el borrador conserve una versión anterior y JSONB reordene claves", () => {
  const draft = {
    baseVersion: 4,
    content: JSON.stringify({
      content: [{ content: [{ text: "Las dos frases.", type: "text" }], type: "paragraph" }],
      type: "doc",
    }),
  };
  expect(draftRecoveryDecision(draft, server, 5)).toBe("synced");
});

it("conserva un conflicto real cuando el texto difiere y el servidor avanzó", () => {
  expect(
    draftRecoveryDecision(
      { baseVersion: 4, content: JSON.stringify({ type: "doc", content: [] }) },
      server,
      5,
    ),
  ).toBe("conflict");
});

it("recupera cambios pendientes sobre la misma versión", () => {
  expect(
    draftRecoveryDecision(
      { baseVersion: 5, content: JSON.stringify({ type: "doc", content: [] }) },
      server,
      5,
    ),
  ).toBe("recover");
});

it.each(["{", JSON.stringify({ type: "ajeno" })])("rechaza un borrador dañado: %s", (content) => {
  expect(draftRecoveryDecision({ baseVersion: 5, content }, server, 5)).toBe("invalid");
});

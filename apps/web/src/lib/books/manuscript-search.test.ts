import { describe, expect, it } from "vitest";
import { emptyTiptapDocument } from "@escribiendo/book-schema";
import { excerptForQuery, findTextMatches, replaceTextLeaves } from "./manuscript-search";

describe("búsqueda y reemplazo del manuscrito", () => {
  it("cuenta coincidencias en todos los nodos de texto sin distinguir mayúsculas", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hola hola" }] }],
    };
    expect(findTextMatches(doc, "hola")).toBe(2);
    expect(excerptForQuery(doc, "hola")).toContain("Hola hola");
  });

  it("reemplaza texto y conserva marcas y estructura del documento", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hola", marks: [{ type: "bold" }] },
            { type: "text", text: " mundo" },
          ],
        },
      ],
    };
    const result = replaceTextLeaves(doc as typeof emptyTiptapDocument, "hola", "Buenas");
    expect(result.count).toBe(1);
    expect(result.document.content[0]?.content?.[0]).toMatchObject({
      text: "Buenas",
      marks: [{ type: "bold" }],
    });
    expect(result.document.content[0]?.content?.[1]).toMatchObject({ text: " mundo" });
  });
});

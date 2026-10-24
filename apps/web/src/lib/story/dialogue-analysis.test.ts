import { describe, expect, it } from "vitest";
import { dialogueBlocks, extractSpeaker } from "./dialogue-analysis";
describe("atribuciones de diálogo", () => {
  it("se abstiene ante nombres compartidos o varios hablantes", () => {
    const people = [{ name: "Ana María" }, { name: "Ana Lucía" }];
    expect(extractSpeaker("Hola —dijo Ana.", people).speaker).toBeNull();
    expect(
      extractSpeaker("Hola —dijo Ana María. Adiós —respondió Ana Lucía.", people).speaker,
    ).toBeNull();
  });
  it("no atribuye Ana a Anabel y preserva tildes y Unicode", () => {
    expect(extractSpeaker("Hola —dijo Ana.", [{ name: "Anabel" }]).speaker).toBeNull();
    expect(extractSpeaker("Hola —dijo José.", [{ name: "Jose\u0301" }]).speaker).toBe("Jose\u0301");
    expect(extractSpeaker("Hola —dijo José.", [{ name: "Jose" }]).speaker).toBeNull();
  });
  it("reconoce un nombre explícito único y alias sin inventar un hablante", () => {
    expect(extractSpeaker("Hola —dijo Ana María.", [{ name: "Ana María" }]).speaker).toBe(
      "Ana María",
    );
    expect(extractSpeaker("Hola —dijo Luz.", [{ name: "Ana", aliases: ["Luz"] }]).speaker).toBe(
      "Ana",
    );
    expect(extractSpeaker("Hola —dijo ella.", [{ name: "Ana" }]).speaker).toBeNull();
  });
});
describe("bloques dialogados", () => {
  it("conserva orden y no transforma citas interiores o listas en intervenciones", () => {
    expect(
      dialogueBlocks(
        "Pensó en «volver pronto».\n—Hola —dijo Ana.\n- Comprar pan\n«Adiós»\n“Hasta mañana”",
      ),
    ).toEqual(["Hola —dijo Ana.", "«Adiós»", "“Hasta mañana”"]);
  });
  it("no cuenta una comilla sin cerrar como intervención", () => {
    expect(dialogueBlocks("«Una cita sin cerrar\nLa casa estaba vacía.")).toEqual([]);
  });
});

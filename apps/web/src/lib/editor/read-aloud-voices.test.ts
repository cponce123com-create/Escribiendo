import { describe, expect, it } from "vitest";
import type { ReaderVoice } from "@escribiendo/native-reader";
import { filterSpanishVoices, getSpanishVoiceLocaleLabel } from "./read-aloud-voices";

const voice = (id: string, language: string): ReaderVoice => ({
  id,
  name: id,
  language,
  requiresNetwork: false,
});

describe("voces del lector de manuscritos", () => {
  it("solo conserva voces en español y acepta etiquetas con guion o guion bajo", () => {
    expect(
      filterSpanishVoices([
        voice("spanish-mx", "es-MX"),
        voice("spanish-pe", "es_PE"),
        voice("english-us", "en-US"),
        voice("french", "fr-FR"),
      ]).map(({ id }) => id),
    ).toEqual(["spanish-mx", "spanish-pe"]);
  });

  it("muestra la región de la voz, incluida la etiqueta latinoamericana es-419", () => {
    expect(getSpanishVoiceLocaleLabel("es-MX")).toBe("Español (México)");
    expect(getSpanishVoiceLocaleLabel("es-419")).toBe("Español (Latinoamérica)");
  });
});

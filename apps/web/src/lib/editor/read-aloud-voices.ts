import type { ReaderVoice } from "@escribiendo/native-reader";

/** Keeps the voice selector focused on voices that can read Spanish text. */
export function filterSpanishVoices(voices: ReaderVoice[]): ReaderVoice[] {
  return voices.filter((voice) => /^es(?:-|$)/i.test(voice.language.replaceAll("_", "-")));
}

/** Turns Android locale tags such as es-MX and es-419 into Spanish labels. */
export function getSpanishVoiceLocaleLabel(language: string): string {
  const [languageCode, region] = language.replaceAll("_", "-").split("-");
  if (languageCode?.toLowerCase() !== "es") return "Idioma no español";
  if (!region) return "Español";

  const regionLabel = new Intl.DisplayNames(["es"], { type: "region" }).of(region.toUpperCase());
  return regionLabel ? `Español (${regionLabel})` : "Español";
}

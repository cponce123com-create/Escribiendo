/** Uso: node --import tsx scripts/verificar-personajes.ts manuscrito.txt [--evidencias] */
import { readFileSync, statSync } from "node:fs";
import { verifyCharacterNamesResult } from "../apps/web/src/lib/story/character-name-verifier";
const args = process.argv.slice(2),
  file = args.find((arg) => arg !== "--evidencias");
if (!file) {
  process.stderr.write(
    "Uso: node --import tsx scripts/verificar-personajes.ts manuscrito.txt [--evidencias]\n",
  );
  process.exitCode = 1;
} else
  try {
    if (statSync(file).size > 16_000_000)
      throw new Error("El archivo supera 16 MB. Divide el manuscrito en partes.");
    const report = verifyCharacterNamesResult([
      { id: "archivo", title: "Manuscrito local", text: readFileSync(file, "utf8") },
    ]);
    console.log(
      JSON.stringify(
        {
          limitesAplicados: report.limitsHit,
          personajes: report.candidates.map((person) => ({
            nombre: person.name,
            menciones: person.mentions,
            variantes: person.aliases,
            verificacion: person.nameVerification
              ? { ...person.nameVerification, secondaryEvidence: undefined }
              : undefined,
            ...(args.includes("--evidencias") ? { evidencias: person.evidence } : {}),
          })),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "No se pudo analizar el archivo."}\n`,
    );
    process.exitCode = 1;
  }

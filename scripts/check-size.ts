/**
 * Control del tamaño de lo que se envía al navegador.
 *
 * El cliente y los estáticos públicos crecen sin que se note: una fuente más
 * o un paquete nuevo pueden subir cientos de kilobytes sin que nadie se
 * entere. Este script mide y falla si se pasa del presupuesto, de modo que el
 * crecimiento se ve en la revisión.
 *
 * Uso:
 *   pnpm check:size
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

/** Presupuesto del JavaScript que se envía al navegador, en bytes. */
const PRESUPUESTO_JS = 2_000_000;

/** Presupuesto de los estáticos públicos (las fuentes del PDF), en bytes. */
const PRESUPUESTO_ESTATICOS = 6_000_000;

/** Suma el tamaño de los ficheros de una carpeta y de sus subcarpetas. */
function tamanoDe(carpeta: string, filtro: (nombre: string) => boolean): number {
  let total = 0;

  for (const nombre of readdirSync(carpeta)) {
    const completo = path.join(carpeta, nombre);

    if (statSync(completo).isDirectory()) {
      total += tamanoDe(completo, filtro);
      continue;
    }

    if (filtro(nombre)) {
      total += statSync(completo).size;
    }
  }

  return total;
}

function main(): void {
  const raiz = process.cwd();
  const problemas: string[] = [];

  const js = path.join(raiz, "apps", "web", ".next", "static", "chunks");
  const estaticos = path.join(raiz, "apps", "web", "public");

  let tamanoJs = 0;

  try {
    tamanoJs = tamanoDe(js, (nombre) => nombre.endsWith(".js"));
  } catch {
    problemas.push("No hay compilación: ejecuta `pnpm build` antes de comprobar el tamaño.");
  }

  let tamanoEstaticos = 0;

  try {
    tamanoEstaticos = tamanoDe(estaticos, () => true);
  } catch {
    problemas.push("No se encuentra la carpeta de estáticos públicos.");
  }

  const kb = (bytes: number): string => `${Math.round(bytes / 1024)} KB`;

  process.stdout.write("Tamaño\n");
  process.stdout.write(
    `  JavaScript del cliente: ${kb(tamanoJs)} (presupuesto ${kb(PRESUPUESTO_JS)})\n`,
  );
  process.stdout.write(
    `  Estáticos públicos:    ${kb(tamanoEstaticos)} (presupuesto ${kb(PRESUPUESTO_ESTATICOS)})\n`,
  );

  if (tamanoJs > PRESUPUESTO_JS) {
    problemas.push(
      `El JavaScript del cliente pasa del presupuesto: ${kb(tamanoJs)} > ${kb(PRESUPUESTO_JS)}.`,
    );
  }

  if (tamanoEstaticos > PRESUPUESTO_ESTATICOS) {
    problemas.push(
      `Los estáticos públicos pasan del presupuesto: ${kb(tamanoEstaticos)} > ${kb(PRESUPUESTO_ESTATICOS)}.`,
    );
  }

  if (problemas.length > 0) {
    for (const problema of problemas) {
      process.stderr.write(`${problema}\n`);
    }

    process.exit(1);
  }

  process.stdout.write("  Dentro del presupuesto.\n");
}

main();

/**
 * Materias breves y páginas estructuradas.
 *
 * A diferencia de la página legal, estas materias admiten texto del autor y
 * cierta libertad de composición. El módulo devuelve bloques neutros para que
 * la aplicación los convierta en `LayoutBlock` y los pagine con el motor real:
 * aquí no se mide tipografía ni se decide el número de páginas.
 */

export type MatterBlockRole =
  | "logo"
  | "title"
  | "subtitle"
  | "author"
  | "publisher"
  | "body"
  | "small"
  | "italic"
  | "center"
  | "right"
  | "rule"
  | "spacer";

export interface MatterBlock {
  role: MatterBlockRole;
  text: string;
  /** Espacio vertical antes del siguiente bloque, en milímetros. */
  spaceMm?: number;
  /**
   * Espacio vertical como fracción de la altura útil de la página. Permite
   * colocar la dedicatoria en el tercio superior, el centro o el pie sin
   * depender del formato de papel.
   */
  spaceFraction?: number;
  /**
   * Alineación propia del bloque. Permite combinar un papel tipográfico
   * (por ejemplo, la cursiva literaria) con la alineación que pida el autor.
   */
  alignment?: "left" | "center" | "right";
}

export type MatterWarningSeverity = "info" | "warning" | "error";

export interface MatterWarning {
  code: string;
  severity: MatterWarningSeverity;
  message: string;
}

export interface MatterPage {
  blocks: MatterBlock[];
  warnings: MatterWarning[];
  /** `false` cuando la página no debe componerse tal como está. */
  ready: boolean;
}

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function paragraphs(value: string): string[] {
  return value
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split(/\r?\n/)
        .map((line) => line.replace(/[^\S\r\n]+/gu, " ").trim())
        .join("\n"),
    )
    .filter((paragraph) => paragraph.replace(/\s/gu, "").length > 0);
}

function warn(
  warnings: MatterWarning[],
  code: string,
  message: string,
  severity: MatterWarningSeverity = "warning",
): void {
  warnings.push({ code, severity, message });
}

function spacers(count: number): MatterBlock[] {
  return Array.from({ length: Math.max(0, count) }, () => ({ role: "spacer" as const, text: "" }));
}

// ---------------------------------------------------------------------------
// Portada
// ---------------------------------------------------------------------------

export interface TitlePageInput {
  title: string;
  subtitle?: string | null;
  author: string;
  publisher?: string | null;
  imprint?: string | null;
  series?: string | null;
  editionLabel?: string | null;
  logoUrl?: string | null;
  /** Distribución vertical del bloque principal. */
  verticalPosition?: "upper" | "center" | "lower";
}

export function buildTitlePage(input: TitlePageInput): MatterPage {
  const warnings: MatterWarning[] = [];
  const title = clean(input.title);
  const author = clean(input.author);
  const publisher = clean(input.imprint) || clean(input.publisher);

  if (!title) {
    warn(warnings, "FALTA_TITULO", "La portada no tiene título.", "error");
  }
  if (!author) {
    warn(warnings, "FALTA_AUTOR", "La portada no tiene autoría.", "warning");
  }

  const position = input.verticalPosition ?? "center";
  const top = position === "upper" ? 1 : position === "center" ? 5 : 9;

  const blocks: MatterBlock[] = [...spacers(top)];
  if (clean(input.series)) {
    blocks.push({ role: "small", text: clean(input.series) });
  }
  if (title) {
    blocks.push({ role: "title", text: title });
  }
  if (clean(input.subtitle)) {
    blocks.push({ role: "subtitle", text: clean(input.subtitle) });
  }
  if (clean(input.editionLabel)) {
    blocks.push({ role: "small", text: clean(input.editionLabel) });
  }
  if (author) {
    blocks.push({ role: "author", text: author });
  }
  blocks.push(...spacers(4));
  if (publisher) {
    blocks.push({ role: "publisher", text: publisher });
  }
  if (clean(input.logoUrl)) {
    blocks.push({ role: "logo", text: clean(input.logoUrl) });
  }

  return { blocks, warnings, ready: warnings.every((item) => item.severity !== "error") };
}

// ---------------------------------------------------------------------------
// Dedicatoria
// ---------------------------------------------------------------------------

export const dedicationTemplates = ["classic", "minimal", "literary"] as const;
export type DedicationTemplate = (typeof dedicationTemplates)[number];

export const DEDICATION_RECOMMENDED_CHARS = 350;
export const DEDICATION_MAX_CHARS = 500;

export interface DedicationInput {
  text: string;
  template?: DedicationTemplate;
  alignment?: "left" | "center" | "right";
  verticalPosition?: "upper" | "center" | "lower";
  signature?: string | null;
}

export interface DedicationComposition extends MatterPage {
  template: DedicationTemplate;
  characters: number;
  estimatedLines: number;
}

/** Cuenta caracteres visibles, no unidades UTF-16. */
export function countCharacters(value: string): number {
  return Array.from(value.replace(/\s+/g, " ").trim()).length;
}

/**
 * Estimación de líneas por número de caracteres.
 *
 * No sustituye a la medición: sirve para avisar antes de componer. El motor de
 * paginación es quien decide si el texto desborda la caja.
 */
export function estimateWrappedLines(text: string, charsPerLine = 40): number {
  return text
    .split(/\r?\n/)
    .map((line) =>
      Math.max(1, Math.ceil(Array.from(line.trim()).length / Math.max(1, charsPerLine))),
    )
    .reduce((total, lines) => total + lines, 0);
}

export function buildDedicationPage(input: DedicationInput): DedicationComposition {
  const template = input.template ?? "classic";
  const warnings: MatterWarning[] = [];
  const text = input.text.trim();
  const characters = countCharacters(text);
  const estimatedLines = estimateWrappedLines(text);

  if (!text) {
    warn(warnings, "DEDICATORIA_VACIA", "La dedicatoria está vacía.", "error");
  }
  if (characters > DEDICATION_MAX_CHARS) {
    warn(
      warnings,
      "DEDICATORIA_EXCESIVA",
      `La dedicatoria tiene ${characters} caracteres; se recomienda no superar ${DEDICATION_RECOMMENDED_CHARS} y el máximo editorial es ${DEDICATION_MAX_CHARS}. No se recorta el texto.`,
    );
  } else if (characters > DEDICATION_RECOMMENDED_CHARS) {
    warn(
      warnings,
      "DEDICATORIA_LARGA",
      `La dedicatoria tiene ${characters} caracteres; puede ocupar más de una página.`,
      "info",
    );
  }
  if (estimatedLines > 10) {
    warn(
      warnings,
      "DEDICATORIA_DESBORDA",
      "La estimación supera diez líneas; revisa el resultado en la vista previa.",
      "info",
    );
  }

  const position = input.verticalPosition ?? (template === "minimal" ? "upper" : "center");
  // La posición se expresa como fracción de la altura útil: así el tercio
  // superior, el centro y el pie no dependen del cuerpo de letra ni del papel.
  const spaceFraction = position === "upper" ? 0.12 : position === "center" ? 0.38 : 0.64;
  const alignment = input.alignment ?? "right";

  const blocks: MatterBlock[] = [{ role: "spacer", text: "", spaceFraction }];
  if (template === "classic") {
    blocks.push({ role: "rule", text: "" });
  }
  for (const paragraph of paragraphs(text)) {
    blocks.push({
      // La cursiva literaria no impone la alineación: el autor puede pedir
      // derecha, centro o izquierda y el papel tipográfico se conserva.
      role: template === "literary" ? "italic" : alignment === "left" ? "body" : alignment,
      text: paragraph,
      alignment,
    });
  }
  if (template === "classic") {
    blocks.push({ role: "rule", text: "" });
  }
  if (clean(input.signature)) {
    blocks.push({ role: "right", text: clean(input.signature) });
  }

  return {
    template,
    characters,
    estimatedLines,
    blocks,
    warnings,
    ready: warnings.every((item) => item.severity !== "error"),
  };
}

// ---------------------------------------------------------------------------
// Epígrafe
// ---------------------------------------------------------------------------

export const epigraphTemplates = ["classic", "minimal"] as const;
export type EpigraphTemplate = (typeof epigraphTemplates)[number];

export const EPIGRAPH_RECOMMENDED_CHARS = 400;

export interface EpigraphInput {
  text: string;
  attribution?: string | null;
  source?: string | null;
  template?: EpigraphTemplate;
  verticalPosition?: "upper" | "center" | "lower";
}

export interface EpigraphComposition extends MatterPage {
  template: EpigraphTemplate;
  characters: number;
}

export interface ChapterEpigraph extends EpigraphInput {
  sectionId: string;
  /** Antes o después del título del capítulo. */
  position?: "before-title" | "after-title";
}

export function buildEpigraphPage(input: EpigraphInput): EpigraphComposition {
  const template = input.template ?? "classic";
  const warnings: MatterWarning[] = [];
  const text = input.text.trim();
  const characters = countCharacters(text);

  if (!text) {
    warn(warnings, "EPIGRAFE_VACIO", "El epígrafe está vacío.", "error");
  }
  if (characters > EPIGRAPH_RECOMMENDED_CHARS) {
    warn(
      warnings,
      "EPIGRAFE_LARGO",
      `El epígrafe tiene ${characters} caracteres; revisa que quepa en una página.`,
      "info",
    );
  }
  if (!clean(input.attribution)) {
    warn(
      warnings,
      "EPIGRAFE_SIN_ATRIBUCION",
      "El epígrafe no tiene atribución; se imprimirá solo el texto.",
      "info",
    );
  }

  const position = input.verticalPosition ?? (template === "minimal" ? "upper" : "center");
  const top = position === "upper" ? 2 : position === "center" ? 6 : 11;

  const blocks: MatterBlock[] = [...spacers(top)];
  if (template === "classic") {
    blocks.push({ role: "rule", text: "" });
  }
  if (text) {
    blocks.push({ role: "italic", text });
  }
  const attribution = clean(input.attribution);
  const source = clean(input.source);
  if (attribution || source) {
    blocks.push({
      role: "right",
      text: [attribution, source].filter(Boolean).join(", "),
    });
  }

  return {
    template,
    characters,
    blocks,
    warnings,
    ready: !warnings.some((w) => w.severity === "error"),
  };
}

/** Agrupa epígrafes de capítulo conservando el orden de llegada. */
export function groupEpigraphsBySection(
  epigraphs: readonly ChapterEpigraph[],
): Map<string, ChapterEpigraph[]> {
  const grouped = new Map<string, ChapterEpigraph[]>();
  for (const epigraph of epigraphs) {
    const list = grouped.get(epigraph.sectionId);
    if (list) {
      list.push(epigraph);
    } else {
      grouped.set(epigraph.sectionId, [epigraph]);
    }
  }
  return grouped;
}

/** Un libro solo puede tener una dedicatoria principal. */
export function auditSingleDedication(count: number): MatterWarning[] {
  if (count <= 1) {
    return [];
  }
  return [
    {
      code: "DEDICATORIA_DUPLICADA",
      severity: "warning",
      message: "Hay más de una dedicatoria principal; elige cuál se compone.",
    },
  ];
}

// ---------------------------------------------------------------------------
// Créditos, sobre el autor y otras obras
// ---------------------------------------------------------------------------

export interface CreditEntry {
  role: string;
  name: string;
}

export interface CreditsInput {
  heading?: string;
  entries: readonly CreditEntry[];
  logoUrl?: string | null;
}

export function buildCreditsPage(input: CreditsInput): MatterPage {
  const warnings: MatterWarning[] = [];
  const entries = input.entries
    .map((entry) => ({ role: clean(entry.role), name: clean(entry.name) }))
    .filter((entry) => entry.name);

  if (entries.length === 0) {
    warn(warnings, "CREDITOS_VACIOS", "No hay créditos que imprimir.", "info");
  }

  const blocks: MatterBlock[] = [];
  if (clean(input.logoUrl)) {
    blocks.push({ role: "logo", text: clean(input.logoUrl) });
  }
  blocks.push({ role: "title", text: clean(input.heading) || "Créditos" });
  blocks.push({ role: "rule", text: "" });
  for (const entry of entries) {
    blocks.push({
      role: "small",
      text: entry.role ? `${entry.role}: ${entry.name}` : entry.name,
    });
  }

  return { blocks, warnings, ready: !warnings.some((w) => w.severity === "error") };
}

export interface AboutAuthorInput {
  name: string;
  biography: string;
  photoUrl?: string | null;
  website?: string | null;
  email?: string | null;
  heading?: string;
}

export function buildAboutAuthorPage(input: AboutAuthorInput): MatterPage {
  const warnings: MatterWarning[] = [];
  const name = clean(input.name);
  const biography = input.biography.trim();

  if (!name) {
    warn(warnings, "AUTOR_SIN_NOMBRE", "La página «Sobre el autor» no tiene nombre.", "error");
  }
  if (!biography) {
    warn(warnings, "AUTOR_SIN_BIOGRAFIA", "Falta la biografía del autor.", "warning");
  }

  const blocks: MatterBlock[] = [];
  if (clean(input.photoUrl)) {
    blocks.push({ role: "logo", text: clean(input.photoUrl) });
  }
  blocks.push({ role: "title", text: clean(input.heading) || "Sobre el autor" });
  if (name) {
    blocks.push({ role: "author", text: name });
  }
  blocks.push({ role: "rule", text: "" });
  for (const paragraph of paragraphs(biography)) {
    blocks.push({ role: "body", text: paragraph });
  }
  const contact = [clean(input.website), clean(input.email)].filter(Boolean).join(" · ");
  if (contact) {
    blocks.push({ role: "small", text: contact });
  }

  return { blocks, warnings, ready: !warnings.some((w) => w.severity === "error") };
}

export interface OtherBookEntry {
  title: string;
  subtitle?: string | null;
  year?: number | null;
  publisher?: string | null;
  url?: string | null;
}

export interface OtherBooksInput {
  heading?: string;
  books: readonly OtherBookEntry[];
  introduction?: string | null;
}

export function buildOtherBooksPage(input: OtherBooksInput): MatterPage {
  const warnings: MatterWarning[] = [];
  const books = input.books
    .map((book) => ({
      title: clean(book.title),
      subtitle: clean(book.subtitle),
      year: book.year ?? null,
      publisher: clean(book.publisher),
      url: clean(book.url),
    }))
    .filter((book) => book.title);

  if (books.length === 0) {
    warn(warnings, "OTRAS_OBRAS_VACIAS", "No hay otras obras que listar.", "info");
  }

  const blocks: MatterBlock[] = [{ role: "title", text: clean(input.heading) || "Otras obras" }];
  if (clean(input.introduction)) {
    blocks.push({ role: "body", text: clean(input.introduction) });
  }
  blocks.push({ role: "rule", text: "" });

  for (const book of books) {
    const details = [book.subtitle, book.publisher, book.year ? String(book.year) : ""]
      .filter(Boolean)
      .join(" · ");
    blocks.push({ role: "body", text: book.title });
    if (details) {
      blocks.push({ role: "small", text: details });
    }
    if (book.url) {
      blocks.push({ role: "small", text: book.url });
    }
  }

  return { blocks, warnings, ready: !warnings.some((w) => w.severity === "error") };
}

// ---------------------------------------------------------------------------
// Colofón
// ---------------------------------------------------------------------------

export interface ColophonInput {
  publisher?: string | null;
  imprint?: string | null;
  printer?: string | null;
  printRun?: number | null;
  paper?: string | null;
  typography?: string | null;
  binding?: string | null;
  publicationDate?: string | Date | null;
  editionLabel?: string | null;
  isbn?: string | null;
  legalDeposit?: string | null;
  city?: string | null;
  country?: string | null;
  digitalPlatform?: string | null;
  mode?: "print" | "digital";
}

export interface ColophonComposition extends MatterPage {
  mode: "print" | "digital";
}

/**
 * Colofón honesto: solo afirma lo que consta en los datos.
 *
 * «Se terminó de imprimir» exige imprenta y fecha. Sin ambos, se imprime un
 * cierre técnico neutro o no se imprime colofón.
 */
export function buildColophonPage(input: ColophonInput): ColophonComposition {
  const mode = input.mode ?? "print";
  const warnings: MatterWarning[] = [];
  const blocks: MatterBlock[] = [{ role: "title", text: "Colofón" }];
  blocks.push({ role: "rule", text: "" });

  const publisher = clean(input.imprint) || clean(input.publisher);
  const printer = clean(input.printer);
  const city = clean(input.city);
  const country = clean(input.country);
  const place = [city, country].filter(Boolean).join(", ");

  if (mode === "print") {
    if (printer && input.publicationDate) {
      blocks.push({
        role: "small",
        text: `Este libro se terminó de imprimir en ${printer}${place ? `, ${place}` : ""}, en ${new Date(input.publicationDate).toLocaleDateString("es-PE", { month: "long", year: "numeric", timeZone: "UTC" })}.`,
      });
    } else if (printer) {
      blocks.push({ role: "small", text: `Impreso por ${printer}${place ? `, ${place}` : ""}.` });
      warn(warnings, "COLOFON_SIN_FECHA", "Falta la fecha de impresión para el colofón.", "info");
    } else {
      warn(
        warnings,
        "COLOFON_SIN_IMPRENTA",
        "No hay imprenta; no se imprimirá el cierre de impresión.",
        "warning",
      );
    }
    if (input.printRun && input.printRun > 0) {
      blocks.push({ role: "small", text: `Tirada: ${input.printRun} ejemplares.` });
    }
  } else {
    blocks.push({ role: "small", text: "Edición digital." });
    if (clean(input.digitalPlatform)) {
      blocks.push({ role: "small", text: `Publicada en ${clean(input.digitalPlatform)}.` });
    }
  }

  if (publisher) {
    blocks.push({ role: "small", text: `Publicado por ${publisher}.` });
  }
  if (clean(input.editionLabel)) {
    blocks.push({ role: "small", text: clean(input.editionLabel) });
  }
  if (clean(input.paper)) {
    blocks.push({ role: "small", text: `Papel: ${clean(input.paper)}.` });
  }
  if (clean(input.typography)) {
    blocks.push({ role: "small", text: `Tipografía: ${clean(input.typography)}.` });
  }
  if (clean(input.binding)) {
    blocks.push({ role: "small", text: `Encuadernación: ${clean(input.binding)}.` });
  }
  if (clean(input.isbn)) {
    blocks.push({ role: "small", text: `ISBN: ${clean(input.isbn)}.` });
  }
  if (clean(input.legalDeposit)) {
    blocks.push({ role: "small", text: `Depósito legal: ${clean(input.legalDeposit)}.` });
  }

  return {
    mode,
    blocks,
    warnings,
    ready: !warnings.some((w) => w.severity === "error"),
  };
}

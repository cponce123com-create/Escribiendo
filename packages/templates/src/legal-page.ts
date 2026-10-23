import { z } from "zod";

/**
 * Página legal y créditos de edición.
 *
 * Objetivo: producir una página de derechos completa y verificable sin
 * inventar números, fechas ni responsabilidades. Cuando falta un dato
 * obligatorio, la plantilla omite la línea y devuelve un aviso; nunca imprime
 * un marcador de posición en el libro final.
 *
 * Las plantillas son de composición, no asesoría legal. La normativa aplicable
 * y las fuentes consultadas se documentan en `docs/PERU_PUBLICATION_METADATA.md`.
 */

// ---------------------------------------------------------------------------
// ISBN
// ---------------------------------------------------------------------------

export type IsbnFormat = "ISBN-13" | "ISBN-10";

export interface IsbnValidation {
  valid: boolean;
  format: IsbnFormat | null;
  normalized: string;
  checkDigit: string | null;
  expectedCheckDigit: string | null;
  reason: string | null;
}

/** Quita guiones, espacios y separadores habituales; conserva X final. */
export function normalizeIsbn(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s\u00ad\u2010-\u2015-]/g, "")
    .toUpperCase();
}

/** Dígito de control de un ISBN-13 a partir de sus 12 primeros dígitos. */
export function isbn13CheckDigit(first12: string): string {
  if (!/^\d{12}$/.test(first12)) {
    throw new RangeError("El ISBN-13 debe tener 12 dígitos para calcular su control.");
  }
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    const digit = Number(first12[index]);
    sum += index % 2 === 0 ? digit : digit * 3;
  }
  return String((10 - (sum % 10)) % 10);
}

/** Dígito de control de un ISBN-10 a partir de sus 9 primeros dígitos. */
export function isbn10CheckDigit(first9: string): string {
  if (!/^\d{9}$/.test(first9)) {
    throw new RangeError("El ISBN-10 debe tener 9 dígitos para calcular su control.");
  }
  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(first9[index]) * (10 - index);
  }
  const check = (11 - (sum % 11)) % 11;
  return check === 10 ? "X" : String(check);
}

export function validateIsbn(value: string | null | undefined): IsbnValidation {
  const normalized = normalizeIsbn(value ?? "");

  if (!normalized) {
    return {
      valid: false,
      format: null,
      normalized,
      checkDigit: null,
      expectedCheckDigit: null,
      reason: "vacío",
    };
  }

  if (!/^[0-9X]+$/.test(normalized)) {
    return {
      valid: false,
      format: null,
      normalized,
      checkDigit: null,
      expectedCheckDigit: null,
      reason: "contiene caracteres no válidos",
    };
  }

  if (normalized.length === 13) {
    if (!/^\d{13}$/.test(normalized)) {
      return {
        valid: false,
        format: "ISBN-13",
        normalized,
        checkDigit: normalized.at(-1) ?? null,
        expectedCheckDigit: null,
        reason: "un ISBN-13 solo admite dígitos",
      };
    }
    const expected = isbn13CheckDigit(normalized.slice(0, 12));
    const checkDigit = normalized.at(-1) ?? null;
    if (!normalized.startsWith("978") && !normalized.startsWith("979")) {
      return {
        valid: false,
        format: "ISBN-13",
        normalized,
        checkDigit,
        expectedCheckDigit: expected,
        reason: "el prefijo debe ser 978 o 979",
      };
    }
    return {
      valid: checkDigit === expected,
      format: "ISBN-13",
      normalized,
      checkDigit,
      expectedCheckDigit: expected,
      reason: checkDigit === expected ? null : "dígito de control incorrecto",
    };
  }

  if (normalized.length === 10) {
    const expected = isbn10CheckDigit(normalized.slice(0, 9));
    const checkDigit = normalized.at(-1) ?? null;
    return {
      valid: checkDigit === expected,
      format: "ISBN-10",
      normalized,
      checkDigit,
      expectedCheckDigit: expected,
      reason: checkDigit === expected ? null : "dígito de control incorrecto",
    };
  }

  return {
    valid: false,
    format: null,
    normalized,
    checkDigit: null,
    expectedCheckDigit: null,
    reason: "debe tener 10 o 13 caracteres",
  };
}

/** Convierte un ISBN-10 válido a su equivalente ISBN-13 (prefijo 978). */
export function isbn10To13(value: string): string | null {
  const validation = validateIsbn(value);
  if (!validation.valid || validation.format !== "ISBN-10") {
    return null;
  }
  const first12 = `978${validation.normalized.slice(0, 9)}`;
  return `${first12}${isbn13CheckDigit(first12)}`;
}

// ---------------------------------------------------------------------------
// Fechas y edición
// ---------------------------------------------------------------------------

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

export interface PublicationDateParts {
  year: number;
  month: number | null;
  day: number | null;
}

export function parsePublicationDate(
  value: string | Date | null | undefined,
): PublicationDateParts | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }

  const trimmed = value.trim();
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (full) {
    const year = Number(full[1]);
    const month = Number(full[2]);
    const day = Number(full[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }
    return { year, month, day };
  }

  const monthly = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (monthly) {
    const month = Number(monthly[2]);
    if (month < 1 || month > 12) {
      return null;
    }
    return { year: Number(monthly[1]), month, day: null };
  }

  const yearly = /^(\d{4})$/.exec(trimmed);
  if (yearly) {
    return { year: Number(yearly[1]), month: null, day: null };
  }

  return null;
}

/** «octubre de 2026», «2026» o cadena vacía si no hay fecha válida. */
export function formatPublicationDate(value: string | Date | null | undefined): string {
  const parts = parsePublicationDate(value);
  if (!parts) {
    return "";
  }
  if (parts.month === null) {
    return String(parts.year);
  }
  return `${MONTHS_ES[parts.month - 1]} de ${parts.year}`;
}

/** «Primera edición», «2.ª edición», etc. */
export function editionLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isInteger(value) || value < 1) {
    return "";
  }
  const words: Record<number, string> = {
    1: "Primera",
    2: "Segunda",
    3: "Tercera",
    4: "Cuarta",
    5: "Quinta",
    6: "Sexta",
    7: "Séptima",
    8: "Octava",
    9: "Novena",
    10: "Décima",
  };
  const word = words[value];
  return word ? `${word} edición` : `${value}.ª edición`;
}

// ---------------------------------------------------------------------------
// Licencias
// ---------------------------------------------------------------------------

export const licenseIds = [
  "all-rights-reserved",
  "cc-by",
  "cc-by-sa",
  "cc-by-nc",
  "cc-by-nc-sa",
  "cc-by-nd",
  "cc-by-nc-nd",
  "cc0",
  "custom",
] as const;

export type LicenseId = (typeof licenseIds)[number];

export const licenseIdSchema = z.enum(licenseIds);

export interface LicenseText {
  label: string;
  url: string | null;
  summary: string;
}

const LICENSES: Record<Exclude<LicenseId, "custom">, LicenseText> = {
  "all-rights-reserved": {
    label: "Todos los derechos reservados",
    url: null,
    summary:
      "Queda prohibida la reproducción total o parcial de esta obra sin autorización escrita del titular de los derechos.",
  },
  "cc-by": {
    label: "Creative Commons Atribución 4.0 Internacional",
    url: "https://creativecommons.org/licenses/by/4.0/deed.es",
    summary: "Se permite compartir y adaptar la obra citando la autoría.",
  },
  "cc-by-sa": {
    label: "Creative Commons Atribución-CompartirIgual 4.0 Internacional",
    url: "https://creativecommons.org/licenses/by-sa/4.0/deed.es",
    summary: "Se permite compartir y adaptar la obra citando la autoría y con la misma licencia.",
  },
  "cc-by-nc": {
    label: "Creative Commons Atribución-NoComercial 4.0 Internacional",
    url: "https://creativecommons.org/licenses/by-nc/4.0/deed.es",
    summary: "Se permite compartir y adaptar la obra sin fines comerciales, citando la autoría.",
  },
  "cc-by-nc-sa": {
    label: "Creative Commons Atribución-NoComercial-CompartirIgual 4.0 Internacional",
    url: "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.es",
    summary:
      "Se permite compartir y adaptar la obra sin fines comerciales, citando la autoría y con la misma licencia.",
  },
  "cc-by-nd": {
    label: "Creative Commons Atribución-SinDerivadas 4.0 Internacional",
    url: "https://creativecommons.org/licenses/by-nd/4.0/deed.es",
    summary: "Se permite compartir la obra sin modificarla, citando la autoría.",
  },
  "cc-by-nc-nd": {
    label: "Creative Commons Atribución-NoComercial-SinDerivadas 4.0 Internacional",
    url: "https://creativecommons.org/licenses/by-nc-nd/4.0/deed.es",
    summary:
      "Se permite compartir la obra sin modificarla y sin fines comerciales, citando la autoría.",
  },
  cc0: {
    label: "CC0 1.0 Universal",
    url: "https://creativecommons.org/publicdomain/zero/1.0/deed.es",
    summary: "La obra se dedica al dominio público en la medida permitida por la ley.",
  },
};

export function licenseText(id: LicenseId, custom?: string | null): LicenseText {
  if (id === "custom") {
    return {
      label: "Licencia personalizada",
      url: null,
      summary: custom?.trim() ?? "",
    };
  }
  return LICENSES[id];
}

// ---------------------------------------------------------------------------
// Plantillas de página legal
// ---------------------------------------------------------------------------

export const legalPageTemplates = [
  "copyright-peru-author",
  "copyright-peru-publisher",
  "copyright-international",
  "copyright-digital",
  "copyright-minimal",
  "copyright-creative-commons",
  "copyright-peru-ley",
] as const;

export type LegalPageTemplate = (typeof legalPageTemplates)[number];

export const legalPageTemplateSchema = z.enum(legalPageTemplates);

export const LEGAL_TEMPLATE_VERSIONS: Record<LegalPageTemplate, number> = {
  "copyright-peru-author": 1,
  "copyright-peru-publisher": 1,
  "copyright-international": 1,
  "copyright-digital": 1,
  "copyright-minimal": 1,
  "copyright-creative-commons": 1,
  "copyright-peru-ley": 1,
};

export const CREATIVE_COMMONS_LICENSES = [
  "cc-by",
  "cc-by-sa",
  "cc-by-nc",
  "cc-by-nc-nd",
  "cc0",
] as const;
export type LegalRequiredField =
  "title" | "author" | "rightsHolder" | "copyrightYear" | "license" | "legalDeposit";
export interface LegalTemplateMetadata {
  slug: LegalPageTemplate;
  version: number;
  name: string;
  description: string;
  audience: string;
  country: "PE" | "international";
  language: "es";
  requiredFields: readonly LegalRequiredField[];
}
const baseFields = ["title", "author"] as const;
const legalMetadata: ReadonlyArray<Omit<LegalTemplateMetadata, "version" | "language">> = [
  {
    slug: "copyright-peru-author",
    name: "Autor independiente · Perú",
    description: "Créditos de publicación y datos del autor editor.",
    audience: "Autor independiente",
    country: "PE",
    requiredFields: baseFields,
  },
  {
    slug: "copyright-peru-publisher",
    name: "Con sello editorial · Perú",
    description: "Identidad de la editorial, impresión y depósito legal.",
    audience: "Con sello editorial",
    country: "PE",
    requiredFields: baseFields,
  },
  {
    slug: "copyright-international",
    name: "Internacional",
    description: "Titularidad y créditos para publicaciones internacionales.",
    audience: "Autor independiente o editorial",
    country: "international",
    requiredFields: baseFields,
  },
  {
    slug: "copyright-digital",
    name: "Edición digital",
    description: "Créditos sin datos de imprenta ni tiraje.",
    audience: "Edición digital",
    country: "international",
    requiredFields: baseFields,
  },
  {
    slug: "copyright-minimal",
    name: "Esencial",
    description: "Año, titular y derechos reservados.",
    audience: "Autor independiente",
    country: "international",
    requiredFields: ["rightsHolder", "copyrightYear"],
  },
  {
    slug: "copyright-creative-commons",
    name: "Creative Commons",
    description: "Nombre y enlace oficial de la licencia elegida.",
    audience: "Publicación con licencia abierta",
    country: "international",
    requiredFields: ["rightsHolder", "copyrightYear", "license"],
  },
  {
    slug: "copyright-peru-ley",
    name: "Perú · Ley sobre el Derecho de Autor",
    description: "Referencia al Decreto Legislativo 822 y número de depósito legal.",
    audience: "Autor independiente o editorial",
    country: "PE",
    requiredFields: [...baseFields, "legalDeposit"],
  },
];
export const LEGAL_TEMPLATE_CATALOG: readonly LegalTemplateMetadata[] = legalMetadata.map(
  (item) => ({ ...item, language: "es", version: LEGAL_TEMPLATE_VERSIONS[item.slug] }),
);

export function missingLegalFields(input: LegalPageInput): LegalRequiredField[] {
  const fields = LEGAL_TEMPLATE_CATALOG.find(
    (item) => item.slug === input.template,
  )!.requiredFields;
  return fields.filter((field) => {
    if (field === "copyrightYear")
      return !input.copyrightYear && !parsePublicationDate(input.publicationDate);
    if (field === "license")
      return !(CREATIVE_COMMONS_LICENSES as readonly string[]).includes(input.license ?? "");
    return !clean(input[field]);
  });
}

export type LegalBlockRole =
  | "logo"
  | "title"
  | "subtitle"
  | "author"
  | "imprint"
  | "rule"
  | "body"
  | "small"
  | "center"
  | "italic"
  | "spacer";

export interface LegalPageBlock {
  role: LegalBlockRole;
  text: string;
}

export type LegalWarningSeverity = "info" | "warning" | "error";

export interface LegalPageWarning {
  code: string;
  severity: LegalWarningSeverity;
  field?: string;
  message: string;
}

export interface LegalPageContributor {
  role: string;
  name: string;
}

export type LegalDepositState =
  "PENDING" | "IN_PROGRESS" | "NUMBER_PROVIDED" | "DOCUMENTS_REVIEWED" | "READY_FOR_REVIEW";

export interface LegalPageInput {
  template: LegalPageTemplate;
  title: string;
  subtitle?: string | null;
  author: string;
  rightsHolder?: string | null;
  copyrightYear?: number | null;
  editionNumber?: number | null;
  editionLabel?: string | null;
  publicationDate?: string | Date | null;
  publicationCity?: string | null;
  publicationCountry?: string | null;
  language?: string | null;
  publisherName?: string | null;
  imprint?: string | null;
  legalPublisher?: string | null;
  taxId?: string | null;
  address?: string | null;
  contactEmail?: string | null;
  website?: string | null;
  isbn?: string | null;
  isbnStatus?: string | null;
  legalDeposit?: string | null;
  legalDepositStatus?: LegalDepositState | null;
  printer?: string | null;
  printRun?: number | null;
  contributors?: readonly LegalPageContributor[];
  imageCredits?: string | null;
  logoUrl?: string | null;
  license?: LicenseId;
  customLicense?: string | null;
  fictionDisclaimer?: boolean;
  trademarkNotice?: boolean;
  thirdPartyCredits?: string | null;
  customClauses?: readonly string[];
  catalogingInPublication?: string | null;
  formatLabel?: string | null;
  digitalPlatform?: string | null;
}

export interface LegalPageOptions {
  /** `print` exige imprenta y permite tiraje; `digital` no los imprime. */
  mode?: "print" | "digital";
  /** Fuerza la omisión de cláusulas opcionales. */
  includeOptionalClauses?: boolean;
}

export interface LegalPageResult {
  template: LegalPageTemplate;
  templateVersion: number;
  blocks: LegalPageBlock[];
  warnings: LegalPageWarning[];
  /** `false` solo cuando hay errores que invalidan la página. */
  ready: boolean;
}

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function sentence(value: string): string {
  const text = clean(value);
  if (!text) {
    return "";
  }
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function isPeru(template: LegalPageTemplate): boolean {
  return (
    template === "copyright-peru-author" ||
    template === "copyright-peru-publisher" ||
    template === "copyright-peru-ley"
  );
}

function templateMode(template: LegalPageTemplate, options: LegalPageOptions): "print" | "digital" {
  if (template === "copyright-digital") {
    return "digital";
  }
  return options.mode ?? "print";
}

/**
 * Compone la página legal.
 *
 * Orden editorial: identidad de la obra, titularidad, edición, identificadores,
 * responsable de la publicación, impresión, créditos y licencia. Las líneas se
 * emiten como bloques para que la aplicación las mapee al motor de maquetación.
 */
export function buildLegalPage(
  input: LegalPageInput,
  options: LegalPageOptions = {},
): LegalPageResult {
  const warnings: LegalPageWarning[] = [];
  const blocks: LegalPageBlock[] = [];
  const template = input.template;
  if (template === "copyright-minimal" || template === "copyright-creative-commons") {
    const missing = missingLegalFields(input);
    const year = input.copyrightYear ?? parsePublicationDate(input.publicationDate)?.year;
    if (year && clean(input.rightsHolder))
      blocks.push({
        role: "small",
        text: `© ${year} ${clean(input.rightsHolder)}.${template === "copyright-minimal" ? " Todos los derechos reservados." : ""}`,
      });
    if (template === "copyright-creative-commons" && !missing.includes("license")) {
      const license = licenseText(input.license!);
      blocks.push({ role: "small", text: license.label }, { role: "small", text: license.url! });
    }
    for (const clause of input.customClauses ?? [])
      if (clean(clause)) blocks.push({ role: "small", text: clean(clause) });
    return {
      template,
      templateVersion: LEGAL_TEMPLATE_VERSIONS[template],
      blocks,
      ready: missing.length === 0,
      warnings: missing.map((field) => ({
        code: `FALTA_${field.toUpperCase()}`,
        severity: "error",
        field,
        message: `Falta completar: ${field}.`,
      })),
    };
  }
  const mode = templateMode(template, options);
  const includeOptional = options.includeOptionalClauses ?? true;

  const warn = (
    code: string,
    message: string,
    field?: string,
    severity: LegalWarningSeverity = "warning",
  ) => warnings.push({ code, severity, field, message });

  const title = clean(input.title);
  const author = clean(input.author);
  const publicationParts = parsePublicationDate(input.publicationDate);
  const publicationDateText = formatPublicationDate(input.publicationDate);
  const copyrightYear =
    input.copyrightYear ??
    publicationParts?.year ??
    (typeof input.publicationDate === "string"
      ? /^(\d{4})/.exec(input.publicationDate)?.[1]
      : null);

  if (!title) {
    warn("FALTA_TITULO", "La página legal necesita el título de la obra.", "title", "error");
  }
  if (!author) {
    warn("FALTA_AUTOR", "La página legal necesita la autoría de la obra.", "author", "error");
  }

  const rightsHolder = clean(input.rightsHolder);
  if (!rightsHolder) {
    warn(
      "DERECHOS_SIN_TITULAR",
      "No se indicó el titular de derechos; no se imprimirá la línea de copyright.",
      "rightsHolder",
    );
  }
  if (!copyrightYear) {
    warn(
      "DERECHOS_SIN_ANIO",
      "No hay año de copyright ni fecha de publicación; no se imprimirá la línea de copyright.",
      "copyrightYear",
    );
  }

  const isbn = validateIsbn(input.isbn);
  if (input.isbn?.trim() && !isbn.valid) {
    warn(
      "ISBN_INVALIDO",
      `El ISBN no es válido (${isbn.reason ?? "formato desconocido"}).`,
      "isbn",
      "error",
    );
  } else if (!input.isbn?.trim()) {
    warn("ISBN_PENDIENTE", "La obra no tiene ISBN registrado.", "isbn", "info");
  }

  const legalDeposit = clean(input.legalDeposit);
  if (isPeru(template)) {
    if (!legalDeposit && input.legalDepositStatus !== "IN_PROGRESS") {
      warn(
        "DEPOSITO_PENDIENTE",
        "Falta el número de depósito legal; la plantilla peruana no imprimirá una línea vacía.",
        "legalDeposit",
      );
    }
    if (!clean(input.publicationCity)) {
      warn("FALTA_CIUDAD", "Falta la ciudad de publicación.", "publicationCity");
    }
    if (!clean(input.publicationCountry)) {
      warn("FALTA_PAIS", "Falta el país de publicación.", "publicationCountry");
    }
    if (!publicationDateText) {
      warn("FALTA_FECHA", "Falta la fecha o el mes de publicación.", "publicationDate");
    }
  }

  const legalPublisher =
    clean(input.legalPublisher) ||
    (template === "copyright-peru-author" ? author : "") ||
    (template === "copyright-peru-publisher" ? clean(input.publisherName) : "");

  if (isPeru(template) && !legalPublisher) {
    warn("FALTA_RESPONSABLE", "Falta el responsable legal de la publicación.", "legalPublisher");
  }
  if (isPeru(template) && !clean(input.publisherName) && !clean(input.imprint)) {
    warn("FALTA_EDITORIAL", "Falta el sello o la editorial que publica.", "publisherName");
  }
  if (isPeru(template) && !clean(input.address)) {
    warn(
      "FALTA_DIRECCION",
      "Falta la dirección de la editorial para el depósito legal.",
      "address",
    );
  }

  if (mode === "print") {
    if (!clean(input.printer)) {
      warn(
        "FALTA_IMPRENTA",
        "Falta la imprenta; la edición impresa no debería cerrarse.",
        "printer",
      );
    }
    if (!input.printRun || input.printRun < 1) {
      warn("TIRAJE_PENDIENTE", "No se indicó el tiraje de la edición impresa.", "printRun", "info");
    }
  }

  const licenseId = input.license ?? "all-rights-reserved";
  const license = licenseText(licenseId, input.customLicense);
  if (licenseId === "custom" && !license.summary) {
    warn(
      "LICENCIA_SIN_TEXTO",
      "La licencia personalizada no tiene texto.",
      "customLicense",
      "error",
    );
  }

  const edition = clean(input.editionLabel) || editionLabel(input.editionNumber);

  if (clean(input.logoUrl)) {
    blocks.push({ role: "logo", text: clean(input.logoUrl) });
  }
  if (title) {
    blocks.push({ role: "title", text: title });
  }
  if (clean(input.subtitle)) {
    blocks.push({ role: "subtitle", text: clean(input.subtitle) });
  }
  if (author) {
    blocks.push({ role: "author", text: author });
  }
  if (blocks.length > 0) {
    blocks.push({ role: "rule", text: "" });
  }

  if (copyrightYear && rightsHolder) {
    blocks.push({
      role: "small",
      text: `© ${copyrightYear} ${rightsHolder}. Todos los derechos reservados.`,
    });
  }

  const imprint = clean(input.imprint);
  const publisherName = clean(input.publisherName);
  const publisher = imprint || publisherName;

  if (edition) {
    blocks.push({ role: "small", text: sentence(edition) });
  } else if (isPeru(template)) {
    warn("FALTA_EDICION", "Falta el número o la etiqueta de edición.", "editionNumber");
  }

  if (publicationDateText) {
    const place = [clean(input.publicationCity), clean(input.publicationCountry)]
      .filter(Boolean)
      .join(", ");
    blocks.push({
      role: "small",
      text: sentence(place ? `${place}, ${publicationDateText}` : publicationDateText),
    });
  }

  if (isbn.valid) {
    blocks.push({ role: "small", text: `ISBN: ${clean(input.isbn) || isbn.normalized}` });
  } else if (input.isbnStatus === "DECLARED" || input.isbnStatus === "CONFIRMED") {
    warn(
      "ISBN_DECLARADO_SIN_VALOR",
      "El ISBN figura como declarado, pero no hay un valor válido que imprimir.",
      "isbn",
    );
  }

  if (legalDeposit) {
    if (isPeru(template)) {
      blocks.push({
        role: "small",
        text: `Hecho el Depósito Legal en la Biblioteca Nacional del Perú N.º ${legalDeposit}.`,
      });
    } else {
      blocks.push({ role: "small", text: `Depósito legal: ${legalDeposit}.` });
    }
  } else if (isPeru(template) && input.legalDepositStatus === "IN_PROGRESS") {
    blocks.push({ role: "small", text: "Depósito legal en trámite." });
  }

  if (publisher) {
    blocks.push({ role: "small", text: sentence(`Publicado por ${publisher}`) });
  }
  if (legalPublisher && legalPublisher !== publisher) {
    blocks.push({
      role: "small",
      text: sentence(`Responsable de la publicación: ${legalPublisher}`),
    });
  }
  if (clean(input.address)) {
    blocks.push({ role: "small", text: sentence(clean(input.address)) });
  }
  if (clean(input.contactEmail) || clean(input.website)) {
    const contact = [clean(input.contactEmail), clean(input.website)].filter(Boolean).join(" · ");
    blocks.push({ role: "small", text: contact });
  }

  if (mode === "print") {
    if (clean(input.printer)) {
      const run =
        input.printRun && input.printRun > 0 ? ` · Tirada: ${input.printRun} ejemplares` : "";
      blocks.push({ role: "small", text: sentence(`Impreso por ${clean(input.printer)}${run}`) });
    }
  } else {
    const platform = clean(input.digitalPlatform);
    const format = clean(input.formatLabel) || "Edición digital";
    blocks.push({
      role: "small",
      text: sentence(platform ? `${format} publicada en ${platform}` : format),
    });
  }

  const contributors = (input.contributors ?? [])
    .map((contributor) => ({
      role: clean(contributor.role),
      name: clean(contributor.name),
    }))
    .filter((contributor) => contributor.name);

  if (contributors.length > 0) {
    blocks.push({ role: "spacer", text: "" });
    for (const contributor of contributors) {
      blocks.push({
        role: "small",
        text: sentence(
          contributor.role ? `${contributor.role}: ${contributor.name}` : contributor.name,
        ),
      });
    }
  }

  if (clean(input.imageCredits)) {
    blocks.push({
      role: "small",
      text: sentence(`Créditos de imagen: ${clean(input.imageCredits)}`),
    });
  }
  if (clean(input.thirdPartyCredits)) {
    blocks.push({ role: "small", text: sentence(clean(input.thirdPartyCredits)) });
  }

  if (includeOptional && license.summary) {
    blocks.push({ role: "spacer", text: "" });
    blocks.push({ role: "italic", text: sentence(license.summary) });
    if (license.url) {
      blocks.push({ role: "small", text: license.url });
    }
  }

  if (includeOptional && input.fictionDisclaimer) {
    blocks.push({
      role: "small",
      text: sentence(
        "Esta es una obra de ficción. Cualquier parecido con personas, lugares o hechos reales es una coincidencia",
      ),
    });
  }
  if (includeOptional && input.trademarkNotice) {
    blocks.push({
      role: "small",
      text: sentence(
        "Las marcas mencionadas pertenecen a sus respectivos titulares y se citan con fines informativos",
      ),
    });
  }

  if (includeOptional) {
    for (const clause of input.customClauses ?? []) {
      if (clean(clause)) {
        blocks.push({ role: "small", text: sentence(clause) });
      }
    }
  }

  if (clean(input.catalogingInPublication)) {
    blocks.push({ role: "spacer", text: "" });
    blocks.push({ role: "small", text: clean(input.catalogingInPublication) });
  }

  if (template === "copyright-peru-ley") {
    blocks.push({
      role: "small",
      text: "Decreto Legislativo N.º 822 — Ley sobre el Derecho de Autor (Perú).",
    });
    if (!legalDeposit)
      warn("FALTA_DEPOSITO", "Completa el número de depósito legal.", "legalDeposit", "error");
  }
  const ready = !warnings.some((warning) => warning.severity === "error");

  return {
    template,
    templateVersion: LEGAL_TEMPLATE_VERSIONS[template],
    blocks,
    warnings,
    ready,
  };
}

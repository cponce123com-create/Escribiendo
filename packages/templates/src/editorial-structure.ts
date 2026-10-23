import { z } from "zod";
import type { TocDepth } from "./table-of-contents";

/**
 * Estructura editorial de un libro.
 *
 * Distingue tres zonas:
 *  - preliminares (`front`), antes del cuerpo;
 *  - cuerpo (`body`), formado por las secciones del manuscrito;
 *  - finales (`back`), después del cuerpo.
 *
 * El cuerpo no se configura aquí: su orden lo manda `editorialOrder` en la
 * aplicación. Este módulo solo describe las materias que rodean al cuerpo y
 * cómo se obtiene su contenido.
 */

export const editorialMatterKinds = [
  "HALF_TITLE",
  "TITLE_PAGE",
  "COPYRIGHT",
  "CREDITS",
  "DEDICATION",
  "EPIGRAPH",
  "TABLE_OF_CONTENTS",
  "LIST_OF_ILLUSTRATIONS",
  "LIST_OF_TABLES",
  "FOREWORD",
  "PREFACE",
  "PROLOGUE",
  "INTRODUCTION",
  "EPILOGUE",
  "CONCLUSION",
  "APPENDIX",
  "ANNEX",
  "GLOSSARY",
  "BIBLIOGRAPHY",
  "ANALYTICAL_INDEX",
  "ACKNOWLEDGMENTS",
  "ABOUT_AUTHOR",
  "OTHER_BOOKS",
  "COLOPHON",
] as const;

export type EditorialMatterKind = (typeof editorialMatterKinds)[number];

export const editorialMatterKindSchema = z.enum(editorialMatterKinds);

export const editorialMatterModes = [
  "AUTOMATIC",
  "TEMPLATE",
  "CUSTOM",
  "MANUAL",
  "DISABLED",
] as const;

export type EditorialMatterMode = (typeof editorialMatterModes)[number];

export const editorialMatterModeSchema = z.enum(editorialMatterModes);

/** Tipos de sección que pueden alojar una materia narrativa. */
export const editorialSectionTypes = [
  "FOREWORD",
  "PREFACE",
  "PROLOGUE",
  "INTRODUCTION",
  "EPILOGUE",
  "CONCLUSION",
  "ACKNOWLEDGMENTS",
  "APPENDIX",
  "ANNEX",
  "GLOSSARY",
  "BIBLIOGRAPHY",
  "ANALYTICAL_INDEX",
  "ABOUT_AUTHOR",
  "OTHER_BOOKS",
  "CUSTOM",
] as const;

export type EditorialSectionType = (typeof editorialSectionTypes)[number];

export type EditorialMatterGroup = "front" | "back";

export interface EditorialMatterDefinition {
  kind: EditorialMatterKind;
  group: EditorialMatterGroup;
  label: string;
  description: string;
  /** Orden convencional dentro del grupo. */
  order: number;
  /** `optional` significa desactivado salvo que el preset o el autor lo activen. */
  defaultEnabled: boolean | "optional";
  defaultMode: EditorialMatterMode;
  /** Necesita una sección propia para tener contenido editable. */
  requiresSection: boolean;
  /** Se compone desde metadatos, sin texto libre del autor. */
  automatic: boolean;
  /** Puede listarse en el índice. */
  tocEligible: boolean;
  /** Plantilla de sistema sugerida. */
  defaultTemplate?: string;
  defaultTitle?: string;
  /** Sección que se crea o enlaza cuando la materia es narrativa. */
  sectionType?: EditorialSectionType;
  /** Campos de metadatos que la plantilla necesita para no quedar incompleta. */
  requiredMetadata?: readonly string[];
}

const DEFINITIONS: Record<EditorialMatterKind, EditorialMatterDefinition> = {
  HALF_TITLE: {
    kind: "HALF_TITLE",
    group: "front",
    label: "Portadilla",
    description: "Página con el título escueto, sin datos de edición.",
    order: 0,
    defaultEnabled: "optional",
    defaultMode: "AUTOMATIC",
    requiresSection: false,
    automatic: true,
    tocEligible: false,
  },
  TITLE_PAGE: {
    kind: "TITLE_PAGE",
    group: "front",
    label: "Portada",
    description: "Título, subtítulo, autoría y sello.",
    order: 10,
    defaultEnabled: true,
    defaultMode: "AUTOMATIC",
    requiresSection: false,
    automatic: true,
    tocEligible: false,
    defaultTemplate: "title-classic",
    requiredMetadata: ["title"],
  },
  COPYRIGHT: {
    kind: "COPYRIGHT",
    group: "front",
    label: "Página de derechos",
    description: "Créditos legales, copyright, ISBN, depósito legal y edición.",
    order: 20,
    defaultEnabled: true,
    defaultMode: "TEMPLATE",
    requiresSection: false,
    automatic: false,
    tocEligible: false,
    defaultTemplate: "copyright-peru-author",
    requiredMetadata: ["rightsHolder", "publicationYear"],
  },
  CREDITS: {
    kind: "CREDITS",
    group: "front",
    label: "Créditos",
    description: "Edición, corrección, diseño, ilustración y demás créditos.",
    order: 30,
    defaultEnabled: "optional",
    defaultMode: "TEMPLATE",
    requiresSection: false,
    automatic: false,
    tocEligible: false,
    defaultTemplate: "credits-standard",
  },
  DEDICATION: {
    kind: "DEDICATION",
    group: "front",
    label: "Dedicatoria",
    description: "Texto breve dedicado a una persona o causa.",
    order: 40,
    defaultEnabled: "optional",
    defaultMode: "TEMPLATE",
    requiresSection: false,
    automatic: false,
    tocEligible: true,
    defaultTemplate: "dedication-classic",
  },
  EPIGRAPH: {
    kind: "EPIGRAPH",
    group: "front",
    label: "Epígrafe",
    description: "Cita de apertura con atribución opcional.",
    order: 50,
    defaultEnabled: "optional",
    defaultMode: "TEMPLATE",
    requiresSection: false,
    automatic: false,
    tocEligible: true,
    defaultTemplate: "epigraph-classic",
  },
  TABLE_OF_CONTENTS: {
    kind: "TABLE_OF_CONTENTS",
    group: "front",
    label: "Índice",
    description: "Índice generado desde la estructura y las páginas compuestas.",
    order: 60,
    defaultEnabled: true,
    defaultMode: "AUTOMATIC",
    requiresSection: false,
    automatic: true,
    tocEligible: false,
    defaultTemplate: "toc-standard",
  },
  LIST_OF_ILLUSTRATIONS: {
    kind: "LIST_OF_ILLUSTRATIONS",
    group: "front",
    label: "Índice de ilustraciones",
    description: "Lista de figuras con su página o referencia.",
    order: 70,
    defaultEnabled: "optional",
    defaultMode: "AUTOMATIC",
    requiresSection: false,
    automatic: true,
    tocEligible: true,
    defaultTemplate: "toc-standard",
  },
  LIST_OF_TABLES: {
    kind: "LIST_OF_TABLES",
    group: "front",
    label: "Índice de tablas",
    description: "Lista de tablas con su página o referencia.",
    order: 80,
    defaultEnabled: "optional",
    defaultMode: "AUTOMATIC",
    requiresSection: false,
    automatic: true,
    tocEligible: true,
    defaultTemplate: "toc-standard",
  },
  FOREWORD: {
    kind: "FOREWORD",
    group: "front",
    label: "Presentación",
    description: "Texto de otra persona que presenta la obra.",
    order: 90,
    defaultEnabled: "optional",
    defaultMode: "MANUAL",
    requiresSection: true,
    automatic: false,
    tocEligible: true,
    sectionType: "FOREWORD",
  },
  PREFACE: {
    kind: "PREFACE",
    group: "front",
    label: "Prefacio",
    description: "Advertencia o nota preliminar del autor.",
    order: 100,
    defaultEnabled: "optional",
    defaultMode: "MANUAL",
    requiresSection: true,
    automatic: false,
    tocEligible: true,
    sectionType: "PREFACE",
  },
  PROLOGUE: {
    kind: "PROLOGUE",
    group: "front",
    label: "Prólogo",
    description: "Texto narrativo que abre la obra.",
    order: 110,
    defaultEnabled: "optional",
    defaultMode: "MANUAL",
    requiresSection: true,
    automatic: false,
    tocEligible: true,
    sectionType: "PROLOGUE",
  },
  INTRODUCTION: {
    kind: "INTRODUCTION",
    group: "front",
    label: "Introducción",
    description: "Entrada al contenido, habitual en ensayo y manual.",
    order: 120,
    defaultEnabled: "optional",
    defaultMode: "MANUAL",
    requiresSection: true,
    automatic: false,
    tocEligible: true,
    sectionType: "INTRODUCTION",
  },
  EPILOGUE: {
    kind: "EPILOGUE",
    group: "back",
    label: "Epílogo",
    description: "Cierre narrativo posterior al cuerpo.",
    order: 200,
    defaultEnabled: "optional",
    defaultMode: "MANUAL",
    requiresSection: true,
    automatic: false,
    tocEligible: true,
    sectionType: "EPILOGUE",
  },
  CONCLUSION: {
    kind: "CONCLUSION",
    group: "back",
    label: "Conclusión",
    description: "Cierre argumental de un ensayo o estudio.",
    order: 210,
    defaultEnabled: "optional",
    defaultMode: "MANUAL",
    requiresSection: true,
    automatic: false,
    tocEligible: true,
    sectionType: "CONCLUSION",
  },
  ACKNOWLEDGMENTS: {
    kind: "ACKNOWLEDGMENTS",
    group: "back",
    label: "Agradecimientos",
    description: "Reconocimientos al final del libro.",
    order: 220,
    defaultEnabled: "optional",
    defaultMode: "MANUAL",
    requiresSection: true,
    automatic: false,
    tocEligible: true,
    sectionType: "ACKNOWLEDGMENTS",
  },
  APPENDIX: {
    kind: "APPENDIX",
    group: "back",
    label: "Apéndice",
    description: "Material complementario del autor.",
    order: 230,
    defaultEnabled: "optional",
    defaultMode: "MANUAL",
    requiresSection: true,
    automatic: false,
    tocEligible: true,
    sectionType: "APPENDIX",
  },
  ANNEX: {
    kind: "ANNEX",
    group: "back",
    label: "Anexo",
    description: "Documento o material adjunto.",
    order: 240,
    defaultEnabled: "optional",
    defaultMode: "MANUAL",
    requiresSection: true,
    automatic: false,
    tocEligible: true,
    sectionType: "ANNEX",
  },
  GLOSSARY: {
    kind: "GLOSSARY",
    group: "back",
    label: "Glosario",
    description: "Términos y definiciones.",
    order: 250,
    defaultEnabled: "optional",
    defaultMode: "MANUAL",
    requiresSection: true,
    automatic: false,
    tocEligible: true,
    sectionType: "GLOSSARY",
  },
  BIBLIOGRAPHY: {
    kind: "BIBLIOGRAPHY",
    group: "back",
    label: "Bibliografía",
    description: "Fuentes consultadas o recomendadas.",
    order: 260,
    defaultEnabled: "optional",
    defaultMode: "MANUAL",
    requiresSection: true,
    automatic: false,
    tocEligible: true,
    sectionType: "BIBLIOGRAPHY",
  },
  ANALYTICAL_INDEX: {
    kind: "ANALYTICAL_INDEX",
    group: "back",
    label: "Índice analítico",
    description: "Entradas de materias y nombres con referencias.",
    order: 270,
    defaultEnabled: "optional",
    defaultMode: "AUTOMATIC",
    requiresSection: false,
    automatic: true,
    tocEligible: true,
    defaultTemplate: "toc-standard",
  },
  ABOUT_AUTHOR: {
    kind: "ABOUT_AUTHOR",
    group: "back",
    label: "Sobre el autor",
    description: "Biografía breve y datos de contacto profesional.",
    order: 280,
    defaultEnabled: "optional",
    defaultMode: "TEMPLATE",
    requiresSection: false,
    automatic: false,
    tocEligible: true,
    defaultTemplate: "about-author-standard",
  },
  OTHER_BOOKS: {
    kind: "OTHER_BOOKS",
    group: "back",
    label: "Otras obras",
    description: "Lista de títulos del mismo autor o sello.",
    order: 290,
    defaultEnabled: "optional",
    defaultMode: "TEMPLATE",
    requiresSection: false,
    automatic: false,
    tocEligible: true,
    defaultTemplate: "other-books-list",
  },
  COLOPHON: {
    kind: "COLOPHON",
    group: "back",
    label: "Colofón",
    description: "Datos técnicos de la impresión y cierre de la edición.",
    order: 300,
    defaultEnabled: "optional",
    defaultMode: "AUTOMATIC",
    requiresSection: false,
    automatic: true,
    tocEligible: false,
    defaultTemplate: "colophon-standard",
  },
};

/** Definiciones en orden convencional, para menús y depuración. */
export const EDITORIAL_MATTER_DEFINITIONS: readonly EditorialMatterDefinition[] =
  editorialMatterKinds.map((kind) => DEFINITIONS[kind]).sort((a, b) => a.order - b.order);

export function editorialMatterDefinition(kind: EditorialMatterKind): EditorialMatterDefinition {
  return DEFINITIONS[kind];
}

/**
 * Catálogo versionado de plantillas de materia.
 *
 * Cambiar el contenido de una plantilla obliga a subir su versión: así una
 * edición ya compuesta puede seguir reproduciéndose con la versión que usó.
 */
export const MATTER_TEMPLATE_VERSIONS = {
  "title-classic": 1,
  "title-minimal": 1,
  "copyright-peru-author": 1,
  "copyright-peru-publisher": 1,
  "copyright-international": 1,
  "copyright-digital": 1,
  "copyright-minimal": 1,
  "copyright-creative-commons": 1,
  "copyright-peru-ley": 1,
  "credits-standard": 1,
  "dedication-classic": 1,
  "dedication-minimal": 1,
  "dedication-literary": 1,
  "epigraph-classic": 1,
  "epigraph-minimal": 1,
  "toc-standard": 1,
  "toc-detailed": 1,
  "about-author-standard": 1,
  "other-books-list": 1,
  "colophon-standard": 1,
} as const;

export type MatterTemplateSlug = keyof typeof MATTER_TEMPLATE_VERSIONS;

export function matterTemplateVersion(slug: string): number | undefined {
  return MATTER_TEMPLATE_VERSIONS[slug as MatterTemplateSlug];
}

export interface EditorialPresetSlot {
  kind: EditorialMatterKind;
  enabled?: boolean;
  mode?: EditorialMatterMode;
  required?: boolean;
  title?: string;
}

export interface EditorialPreset {
  slug: string;
  name: string;
  description: string;
  /** Plantilla tipográfica de sistema recomendada. */
  templateSlug: string;
  tocDepth: TocDepth;
  frontMatterStyle: "minimal" | "classic" | "literary" | "technical";
  bodyStartOnPageOne: boolean;
  slots: readonly EditorialPresetSlot[];
}

/**
 * Presets profesionales.
 *
 * No son plantillas tipográficas: describen qué materias rodean al cuerpo.
 * La tipografía se elige por separado con `EditorialTemplate`.
 */
export const EDITORIAL_PRESETS: readonly EditorialPreset[] = [
  {
    slug: "novela-estandar",
    name: "Novela estándar",
    description: "Preliminares sobrios, índice de capítulos y cierre con colofón.",
    templateSlug: "novela",
    tocDepth: "chapters-h1",
    frontMatterStyle: "classic",
    bodyStartOnPageOne: true,
    slots: [
      { kind: "HALF_TITLE", enabled: true },
      { kind: "TITLE_PAGE", enabled: true, required: true },
      { kind: "COPYRIGHT", enabled: true, required: true },
      { kind: "DEDICATION", enabled: false },
      { kind: "EPIGRAPH", enabled: false },
      { kind: "TABLE_OF_CONTENTS", enabled: true },
      { kind: "PROLOGUE", enabled: false },
      { kind: "ACKNOWLEDGMENTS", enabled: false },
      { kind: "ABOUT_AUTHOR", enabled: true },
      { kind: "COLOPHON", enabled: true },
    ],
  },
  {
    slug: "novela-literaria",
    name: "Novela literaria",
    description: "Epígrafe y dedicatoria antes del índice; cierre con epílogo opcional.",
    templateSlug: "novela",
    tocDepth: "chapters-h1",
    frontMatterStyle: "literary",
    bodyStartOnPageOne: true,
    slots: [
      { kind: "HALF_TITLE", enabled: true },
      { kind: "TITLE_PAGE", enabled: true, required: true },
      { kind: "COPYRIGHT", enabled: true, required: true },
      { kind: "EPIGRAPH", enabled: true },
      { kind: "DEDICATION", enabled: true },
      { kind: "TABLE_OF_CONTENTS", enabled: true },
      { kind: "PROLOGUE", enabled: false },
      { kind: "EPILOGUE", enabled: false },
      { kind: "ACKNOWLEDGMENTS", enabled: true },
      { kind: "ABOUT_AUTHOR", enabled: true },
      { kind: "COLOPHON", enabled: true },
    ],
  },
  {
    slug: "ensayo-academico",
    name: "Ensayo académico",
    description: "Índice detallado, presentación, introducción, bibliografía e índice analítico.",
    templateSlug: "ensayo",
    tocDepth: "chapters-h1-h2",
    frontMatterStyle: "technical",
    bodyStartOnPageOne: true,
    slots: [
      { kind: "HALF_TITLE", enabled: true },
      { kind: "TITLE_PAGE", enabled: true, required: true },
      { kind: "COPYRIGHT", enabled: true, required: true },
      { kind: "TABLE_OF_CONTENTS", enabled: true, required: true },
      { kind: "FOREWORD", enabled: false },
      { kind: "PREFACE", enabled: true },
      { kind: "INTRODUCTION", enabled: true },
      { kind: "CONCLUSION", enabled: true },
      { kind: "BIBLIOGRAPHY", enabled: true, required: true },
      { kind: "ANALYTICAL_INDEX", enabled: false },
      { kind: "ABOUT_AUTHOR", enabled: true },
    ],
  },
  {
    slug: "poesia",
    name: "Poesía",
    description: "Preliminares breves, índice de poemas y notas finales.",
    templateSlug: "poesia",
    tocDepth: "chapters-h1",
    frontMatterStyle: "minimal",
    bodyStartOnPageOne: true,
    slots: [
      { kind: "HALF_TITLE", enabled: true },
      { kind: "TITLE_PAGE", enabled: true, required: true },
      { kind: "COPYRIGHT", enabled: true, required: true },
      { kind: "DEDICATION", enabled: true },
      { kind: "EPIGRAPH", enabled: true },
      { kind: "TABLE_OF_CONTENTS", enabled: true },
      { kind: "ACKNOWLEDGMENTS", enabled: false },
      { kind: "ABOUT_AUTHOR", enabled: true },
      { kind: "COLOPHON", enabled: true },
    ],
  },
  {
    slug: "cuento-antologia",
    name: "Cuento o antología",
    description: "Presentación, índice de relatos y cierre con notas del autor.",
    templateSlug: "novela",
    tocDepth: "chapters-h1",
    frontMatterStyle: "classic",
    bodyStartOnPageOne: true,
    slots: [
      { kind: "HALF_TITLE", enabled: true },
      { kind: "TITLE_PAGE", enabled: true, required: true },
      { kind: "COPYRIGHT", enabled: true, required: true },
      { kind: "DEDICATION", enabled: true },
      { kind: "TABLE_OF_CONTENTS", enabled: true, required: true },
      { kind: "FOREWORD", enabled: false },
      { kind: "ACKNOWLEDGMENTS", enabled: true },
      { kind: "ABOUT_AUTHOR", enabled: true },
    ],
  },
  {
    slug: "infantil",
    name: "Infantil",
    description: "Preliminares mínimos, letra amplia y sin índice por defecto.",
    templateSlug: "novela",
    tocDepth: "chapters-h1",
    frontMatterStyle: "minimal",
    bodyStartOnPageOne: true,
    slots: [
      { kind: "TITLE_PAGE", enabled: true, required: true },
      { kind: "COPYRIGHT", enabled: true, required: true },
      { kind: "DEDICATION", enabled: true },
      { kind: "TABLE_OF_CONTENTS", enabled: false },
      { kind: "OTHER_BOOKS", enabled: true },
      { kind: "ABOUT_AUTHOR", enabled: true },
    ],
  },
  {
    slug: "manual-tecnico",
    name: "Manual técnico",
    description: "Índices de figuras y tablas, apéndices, glosario y bibliografía.",
    templateSlug: "manual",
    tocDepth: "chapters-h1-h2-h3",
    frontMatterStyle: "technical",
    bodyStartOnPageOne: false,
    slots: [
      { kind: "HALF_TITLE", enabled: true },
      { kind: "TITLE_PAGE", enabled: true, required: true },
      { kind: "COPYRIGHT", enabled: true, required: true },
      { kind: "TABLE_OF_CONTENTS", enabled: true, required: true },
      { kind: "LIST_OF_ILLUSTRATIONS", enabled: true },
      { kind: "LIST_OF_TABLES", enabled: true },
      { kind: "PREFACE", enabled: true },
      { kind: "INTRODUCTION", enabled: true },
      { kind: "APPENDIX", enabled: true },
      { kind: "ANNEX", enabled: false },
      { kind: "GLOSSARY", enabled: true },
      { kind: "BIBLIOGRAPHY", enabled: true },
      { kind: "ANALYTICAL_INDEX", enabled: true },
      { kind: "ABOUT_AUTHOR", enabled: false },
    ],
  },
  {
    slug: "edicion-digital",
    name: "Edición digital",
    description: "Sin datos de imprenta, con colofón digital y navegación semántica.",
    templateSlug: "ensayo",
    tocDepth: "chapters-h1-h2",
    frontMatterStyle: "minimal",
    bodyStartOnPageOne: true,
    slots: [
      { kind: "TITLE_PAGE", enabled: true, required: true },
      { kind: "COPYRIGHT", enabled: true, required: true },
      { kind: "TABLE_OF_CONTENTS", enabled: true, required: true },
      { kind: "DEDICATION", enabled: false },
      { kind: "EPIGRAPH", enabled: false },
      { kind: "BIBLIOGRAPHY", enabled: false },
      { kind: "ABOUT_AUTHOR", enabled: true },
      { kind: "OTHER_BOOKS", enabled: true },
      { kind: "COLOPHON", enabled: true },
    ],
  },
];

export const DEFAULT_EDITORIAL_PRESET = "novela-estandar";

export function getEditorialPreset(slug?: string | null): EditorialPreset {
  const found = EDITORIAL_PRESETS.find((preset) => preset.slug === slug);
  return found ?? EDITORIAL_PRESETS[0]!;
}

export interface EditorialMatterOverride {
  enabled?: boolean;
  mode?: EditorialMatterMode;
  title?: string | null;
  showInToc?: boolean;
  includeInExport?: boolean;
}

export interface EditorialMatterSlot {
  kind: EditorialMatterKind;
  group: EditorialMatterGroup;
  title: string;
  mode: EditorialMatterMode;
  enabled: boolean;
  required: boolean;
  sectionType: EditorialSectionType | null;
  templateSlug: string | null;
  templateVersion: number | null;
  showInToc: boolean;
  includeInExport: boolean;
  sortOrder: number;
}

export interface EditorialStructure {
  preset: EditorialPreset;
  front: EditorialMatterSlot[];
  back: EditorialMatterSlot[];
}

export interface ResolveEditorialStructureOptions {
  preset?: string | null;
  overrides?: Readonly<Partial<Record<EditorialMatterKind, EditorialMatterOverride>>>;
}

/**
 * Resuelve la estructura efectiva de un libro.
 *
 * El preset aporta el esqueleto; las preferencias guardadas solo pueden
 * activar, desactivar o retitular materias, nunca reordenar el cuerpo.
 */
export function resolveEditorialStructure(
  options: ResolveEditorialStructureOptions = {},
): EditorialStructure {
  const preset = getEditorialPreset(options.preset);
  const overrides = options.overrides ?? {};
  const front: EditorialMatterSlot[] = [];
  const back: EditorialMatterSlot[] = [];

  preset.slots.forEach((slot, index) => {
    const definition = editorialMatterDefinition(slot.kind);
    const override = overrides[slot.kind];
    const required = slot.required ?? false;
    const enabledByDefault =
      slot.enabled ??
      (definition.defaultEnabled === true || definition.defaultEnabled === "optional");
    const enabled = required ? true : (override?.enabled ?? enabledByDefault);
    const mode = override?.mode ?? slot.mode ?? definition.defaultMode;
    const templateSlug = definition.defaultTemplate ?? null;

    const resolved: EditorialMatterSlot = {
      kind: slot.kind,
      group: definition.group,
      title: override?.title?.trim() || slot.title || definition.defaultTitle || definition.label,
      mode,
      enabled,
      required,
      sectionType: definition.sectionType ?? null,
      templateSlug,
      templateVersion: templateSlug ? (matterTemplateVersion(templateSlug) ?? 1) : null,
      showInToc: override?.showInToc ?? definition.tocEligible,
      includeInExport: override?.includeInExport ?? true,
      sortOrder: index * 10,
    };

    if (definition.group === "front") {
      front.push(resolved);
    } else {
      back.push(resolved);
    }
  });

  return { preset, front, back };
}

export type EditorialDiagnosticSeverity = "info" | "warning" | "error";

export interface EditorialDiagnostic {
  code: string;
  severity: EditorialDiagnosticSeverity;
  kind?: EditorialMatterKind;
  message: string;
}

export interface EditorialStructureContext {
  hasBodySections: boolean;
  hasRightsHolder: boolean;
  hasIsbn: boolean;
  hasPublicationYear: boolean;
  /** Materias narrativas que ya tienen una sección enlazada. */
  linkedSections?: Readonly<Partial<Record<EditorialMatterKind, boolean>>>;
}

/**
 * Revisa la estructura antes de componer.
 *
 * Son avisos de preparación editorial, no errores de datos: el autor puede
 * exportar con campos pendientes, pero debe saber qué falta.
 */
export function auditEditorialStructure(
  structure: EditorialStructure,
  context: EditorialStructureContext,
): EditorialDiagnostic[] {
  const diagnostics: EditorialDiagnostic[] = [];
  const all = [...structure.front, ...structure.back];
  const byKind = new Map<EditorialMatterKind, EditorialMatterSlot>();

  for (const slot of all) {
    if (byKind.has(slot.kind)) {
      diagnostics.push({
        code: "KIND_DUPLICADO",
        severity: "error",
        kind: slot.kind,
        message: `La materia ${slot.title} aparece más de una vez en la estructura.`,
      });
    }
    byKind.set(slot.kind, slot);
  }

  const toc = byKind.get("TABLE_OF_CONTENTS");

  if (toc?.enabled && !context.hasBodySections) {
    diagnostics.push({
      code: "INDICE_SIN_CUERPO",
      severity: "warning",
      kind: "TABLE_OF_CONTENTS",
      message: "El índice está activo pero el libro todavía no tiene secciones de cuerpo.",
    });
  }

  if (!toc?.enabled && context.hasBodySections) {
    diagnostics.push({
      code: "INDICE_DESACTIVADO",
      severity: "info",
      kind: "TABLE_OF_CONTENTS",
      message: "El libro tiene cuerpo pero el índice está desactivado.",
    });
  }

  const copyright = byKind.get("COPYRIGHT");
  if (copyright?.enabled) {
    if (!context.hasRightsHolder) {
      diagnostics.push({
        code: "DERECHOS_SIN_TITULAR",
        severity: "warning",
        kind: "COPYRIGHT",
        message: "Falta el titular de derechos para completar la página legal.",
      });
    }
    if (!context.hasPublicationYear) {
      diagnostics.push({
        code: "DERECHOS_SIN_ANIO",
        severity: "warning",
        kind: "COPYRIGHT",
        message: "Falta el año de publicación para completar la página legal.",
      });
    }
    if (!context.hasIsbn) {
      diagnostics.push({
        code: "DERECHOS_SIN_ISBN",
        severity: "warning",
        kind: "COPYRIGHT",
        message: "No hay ISBN registrado. La página legal puede completarse después.",
      });
    }
  }

  for (const slot of all) {
    if (!slot.enabled || !slot.sectionType) {
      continue;
    }
    if (slot.mode === "MANUAL" && !context.linkedSections?.[slot.kind]) {
      diagnostics.push({
        code: "MATERIA_SIN_SECCION",
        severity: "warning",
        kind: slot.kind,
        message: `${slot.title} está activo pero no tiene una sección enlazada.`,
      });
    }
  }

  const halfTitle = byKind.get("HALF_TITLE");
  const titlePage = byKind.get("TITLE_PAGE");
  if (halfTitle?.enabled && !titlePage?.enabled) {
    diagnostics.push({
      code: "PORTADILLA_SIN_PORTADA",
      severity: "info",
      kind: "HALF_TITLE",
      message: "Hay portadilla pero no portada; revisa la apertura del libro.",
    });
  }

  return diagnostics;
}

/** Estructura aplanada en orden de composición. */
export function flattenEditorialStructure(structure: EditorialStructure): EditorialMatterSlot[] {
  return [...structure.front, ...structure.back];
}

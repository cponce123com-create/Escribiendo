import { z } from "zod";
import { tocDepthSchema } from "./table-of-contents";
export const tocTemplateSlugs = [
  "toc-standard",
  "toc-detailed",
  "toc-minimal",
  "toc-numbered",
  "toc-parts",
  "toc-compact",
] as const;
export type TocTemplateSlug = (typeof tocTemplateSlugs)[number];
export const tocTemplateSchema = z.enum(tocTemplateSlugs);
export const tocParametersSchema = z.object({
  tocTemplate: tocTemplateSchema.default("toc-standard"),
  tocTitle: z.enum(["Índice", "Contenido", "Tabla de contenidos"]).default("Índice"),
  tocAlignment: z.enum(["left", "center", "right"]).default("left"),
  tocPageNumbers: z.boolean().default(true),
  tocLeaders: z.boolean().default(true),
  tocDepth: tocDepthSchema.default("chapters-h1"),
  tocIncludeFrontMatter: z.boolean().default(true),
  tocIncludeBackMatter: z.boolean().default(true),
});
export type TocParameters = z.infer<typeof tocParametersSchema>;
const defaults = tocParametersSchema.parse({});
export const TOC_TEMPLATE_CATALOG: readonly {
  slug: TocTemplateSlug;
  version: number;
  name: string;
  description: string;
  parameters: TocParameters;
}[] = [
  {
    slug: "toc-standard",
    version: 2,
    name: "Clásico",
    description: "Títulos, puntos guía y folios al margen derecho.",
    parameters: { ...defaults, tocTemplate: "toc-standard" },
  },
  {
    slug: "toc-detailed",
    version: 2,
    name: "Detallado",
    description: "Capítulos y apartados con sangría por nivel.",
    parameters: { ...defaults, tocTemplate: "toc-detailed", tocDepth: "chapters-h1-h2-h3" },
  },
  {
    slug: "toc-minimal",
    version: 1,
    name: "Esencial",
    description: "Solo títulos centrados, sin folios ni puntos.",
    parameters: {
      ...defaults,
      tocTemplate: "toc-minimal",
      tocAlignment: "center",
      tocPageNumbers: false,
      tocLeaders: false,
    },
  },
  {
    slug: "toc-numbered",
    version: 1,
    name: "Capítulos numerados",
    description: "Numeración correlativa delante de cada capítulo.",
    parameters: { ...defaults, tocTemplate: "toc-numbered" },
  },
  {
    slug: "toc-parts",
    version: 1,
    name: "Por partes",
    description: "Partes como cabeceras y capítulos debajo.",
    parameters: { ...defaults, tocTemplate: "toc-parts", tocDepth: "parts-chapters" },
  },
  {
    slug: "toc-compact",
    version: 1,
    name: "Compacto",
    description: "Dos niveles, cuerpo reducido y espaciado breve.",
    parameters: { ...defaults, tocTemplate: "toc-compact", tocDepth: "chapters-h1" },
  },
];
export function tocParametersFrom(settings: unknown): TocParameters {
  const raw =
    settings !== null && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  const slug = tocTemplateSchema.safeParse(raw.tocTemplate);
  const preset = TOC_TEMPLATE_CATALOG.find(
    (item) => item.slug === (slug.success ? slug.data : "toc-standard"),
  )!.parameters;
  const result = tocParametersSchema.safeParse({
    ...preset,
    ...Object.fromEntries(
      Object.keys(defaults)
        .filter((key) => key in raw)
        .map((key) => [key, raw[key]]),
    ),
  });
  return result.success ? result.data : preset;
}

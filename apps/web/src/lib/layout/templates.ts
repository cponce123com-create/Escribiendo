import "server-only";
import { prisma } from "@/lib/db";
import { SYSTEM_TEMPLATES } from "@escribiendo/templates";

/**
 * Instalación de las plantillas de sistema.
 *
 * Son un catálogo cerrado que acompaña al código: se instalan en la base de
 * datos la primera vez que se abre la maquetación de un estudio y a partir de
 * ahí se reutilizan. La operación es idempotente, así que puede ejecutarse
 * en cada visita sin miedo.
 */
export async function ensureSystemTemplates(): Promise<void> {
  const existing = await prisma.editorialTemplate.findMany({
    where: { workspaceId: null, deletedAt: null },
    select: { slug: true },
  });

  const installed = new Set(existing.map((template) => template.slug));
  const missing = SYSTEM_TEMPLATES.filter((template) => !installed.has(template.slug));

  if (missing.length === 0) {
    return;
  }

  await prisma.editorialTemplate.createMany({
    data: missing.map((template) => ({
      workspaceId: null,
      name: template.name,
      slug: template.slug,
      description: template.description,
      config: template.config,
      isSystem: true,
    })),
  });
}

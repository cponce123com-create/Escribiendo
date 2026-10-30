"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@escribiendo/database";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/auth/audit";
import { assertCanPerform } from "@/lib/books/permissions";
import { recomputeBookTotals } from "@/lib/books/statistics";
import { editorialOrder } from "@/lib/books/reading-order";
import { revalidatePath } from "next/cache";
import { tieneControlesIlegales } from "@escribiendo/shared";
import type { ActionState } from "@/lib/action-state";
import { beginStoryAction } from "../action-helpers";
import { PLAN_KIND_VALUES, PLAN_STATUS_VALUES } from "../labels";
import { MAX_PLAN_ITEMS, planOrder, movePlan, validParent, PlanError } from "./structure";
import { manuscriptKey } from "./queries";
const field = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\r\n?/gu, "\n").trim())
    .pipe(
      z
        .string()
        .max(max, `Máximo ${max} caracteres.`)
        .refine((s) => !tieneControlesIlegales(s), "El texto contiene caracteres no permitidos."),
    );
const optionalId = z.union([z.uuid(), z.literal("")]).default("");
const schema = z.object({
  template: z.enum(["THREE_ACTS", "FIVE_PARTS"]).default("THREE_ACTS"),
  chapterCount: z.coerce.number().int().min(0).max(100).default(0),
  operation: z.enum(["save", "move", "status", "delete", "import", "apply", "template"]),
  bookId: z.uuid(),
  version: z.coerce.number().int().min(0).max(2147483646),
  sourceKey: z.string().regex(/^[a-f0-9]{64}$/u),
  id: optionalId,
  parentId: optionalId,
  beforeId: optionalId,
  sectionId: optionalId,
  title: field(300).default(""),
  summary: field(20000).default(""),
  goal: field(3000).default(""),
  conflict: field(3000).default(""),
  outcome: field(3000).default(""),
  kind: z.enum(PLAN_KIND_VALUES).default("CHAPTER"),
  status: z.enum(PLAN_STATUS_VALUES).default("IDEA"),
  targetWords: z.union([z.literal(""), z.coerce.number().int().min(1).max(100000)]).default(""),
});
const NARRATIVE = new Set(["PART", "CHAPTER", "PROLOGUE", "EPILOGUE"]);
function assertLink(kind: string, type: string) {
  if (!(
    (kind === "ACT" && type === "PART") ||
    (kind === "CHAPTER" && NARRATIVE.has(type) && type !== "PART")
  ))
    throw new PlanError(
      "Solo las partes y los capítulos pueden vincularse a una sección narrativa del mismo tipo.",
    );
}
export async function modularPlanAction(_: ActionState, form: FormData): Promise<ActionState> {
  const start = await beginStoryAction();
  if (!start.ok) return start.state;
  const { session, context } = start;
  assertCanPerform(session.workspace.role, "story:manage");
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Revisa los campos del tablero.",
    };
  const v = parsed.data;
  if (v.operation === "apply") {
    try {
      assertCanPerform(session.workspace.role, "section:create");
      assertCanPerform(session.workspace.role, "section:move");
    } catch {
      return {
        status: "error",
        message: "No tienes permisos para aplicar la estructura al manuscrito.",
      };
    }
  }
  try {
    const message = await prisma.$transaction(
      async (tx) => {
        const claimed = await tx.book.updateMany({
          where: {
            id: v.bookId,
            workspaceId: session.workspace.id,
            deletedAt: null,
            narrativeVersion: v.version,
          },
          data: { narrativeVersion: { increment: 1 } },
        });
        if (claimed.count !== 1)
          throw new PlanError(
            "El libro no está disponible o el plan cambió en otra pestaña. Recarga antes de guardar.",
          );
        const rows = await tx.storyPlanItem.findMany({
          where: { bookId: v.bookId, workspaceId: session.workspace.id, deletedAt: null },
          take: MAX_PLAN_ITEMS + 1,
        });
        const nodes = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
        planOrder(nodes);
        const item = nodes.find((n) => n.id === v.id);
        if (["move", "status", "delete"].includes(v.operation) && !item)
          throw new PlanError("La tarjeta no pertenece a este libro.");
        if (v.operation === "template") {
          if (nodes.length)
            throw new PlanError(
              "El esquema inicial solo se crea en un tablero vacío. Las tarjetas existentes se conservan.",
            );
          const names =
            v.template === "THREE_ACTS"
              ? ["Acto I · Planteamiento", "Acto II · Desarrollo", "Acto III · Desenlace"]
              : ["Parte I", "Parte II", "Parte III", "Parte IV", "Parte V"];
          const ids = names.map(() => randomUUID());
          const parts = names.map((title, index) => ({
            id: ids[index]!,
            bookId: v.bookId,
            workspaceId: session.workspace.id,
            createdById: session.user.id,
            kind: "ACT" as const,
            title,
            parentId: null as string | null,
            sortOrder: index,
          }));
          const chapters = Array.from({ length: v.chapterCount }, (_, index) => ({
            id: randomUUID(),
            bookId: v.bookId,
            workspaceId: session.workspace.id,
            createdById: session.user.id,
            kind: "CHAPTER" as const,
            title: `Capítulo ${index + 1}`,
            parentId: ids[Math.floor((index * ids.length) / v.chapterCount)]!,
            sortOrder: index,
          }));
          await tx.storyPlanItem.createMany({ data: [...parts, ...chapters] });
          return `Esquema inicial creado: ${parts.length} partes y ${chapters.length} capítulos. Los resúmenes quedan vacíos para que escribas tu historia.`;
        }
        const scope = { workspaceId: session.workspace.id, bookId: v.bookId, deletedAt: null };
        const placements = async (changes: ReturnType<typeof movePlan>) => {
          if (!changes.length) return;
          const values = Prisma.join(
            changes.map(
              (c) => Prisma.sql`(${c.id}::uuid, ${c.parentId}::uuid, ${c.sortOrder}::integer)`,
            ),
          );
          await tx.$executeRaw(
            Prisma.sql`UPDATE "story_plan_items" AS p SET "parentId"=m.parent, "sortOrder"=m.rank_value, "version"=p."version"+1, "updatedAt"=CURRENT_TIMESTAMP FROM (VALUES ${values}) AS m(id,parent,rank_value) WHERE p.id=m.id AND p."workspaceId"=${session.workspace.id}::uuid AND p."bookId"=${v.bookId}::uuid AND p."deletedAt" IS NULL`,
          );
        };
        if (v.operation === "move") {
          await placements(movePlan(nodes, v.id, v.parentId || null, v.beforeId || null));
          return "Tarjeta reubicada. El manuscrito conserva su estructura hasta que la apliques.";
        }
        if (v.operation === "status") {
          await tx.storyPlanItem.updateMany({
            where: { ...scope, id: v.id },
            data: { status: v.status, version: { increment: 1 } },
          });
          return "Estado del trabajo actualizado.";
        }
        if (v.operation === "delete") {
          if (nodes.some((n) => n.parentId === v.id))
            throw new PlanError(
              "Mueve primero sus capítulos o escenas. No se eliminará su contenido en cascada.",
            );
          await tx.storyPlanItem.updateMany({
            where: { ...scope, id: v.id },
            data: { deletedAt: new Date(), sectionId: null, version: { increment: 1 } },
          });
          return "Tarjeta archivada. La sección del manuscrito se conserva.";
        }
        const sections = await tx.bookSection.findMany({
          where: { bookId: v.bookId, deletedAt: null },
          select: {
            id: true,
            title: true,
            type: true,
            parentId: true,
            sortOrder: true,
            version: true,
          },
        });
        if (manuscriptKey(sections) !== v.sourceKey)
          throw new PlanError(
            "El manuscrito cambió desde que abriste el tablero. Recarga y revisa sus vínculos.",
          );
        if (v.operation === "save") {
          if (v.id && !item) throw new PlanError("La tarjeta no pertenece a este libro.");
          if (!v.title) throw new PlanError("Escribe el título de la tarjeta.");
          if (!item && nodes.length >= MAX_PLAN_ITEMS)
            throw new PlanError("Se alcanzó el límite de tarjetas de este libro.");
          const parent = nodes.find((n) => n.id === v.parentId);
          if (v.parentId && !parent)
            throw new PlanError("El contenedor no pertenece a este libro.");
          if (!validParent(v.kind, parent?.kind ?? null))
            throw new PlanError(
              "Coloca los capítulos dentro de partes y las escenas dentro de capítulos.",
            );
          if (v.sectionId) {
            const section = sections.find((s) => s.id === v.sectionId);
            if (!section) throw new PlanError("La sección no pertenece a este libro.");
            assertLink(v.kind, section.type);
            if (nodes.some((n) => n.id !== v.id && n.sectionId === v.sectionId))
              throw new PlanError("Esa sección ya está vinculada a otra tarjeta.");
          }
          const id = item?.id ?? randomUUID();
          const sortOrder =
            item?.sortOrder ??
            Math.max(
              -1,
              ...nodes.filter((n) => n.parentId === (v.parentId || null)).map((n) => n.sortOrder),
            ) + 1;
          const payload = {
            title: v.title,
            summary: v.summary || null,
            goal: v.goal || null,
            conflict: v.conflict || null,
            outcome: v.outcome || null,
            targetWords: v.targetWords === "" ? null : v.targetWords,
            kind: v.kind,
            status: v.status,
            sectionId: v.sectionId || null,
          };
          const projected = nodes.map((n) => (n.id === id ? { ...n, ...payload } : n));
          if (item) {
            // Se comprueba la nueva clase antes de mover; protege también a sus hijos.
            const moved = movePlan(projected, id, v.parentId || null, null);
            await tx.storyPlanItem.updateMany({
              where: { ...scope, id },
              data: { ...payload, version: { increment: 1 } },
            });
            if (item.parentId !== (v.parentId || null)) await placements(moved);
          } else {
            planOrder([
              ...nodes,
              {
                id,
                parentId: v.parentId || null,
                sortOrder,
                createdAt: new Date().toISOString(),
                ...payload,
              },
            ]);
            await tx.storyPlanItem.create({
              data: {
                id,
                workspaceId: session.workspace.id,
                bookId: v.bookId,
                createdById: session.user.id,
                parentId: v.parentId || null,
                sortOrder,
                ...payload,
              },
            });
          }
          return item ? "Tarjeta actualizada." : "Tarjeta añadida al esqueleto del libro.";
        }
        const orderedSections = editorialOrder(sections, true);
        const relevant = orderedSections.filter((s) => NARRATIVE.has(s.type));
        if (v.operation === "import") {
          const map = new Map(nodes.filter((n) => n.sectionId).map((n) => [n.sectionId!, n.id]));
          let count = 0;
          for (const section of relevant) {
            if (map.has(section.id)) continue;
            if (
              nodes.some(
                (n) =>
                  !n.sectionId &&
                  n.kind === (section.type === "PART" ? "ACT" : "CHAPTER") &&
                  n.title === section.title,
              )
            )
              throw new PlanError(
                `Ya hay una tarjeta llamada «${section.title}». Vincúlala desde Editar para evitar duplicarla.`,
              );
            const kind = section.type === "PART" ? "ACT" : "CHAPTER";
            let ancestor = sections.find((s) => s.id === section.parentId);
            while (ancestor && ancestor.type !== "PART") {
              if (ancestor.type === "CHAPTER")
                throw new PlanError(
                  "El manuscrito tiene capítulos anidados. Revisa sus vínculos manualmente: el tablero organiza escenas dentro de capítulos.",
                );
              ancestor = sections.find((s) => s.id === ancestor?.parentId);
            }
            if (kind === "ACT" && ancestor)
              throw new PlanError(
                "Hay partes anidadas en el manuscrito. El tablero utiliza un nivel de partes; revisa esa estructura antes de importarla.",
              );
            const parentId = ancestor ? (map.get(ancestor.id) ?? null) : null;
            const id = randomUUID(),
              sortOrder =
                Math.max(
                  -1,
                  ...nodes.filter((n) => n.parentId === parentId).map((n) => n.sortOrder),
                ) + 1;
            const created = await tx.storyPlanItem.create({
              data: {
                id,
                bookId: v.bookId,
                workspaceId: session.workspace.id,
                createdById: session.user.id,
                sectionId: section.id,
                title: section.title,
                kind,
                status: "IDEA",
                parentId,
                sortOrder,
              },
            });
            nodes.push({ ...created, createdAt: created.createdAt.toISOString() });
            map.set(section.id, id);
            count++;
            if (nodes.length > MAX_PLAN_ITEMS)
              throw new PlanError("La estructura supera el límite de tarjetas del tablero.");
          }
          planOrder(nodes);
          return count
            ? `${count} secciones vinculadas al plan. El texto del manuscrito no cambió.`
            : "Las secciones narrativas ya estaban vinculadas. No se crearon duplicados.";
        }
        const ordered = planOrder(nodes).filter((n) => n.kind === "ACT" || n.kind === "CHAPTER");
        if (!ordered.length)
          throw new PlanError(
            "Añade al menos una parte o un capítulo antes de aplicar la estructura.",
          );
        const linked = new Set(ordered.flatMap((n) => (n.sectionId ? [n.sectionId] : [])));
        if (relevant.some((s) => !linked.has(s.id)))
          throw new PlanError(
            "Hay capítulos o partes del manuscrito sin vincular. Usa «Traer del manuscrito» o vincúlalos desde Editar antes de aplicar.",
          );
        const newCount = ordered.filter((n) => !n.sectionId).length;
        if (sections.length + newCount > 200)
          throw new PlanError(
            "Esta operación admite hasta 200 secciones en el manuscrito; no se aplicará una estructura incompleta.",
          );
        const mapping = new Map<string, string>();
        const projected = [...sections];
        const counters = new Map<string | null, number>();
        for (const node of ordered) {
          const existing = node.sectionId ? sections.find((s) => s.id === node.sectionId) : null;
          if (node.sectionId && !existing)
            throw new PlanError("Una sección vinculada ya no está disponible. Revisa su tarjeta.");
          if (existing) {
            assertLink(node.kind, existing.type);
            if (existing.title !== node.title)
              throw new PlanError(
                `El título de «${node.title}» difiere del manuscrito. Revisa el vínculo: no se renombrará el texto existente.`,
              );
          }
          const sectionId = existing?.id ?? randomUUID(),
            parentId = node.parentId ? (mapping.get(node.parentId) ?? null) : null;
          const sortOrder = counters.get(parentId) ?? 0;
          counters.set(parentId, sortOrder + 1);
          mapping.set(node.id, sectionId);
          if (!existing) {
            await tx.bookSection.create({
              data: {
                id: sectionId,
                bookId: v.bookId,
                title: node.title,
                type: node.kind === "ACT" ? "PART" : "CHAPTER",
                parentId,
                sortOrder,
              },
            });
            await tx.storyPlanItem.updateMany({
              where: { ...scope, id: node.id },
              data: { sectionId, version: { increment: 1 } },
            });
            projected.push({
              id: sectionId,
              title: node.title,
              type: node.kind === "ACT" ? "PART" : "CHAPTER",
              parentId,
              sortOrder,
              version: 1,
            });
          } else {
            await tx.bookSection.updateMany({
              where: { id: sectionId, bookId: v.bookId, deletedAt: null },
              data: { parentId, sortOrder },
            });
            const index = projected.findIndex((s) => s.id === sectionId);
            projected[index] = { ...existing, parentId, sortOrder };
          }
        }
        const wanted = ordered.map((n) => mapping.get(n.id)!);
        const actual = editorialOrder(projected, true)
          .filter((s) => wanted.includes(s.id))
          .map((s) => s.id);
        if (JSON.stringify(wanted) !== JSON.stringify(actual))
          throw new PlanError(
            "El orden propuesto no respeta los grupos editoriales. Coloca el prólogo antes del cuerpo y el epílogo al final.",
          );
        await recomputeBookTotals(tx, v.bookId);
        return `Estructura aplicada: ${newCount} secciones nuevas. Se conservaron los textos y títulos existentes.`;
      },
      { isolationLevel: "Serializable", timeout: 20000 },
    );
    await writeAuditLog(
      {
        action: "MODULAR_PLAN_UPDATED",
        entityType: "Book",
        entityId: v.bookId,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { operation: v.operation },
      },
      context,
    );
    revalidatePath("/planning");
    revalidatePath(`/books/${v.bookId}`);
    if (v.operation === "apply") {
      revalidatePath(`/books/${v.bookId}/preview`);
      revalidatePath(`/books/${v.bookId}/export`);
    }
    return { status: "success", message };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof PlanError
          ? error.message
          : "No se pudo guardar. Si hubo un cambio concurrente, recarga antes de reintentar.",
    };
  }
}

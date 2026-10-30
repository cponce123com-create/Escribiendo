import { z } from "zod";
import { MAX_PLAN_ITEMS, PlanError } from "./structure";
const archiveSchema = z.object({
  archive: z.object({ batchId: z.uuid(), sectionId: z.uuid().nullable() }),
});
export function archiveMetadata(value: unknown) {
  const result = archiveSchema.safeParse(value);
  return result.success ? result.data.archive : null;
}
/** Cierre de descendientes dentro de un conjunto ya acotado por libro/workspace. */
export function planSubtree<T extends { id: string; parentId: string | null }>(
  rows: readonly T[],
  rootId: string,
): T[] {
  if (rows.length > MAX_PLAN_ITEMS)
    throw new PlanError("La operación supera el límite de tarjetas del plan.");
  const root = rows.find((n) => n.id === rootId);
  if (!root) throw new PlanError("La tarjeta no está disponible en este plan.");
  const children = new Map<string, T[]>();
  for (const row of rows)
    if (row.parentId) children.set(row.parentId, [...(children.get(row.parentId) ?? []), row]);
  const seen = new Set<string>();
  const result: T[] = [];
  const queue = [root];
  for (let index = 0; index < queue.length; index++) {
    const row = queue[index]!;
    if (seen.has(row.id))
      throw new PlanError("El plan contiene una dependencia circular o duplicada.");
    seen.add(row.id);
    result.push(row);
    queue.push(...(children.get(row.id) ?? []));
  }
  return result;
}

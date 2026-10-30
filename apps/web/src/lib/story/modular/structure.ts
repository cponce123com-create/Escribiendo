import type { PlanKind, PlanStatus } from "../labels";
export const MAX_PLAN_ITEMS = 1000;
export class PlanError extends Error {}
export interface PlanNode {
  id: string;
  parentId: string | null;
  sortOrder: number;
  kind: PlanKind;
  title: string;
  status: PlanStatus;
  createdAt: string;
}
export function validParent(kind: PlanKind, parent: PlanKind | null): boolean {
  if (parent === null) return true;
  if (kind === "ACT") return false;
  if (kind === "CHAPTER") return parent === "ACT";
  if (kind === "SCENE") return parent === "CHAPTER";
  return parent === "ACT" || parent === "CHAPTER";
}
export function comparePlan(a: PlanNode, b: PlanNode) {
  return (
    a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  );
}
export function planOrder<T extends PlanNode>(nodes: readonly T[]): T[] {
  if (nodes.length > MAX_PLAN_ITEMS)
    throw new PlanError(`El tablero admite hasta ${MAX_PLAN_ITEMS} tarjetas por libro.`);
  const map = new Map(nodes.map((n) => [n.id, n]));
  if (map.size !== nodes.length) throw new PlanError("El plan contiene tarjetas duplicadas.");
  for (const node of nodes) {
    const parent = node.parentId ? map.get(node.parentId) : null;
    if (node.parentId && !parent)
      throw new PlanError("Hay una tarjeta cuyo contenedor ya no está disponible.");
    if (!validParent(node.kind, parent?.kind ?? null))
      throw new PlanError("Organiza partes, capítulos y escenas en ese orden.");
    const visited = new Set([node.id]);
    let current = parent;
    while (current) {
      if (visited.has(current.id))
        throw new PlanError("Una tarjeta no puede quedar dentro de sí misma.");
      visited.add(current.id);
      current = current.parentId ? map.get(current.parentId) : null;
    }
  }
  const children = new Map<string | null, T[]>();
  for (const node of nodes) {
    const group = children.get(node.parentId) ?? [];
    group.push(node);
    children.set(node.parentId, group);
  }
  for (const group of children.values()) group.sort(comparePlan);
  const result: T[] = [];
  const stack = [...(children.get(null) ?? [])].reverse();
  while (stack.length) {
    const node = stack.pop()!;
    result.push(node);
    stack.push(...[...(children.get(node.id) ?? [])].reverse());
  }
  return result;
}
export function movePlan(
  nodes: readonly PlanNode[],
  id: string,
  parentId: string | null,
  beforeId: string | null,
) {
  planOrder(nodes);
  const item = nodes.find((n) => n.id === id),
    parent = nodes.find((n) => n.id === parentId);
  if (!item || (parentId && !parent))
    throw new PlanError("La tarjeta o su destino no están disponibles.");
  if (!validParent(item.kind, parent?.kind ?? null))
    throw new PlanError(
      "Una parte contiene capítulos; un capítulo contiene escenas. También puedes dejar una tarjeta sin ubicar.",
    );
  if (beforeId === id) throw new PlanError("Elige otra tarjeta como referencia.");
  const destination = nodes.filter((n) => n.parentId === parentId && n.id !== id).sort(comparePlan);
  const index = beforeId ? destination.findIndex((n) => n.id === beforeId) : destination.length;
  if (index < 0) throw new PlanError("La posición elegida no pertenece al destino.");
  destination.splice(index, 0, { ...item, parentId });
  const updates = new Map(
    destination.map((n, sortOrder) => [n.id, { id: n.id, parentId, sortOrder }]),
  );
  if (item.parentId !== parentId)
    nodes
      .filter((n) => n.parentId === item.parentId && n.id !== id)
      .sort(comparePlan)
      .forEach((n, sortOrder) => updates.set(n.id, { id: n.id, parentId: n.parentId, sortOrder }));
  const projected = nodes.map((n) => ({ ...n, ...(updates.get(n.id) ?? {}) }));
  planOrder(projected);
  return [...updates.values()].filter((u) => {
    const old = nodes.find((n) => n.id === u.id)!;
    return old.parentId !== u.parentId || old.sortOrder !== u.sortOrder;
  });
}
export function planDiagnostics(
  nodes: readonly (PlanNode & {
    summary: string | null;
    goal: string | null;
    outcome: string | null;
  })[],
) {
  const notes: string[] = [];
  const chapters = nodes.filter((n) => n.kind === "CHAPTER");
  if (!chapters.length)
    notes.push("Añade el primer capítulo para empezar a construir el recorrido del libro.");
  const incomplete = chapters.filter((n) => !n.summary || !n.goal || !n.outcome).length;
  if (incomplete)
    notes.push(
      `${incomplete} ${incomplete === 1 ? "capítulo necesita" : "capítulos necesitan"} resumen, objetivo o cierre.`,
    );
  const loose = nodes.filter((n) => n.kind === "SCENE" && !n.parentId).length;
  if (loose)
    notes.push(`${loose} ${loose === 1 ? "escena sin capítulo" : "escenas sin capítulo"}.`);
  const seen = new Set<string>();
  if (
    chapters.some((n) => {
      const key = n.title.trim().normalize("NFC").toLocaleLowerCase("es");
      const duplicate = seen.has(key);
      seen.add(key);
      return duplicate;
    })
  )
    notes.push("Hay títulos de capítulo repetidos. Comprueba si es intencional.");
  return notes;
}

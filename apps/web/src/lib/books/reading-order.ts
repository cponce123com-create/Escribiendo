/** Canonical preorder. UI can recover orphans; publication fails closed. */
export interface OrderedSection {
  id: string;
  parentId?: string | null;
  sortOrder?: number;
  title: string;
}

export function compareEditorialSections(a: OrderedSection, b: OrderedSection): number {
  return (
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
    a.title.localeCompare(b.title, "es") ||
    a.id.localeCompare(b.id)
  );
}

export function editorialOrder<T extends OrderedSection>(rows: readonly T[], strict = true): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (byId.size !== rows.length) throw new Error("La estructura contiene secciones duplicadas.");
  const children = new Map<string | null, T[]>();
  for (const row of rows) {
    let parent = row.parentId ?? null;
    const visited = new Set([row.id]);
    let cursor = parent;
    while (cursor) {
      if (visited.has(cursor) || !byId.has(cursor)) {
        if (strict)
          throw new Error(
            "La estructura editorial contiene ciclos o padres ausentes. Revisa las secciones antes de exportar.",
          );
        parent = null;
        break;
      }
      visited.add(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
    const siblings = children.get(parent) ?? [];
    siblings.push(row);
    children.set(parent, siblings);
  }
  for (const siblings of children.values()) siblings.sort(compareEditorialSections);
  const result: T[] = [];
  const stack = [...(children.get(null) ?? [])].reverse();
  while (stack.length) {
    const row = stack.pop()!;
    result.push(row);
    const descendants = children.get(row.id) ?? [];
    for (let i = descendants.length - 1; i >= 0; i--) stack.push(descendants[i]!);
  }
  return result;
}

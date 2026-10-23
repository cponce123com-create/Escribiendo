import { compareEditorialSections } from "./reading-order";
/**
 * Construcción del árbol de secciones a partir de una lista plana.
 *
 * La base de datos guarda `parentId` y `sortOrder`, no una jerarquía
 * materializada. Reconstruir el árbol en cada lectura es barato (las
 * secciones de un libro son contadas) y evita que un dato almacenado
 * quede desincronizado.
 */

export interface SectionRow {
  id: string;
  parentId: string | null;
  type: string;
  title: string;
  sortOrder: number;
  wordCount: number;
  version: number;
}

export interface SectionNode extends SectionRow {
  children: SectionNode[];
}

/**
 * Indica si colgar la sección de su padre cerraría un ciclo.
 *
 * Una sección no puede ser ancestro de sí misma. Los datos válidos nunca lo
 * son, pero la comprobación evita que una manipulación de la base deje la
 * función en un bucle infinito.
 */
function wouldCreateCycle(byId: Map<string, SectionRow>, row: SectionRow): boolean {
  const visited = new Set<string>();
  let current = row.parentId;

  while (current) {
    if (current === row.id || visited.has(current)) {
      return true;
    }

    visited.add(current);
    current = byId.get(current)?.parentId ?? null;
  }

  return false;
}

/**
 * Construye el árbol de secciones.
 *
 * Una sección cuyo padre ya no existe se trata como raíz: es el
 * comportamiento que evita que un borrado lógico deje manuscritos
 * invisibles. Los ciclos (imposibles con datos válidos, pero posibles si
 * alguien manipula la base) se rompen tratando la sección repetida como
 * raíz, de modo que la función siempre termina.
 */
export function buildSectionTree(rows: SectionRow[]): SectionNode[] {
  const byId = new Map<string, SectionRow>();

  for (const row of rows) {
    byId.set(row.id, row);
  }

  const nodes = new Map<string, SectionNode>();

  for (const row of rows) {
    nodes.set(row.id, { ...row, children: [] });
  }

  const roots: SectionNode[] = [];

  for (const row of rows) {
    const node = nodes.get(row.id);

    if (!node) {
      continue;
    }

    const parent = row.parentId ? nodes.get(row.parentId) : undefined;

    if (parent && parent.id !== node.id && !wouldCreateCycle(byId, row)) {
      parent.children.push(node);
      continue;
    }

    roots.push(node);
  }

  const sortRecursively = (nodes: SectionNode[]): void => {
    nodes.sort(compareEditorialSections);

    for (const node of nodes) {
      sortRecursively(node.children);
    }
  };

  sortRecursively(roots);

  return roots;
}

/**
 * Aplana un árbol de secciones en el orden en que se muestra.
 *
 * Se usa para calcular los totales y para numerar los capítulos.
 */
export function flattenSectionTree(nodes: SectionNode[]): SectionNode[] {
  const result: SectionNode[] = [];

  const walk = (list: SectionNode[]): void => {
    for (const node of list) {
      result.push(node);
      walk(node.children);
    }
  };

  walk(nodes);

  return result;
}

/** Número de secciones de tipo capítulo o equivalente, en todo el árbol. */
export function countChapterLike(
  nodes: SectionNode[],
  isChapterLike: (type: string) => boolean,
): number {
  return flattenSectionTree(nodes).filter((node) => isChapterLike(node.type)).length;
}

/** Suma de palabras de todas las secciones del árbol. */
export function sumWords(nodes: SectionNode[]): number {
  return flattenSectionTree(nodes).reduce((total, node) => total + node.wordCount, 0);
}

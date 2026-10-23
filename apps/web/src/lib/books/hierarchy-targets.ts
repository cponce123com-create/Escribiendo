import { flattenSectionTree, type SectionNode } from "./section-tree";

export function hierarchyTargets(node: SectionNode, roots: SectionNode[]) {
  const flat = flattenSectionTree(roots);
  const parent = flat.find((entry) => entry.id === node.parentId);
  const siblings = parent?.children ?? roots;
  const index = siblings.findIndex((entry) => entry.id === node.id);
  const previous = index > 0 ? siblings[index - 1] : undefined;
  const grandparent = parent ? flat.find((entry) => entry.id === parent.parentId) : undefined;
  const parentSiblings = grandparent?.children ?? roots;
  return {
    indent: previous ? { parentId: previous.id, position: previous.children.length } : null,
    outdent: parent
      ? {
          parentId: parent.parentId,
          position: parentSiblings.findIndex((entry) => entry.id === parent.id) + 1,
        }
      : null,
  };
}

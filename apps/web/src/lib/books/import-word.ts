import { XMLParser } from "fast-xml-parser";
import type { TiptapNode, TiptapMark } from "@escribiendo/book-schema";
import { esEnlaceSeguro } from "@escribiendo/shared";
import type { ImportTextBlock } from "./import-detection";
type Ordered = Record<string, unknown>;
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: false,
});
const tag = (node: Ordered) => Object.keys(node).find((key) => key !== ":@") ?? "";
const local = (name: string) => name.split(":").at(-1) ?? name;
const children = (node: Ordered): Ordered[] =>
  Array.isArray(node[tag(node)]) ? (node[tag(node)] as Ordered[]) : [];
function attr(node: Ordered, name: string) {
  const attrs = node[":@"] as Record<string, unknown> | undefined;
  const found = Object.entries(attrs ?? {}).find(
    ([key]) => local(key.replace(/^@_/u, "")) === name,
  )?.[1];
  return typeof found === "string" ? found : undefined;
}
const direct = (node: Ordered, name: string) =>
  children(node).find((child) => local(tag(child)) === name);
function all(nodes: Ordered[], name: string): Ordered[] {
  return nodes.flatMap((node) => (local(tag(node)) === name ? [node] : all(children(node), name)));
}
function raw(nodes: Ordered[]): string {
  return nodes
    .map((node) =>
      tag(node) === "#text"
        ? String(node["#text"] ?? "")
        : local(tag(node)) === "tab"
          ? "\t"
          : ["br", "cr"].includes(local(tag(node)))
            ? "\n"
            : raw(children(node)),
    )
    .join("");
}
const clean = (text: string) =>
  text.replace(/\u00a0/gu, " ").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, "");
export function wordImportBlocks(
  documentXml: string,
  stylesXml?: string,
  relationsXml?: string,
  notesXml?: string,
  endnotesXml?: string,
): ImportTextBlock[] {
  const styles = new Map<string, { name: string; parent?: string; level?: number }>();
  if (stylesXml)
    for (const node of all(parser.parse(stylesXml) as Ordered[], "style")) {
      const id = attr(node, "styleId");
      if (!id) continue;
      const outline = attr(
        direct(node, "pPr") ? (direct(direct(node, "pPr")!, "outlineLvl") ?? {}) : {},
        "val",
      );
      styles.set(id, {
        name: attr(direct(node, "name") ?? {}, "val") ?? id,
        parent: attr(direct(node, "basedOn") ?? {}, "val"),
        ...(outline !== undefined ? { level: Number(outline) + 1 } : {}),
      });
    }
  function level(id: string, seen = new Set<string>()): number | undefined {
    if (seen.has(id) || seen.size > 12) return;
    seen.add(id);
    const style = styles.get(id);
    const name = (style?.name ?? id).normalize("NFD").replace(/\p{M}/gu, "");
    const match =
      /^(?:heading|titulo|encabezado|heading level)\s*([1-6])$/iu.exec(name) ??
      /^(?:heading|titulo|encabezado)([1-6])$/iu.exec(id.normalize("NFD").replace(/\p{M}/gu, ""));
    if (match) return Number(match[1]);
    if (style?.level !== undefined && style.level <= 6) return style.level;
    if (/^(title|titulo)$/iu.test(name)) return 0;
    return style?.parent ? level(style.parent, seen) : undefined;
  }
  const links = new Map<string, string>();
  if (relationsXml)
    for (const node of all(parser.parse(relationsXml) as Ordered[], "Relationship")) {
      const id = attr(node, "Id"),
        target = attr(node, "Target");
      if (id && target && esEnlaceSeguro(target)) links.set(id, target);
    }
  const notes = new Map<string, string>();
  for (const [xml, kind] of [
    [notesXml, "footnote"],
    [endnotesXml, "endnote"],
  ] as const) {
    if (!xml) continue;
    for (const note of all(parser.parse(xml) as Ordered[], kind)) {
      const id = attr(note, "id");
      if (id && Number(id) >= 0)
        notes.set(
          `${kind}:${id}`,
          all(children(note), "p")
            .map((p) => raw(children(p)))
            .join("\n")
            .trim(),
        );
    }
  }
  function inline(nodes: Ordered[], marks: TiptapMark[] = []): TiptapNode[] {
    return nodes.flatMap((node) => {
      const name = local(tag(node));
      if (["pPr", "rPr", "del", "moveFrom", "instrText"].includes(name)) return [];
      if (name === "t") {
        const text = clean(raw(children(node)));
        return text ? [{ type: "text", text, ...(marks.length ? { marks } : {}) }] : [];
      }
      if (name === "tab") return [{ type: "text", text: " " }];
      if (name === "br" || name === "cr") return [{ type: "hardBreak" }];
      if (name === "footnoteReference" || name === "endnoteReference") {
        const id = attr(node, "id"),
          note = id
            ? notes.get(`${name === "footnoteReference" ? "footnote" : "endnote"}:${id}`)
            : null;
        return note && note.length > 2000
          ? [{ type: "text", text: ` ${note}` }]
          : note
            ? [
                {
                  type: "footnote",
                  attrs: {
                    id: `import-${name === "footnoteReference" ? "note" : "endnote"}-${id}`,
                    note,
                  },
                },
              ]
            : [];
      }
      const next = [...marks];
      if (name === "r") {
        const props = direct(node, "rPr");
        if (props)
          for (const [word, type] of [
            ["b", "bold"],
            ["i", "italic"],
            ["u", "underline"],
            ["strike", "strike"],
          ]) {
            const prop = direct(props, word!);
            if (prop && !["0", "false", "none"].includes(attr(prop, "val") ?? ""))
              next.push({ type: type! });
          }
      }
      if (name === "hyperlink") {
        const href = links.get(attr(node, "id") ?? "");
        if (href) next.push({ type: "link", attrs: { href } });
      }
      return inline(children(node), next);
    });
  }
  const result: ImportTextBlock[] = [];
  function walk(nodes: Ordered[]) {
    for (const node of nodes) {
      const name = local(tag(node));
      if (name === "del" || name === "moveFrom") continue;
      if (name !== "p") {
        walk(children(node));
        continue;
      }
      const content = inline(children(node));
      const text = content
        .map((node) => node.text ?? (node.type === "hardBreak" ? "\n" : ""))
        .join("")
        .trim();
      if (!text) continue;
      const props = direct(node, "pPr");
      const styleId = attr(props ? (direct(props, "pStyle") ?? {}) : {}, "val") ?? "";
      const directLevel = attr(props ? (direct(props, "outlineLvl") ?? {}) : {}, "val");
      const headingLevel = directLevel !== undefined ? Number(directLevel) + 1 : level(styleId);
      result.push({
        text,
        ...(headingLevel !== undefined ? { headingLevel } : {}),
        ...(headingLevel === 0 ? { sectionType: "TITLE_PAGE" as const } : {}),
        node: {
          type: headingLevel && headingLevel > 0 ? "heading" : "paragraph",
          ...(headingLevel && headingLevel > 0
            ? { attrs: { level: Math.min(3, headingLevel) } }
            : {}),
          content,
        },
      });
    }
  }
  const doc = parser.parse(documentXml) as Ordered[];
  const body = all(doc, "body")[0];
  if (body) walk(children(body));
  return result;
}

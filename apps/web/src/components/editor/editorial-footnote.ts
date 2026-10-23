import { FOOTNOTE_EDIT_EVENT } from "@/lib/editor/footnote-edit";
import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/**
 * Nota al pie del manuscrito.
 *
 * Es un nodo atómico en línea: ocupa el lugar de la llamada y guarda el texto
 * de la nota en sus atributos. La numeración no se congela en el JSON; se
 * calcula por el orden de aparición en el documento, de modo que insertar una
 * nota antes de otra renumera todas sin reescribir el manuscrito.
 */

export interface EditorialFootnoteAttrs {
  id: string;
  note: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    editorialFootnote: {
      insertEditorialFootnote: (attrs: EditorialFootnoteAttrs) => ReturnType;
      updateEditorialFootnote: (attrs: Partial<EditorialFootnoteAttrs>) => ReturnType;
    };
  }
}

const footnoteKey = new PluginKey("editorialFootnote");

function isFootnoteAttrs(value: unknown): value is EditorialFootnoteAttrs {
  if (!value || typeof value !== "object") {
    return false;
  }

  const attrs = value as Record<string, unknown>;

  return (
    typeof attrs.id === "string" &&
    attrs.id.length > 0 &&
    typeof attrs.note === "string" &&
    attrs.note.trim().length > 0
  );
}

function footnoteAt(view: EditorView, pos: number) {
  const node = view.state.doc.nodeAt(pos);

  return node?.type.name === "footnote" && isFootnoteAttrs(node.attrs) ? node : null;
}

export const EditorialFootnote = Node.create({
  name: "footnote",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-footnote-id"),
        renderHTML: (attributes) => (attributes.id ? { "data-footnote-id": attributes.id } : {}),
      },
      note: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-note") ?? "",
        renderHTML: (attributes) => (attributes.note ? { "data-note": attributes.note } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "sup[data-footnote-id]",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }

          const id = element.getAttribute("data-footnote-id");
          const note = element.getAttribute("data-note") ?? "";

          return id ? { id, note } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "sup",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "footnote-ref",
        "aria-hidden": "false",
      }),
    ];
  },

  addCommands() {
    return {
      insertEditorialFootnote:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
      updateEditorialFootnote:
        (attrs) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attrs),
    };
  },

  addProseMirrorPlugins() {
    const name = this.name;

    return [
      new Plugin({
        key: footnoteKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            let number = 0;

            state.doc.descendants((node, pos) => {
              if (node.type.name !== name) {
                return;
              }

              number += 1;
              const note = typeof node.attrs.note === "string" ? node.attrs.note : "";
              const label = `Nota al pie ${number}${note ? `: ${note}` : ""}`;

              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  "data-number": String(number),
                  "aria-label": `Nota al pie ${number}`,
                  title: label,
                }),
              );
            });

            return DecorationSet.create(state.doc, decorations);
          },

          handleClick(view, pos, event) {
            const target = event.target;

            if (!(target instanceof HTMLElement) || !target.closest("sup.footnote-ref")) {
              return false;
            }

            const node = footnoteAt(view, pos);

            if (!node) {
              return false;
            }

            if (!view.editable) return true;
            view.dom.dispatchEvent(
              new CustomEvent(FOOTNOTE_EDIT_EVENT, {
                detail: { id: node.attrs.id, pos, note: node.attrs.note },
              }),
            );
            return true;
          },
        },
      }),
    ];
  },
});

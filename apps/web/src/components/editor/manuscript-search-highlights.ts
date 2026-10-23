import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const manuscriptSearchPluginKey = new PluginKey<string>("manuscriptSearch");

export const ManuscriptSearchHighlights = Extension.create({
  name: "manuscriptSearchHighlights",

  addProseMirrorPlugins() {
    return [
      new Plugin<string>({
        key: manuscriptSearchPluginKey,
        state: {
          init: () => "",
          apply(transaction, query) {
            const next = transaction.getMeta(manuscriptSearchPluginKey) as unknown;
            return typeof next === "string" ? next : query;
          },
        },
        props: {
          decorations(state) {
            const query = manuscriptSearchPluginKey.getState(state)?.trim();
            if (!query) return null;
            const decorations: Decoration[] = [];
            const needle = query.toLocaleLowerCase("es");
            state.doc.descendants((node, position) => {
              if (!node.isTextblock) return;
              const text = node.textBetween(0, node.content.size, "\n", "\ufffc");
              const haystack = text.toLocaleLowerCase("es");
              let from = 0;
              while (from <= haystack.length - needle.length) {
                const found = haystack.indexOf(needle, from);
                if (found < 0) break;
                decorations.push(
                  Decoration.inline(position + 1 + found, position + 1 + found + needle.length, {
                    class: "manuscript-search-match",
                  }),
                );
                from = found + needle.length;
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

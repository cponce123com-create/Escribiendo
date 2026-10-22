"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveSectionAction } from "@/lib/books/actions";
import { initialActionState } from "@/lib/action-state";
import { SECTION_TYPE_LABELS, formatNumber } from "@/lib/ui/format";
import type { SectionNode } from "@/lib/books/section-tree";

interface ManuscriptSidebarProps {
  bookId: string;
  nodes: SectionNode[];
  activeSectionId: string;
  canMove: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

/** Navegación del manuscrito y reordenación accesible entre secciones hermanas. */
export function ManuscriptSidebar({
  bookId,
  nodes,
  activeSectionId,
  canMove,
  collapsed,
  onToggle,
}: ManuscriptSidebarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const move = (node: SectionNode, position: number): void => {
    if (!canMove || pending) return;
    const data = new FormData();
    data.set("sectionId", node.id);
    data.set("parentId", node.parentId ?? "");
    data.set("position", String(position));
    startTransition(async () => {
      const result = await moveSectionAction(initialActionState, data);
      setMessage(result.message ?? "");
      if (result.status === "success") router.refresh();
    });
  };

  const renderNodes = (list: SectionNode[], depth: number): React.ReactNode => (
    <ul className="space-y-1">
      {list.map((node, index) => {
        const active = node.id === activeSectionId;
        return (
          <li key={node.id}>
            <div
              className={`group flex items-center gap-1 rounded-lg border transition-colors ${active ? "border-accent/20 bg-accent/10 shadow-[inset_2px_0_0_var(--accent)]" : "border-transparent hover:border-line hover:bg-ink/5"}`}
              onDragOver={(event) => {
                if (canMove && draggedId && draggedId !== node.id) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const source = list.find((item) => item.id === draggedId);
                setDraggedId(null);
                if (source && source.parentId === node.parentId && source.id !== node.id) {
                  const from = list.findIndex((item) => item.id === source.id);
                  const to = list.findIndex((item) => item.id === node.id);
                  move(source, to > from ? to - 1 : to);
                }
              }}
            >
              {canMove ? (
                <button
                  type="button"
                  draggable
                  aria-label={`Mover ${node.title}`}
                  title="Arrastrar para reordenar"
                  className="cursor-grab px-1.5 py-2 text-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", node.id);
                    setDraggedId(node.id);
                  }}
                  onDragEnd={() => setDraggedId(null)}
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 fill-current">
                    <circle cx="5" cy="3" r="1.2" />
                    <circle cx="11" cy="3" r="1.2" />
                    <circle cx="5" cy="8" r="1.2" />
                    <circle cx="11" cy="8" r="1.2" />
                    <circle cx="5" cy="13" r="1.2" />
                    <circle cx="11" cy="13" r="1.2" />
                  </svg>
                </button>
              ) : null}
              <Link
                href={`/books/${bookId}/sections/${node.id}`}
                aria-current={active ? "page" : undefined}
                className={`min-w-0 flex-1 py-2 pr-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${active ? "font-semibold text-ink" : "text-ink-soft"}`}
                style={depth > 0 ? { paddingLeft: `${0.25 + depth * 0.75}rem` } : undefined}
              >
                <span className="block truncate" title={node.title}>
                  {node.title}
                </span>
                <span className="block truncate text-xs text-ink-muted">
                  {SECTION_TYPE_LABELS[node.type] ?? node.type} · {formatNumber(node.wordCount)}{" "}
                  palabras
                </span>
              </Link>
              {canMove ? (
                <span className="flex flex-col pr-1">
                  <button
                    type="button"
                    aria-label={`Subir ${node.title}`}
                    title="Subir"
                    disabled={pending || index === 0}
                    onClick={() => move(node, index - 1)}
                    className="rounded px-1 text-xs text-ink-muted hover:bg-ink/10 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Bajar ${node.title}`}
                    title="Bajar"
                    disabled={pending || index === list.length - 1}
                    onClick={() => move(node, index + 1)}
                    className="rounded px-1 text-xs text-ink-muted hover:bg-ink/10 disabled:opacity-30"
                  >
                    ↓
                  </button>
                </span>
              ) : null}
            </div>
            {node.children.length > 0 ? renderNodes(node.children, depth + 1) : null}
          </li>
        );
      })}
    </ul>
  );

  const sectionCount = countSections(nodes);

  return (
    <aside
      className={`panel manuscript-navigation h-fit self-start transition-[width,padding] duration-300 xl:sticky xl:top-20 ${
        collapsed ? "p-2" : "p-3 sm:p-4"
      }`}
      aria-label="Navegación del manuscrito"
      data-collapsed={collapsed}
    >
      <div
        className={`flex items-center ${collapsed ? "justify-center" : "justify-between gap-2"}`}
      >
        {collapsed ? (
          <button
            type="button"
            className="manuscript-navigation__toggle"
            aria-label="Mostrar navegación del manuscrito"
            title="Mostrar capítulos"
            aria-expanded="false"
            onClick={onToggle}
          >
            <NavigationIcon />
          </button>
        ) : (
          <>
            <div className="min-w-0">
              <p className="meta-label">Tu libro</p>
              <div className="mt-1 flex items-center gap-2">
                <h2 className="font-serif text-xl leading-tight text-ink">Manuscrito</h2>
                <span className="rounded-full border border-line px-2 py-0.5 text-[0.65rem] font-semibold tabular-nums text-ink-muted">
                  {sectionCount}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="manuscript-navigation__toggle shrink-0"
              aria-label="Ocultar navegación del manuscrito"
              title="Ocultar capítulos"
              aria-expanded="true"
              onClick={onToggle}
            >
              <NavigationIcon />
            </button>
          </>
        )}
      </div>

      {!collapsed ? (
        <>
          <div className="my-3 flex items-center justify-between border-y border-line py-2">
            <span className="text-xs text-ink-muted">Secciones</span>
            <span className="text-xs font-medium tabular-nums text-ink-soft">
              {sectionCount} en total
            </span>
          </div>
          <div className="max-h-[calc(100svh-13rem)] overflow-y-auto pr-1">
            {nodes.length > 0 ? (
              renderNodes(nodes, 0)
            ) : (
              <p className="rounded-lg border border-dashed border-line-strong px-3 py-4 text-sm text-ink-muted">
                Todavía no hay secciones.
              </p>
            )}
          </div>
        </>
      ) : null}

      <p className="sr-only" role="status">
        {pending ? "Guardando el orden…" : message}
      </p>
    </aside>
  );
}

function countSections(nodes: SectionNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countSections(node.children), 0);
}

function NavigationIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none">
      <path
        d="M4 5.5h12M4 10h12M4 14.5h12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M2.5 5.5h.01M2.5 10h.01M2.5 14.5h.01"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { ConfirmButton } from "@/components/forms/confirm-button";
import { deleteSectionAction, moveSectionAction } from "@/lib/books/actions";
import type { ActionState } from "@/lib/action-state";
import { initialActionState } from "@/lib/action-state";
import { flattenSectionTree, type SectionNode } from "@/lib/books/section-tree";
import { groupSections } from "@/lib/books/studio";
import { Dialog } from "@/components/forms/dialog";
import { NewSectionForm } from "./new-section-form";
import { StudioIcon } from "./studio-icon";

interface ManuscriptSidebarProps {
  bookId: string;
  nodes: SectionNode[];
  activeSectionId: string;
  canMove: boolean;
  canDelete: boolean;
  canCreate: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

/** Índice compacto; los movimientos conservan los índices reales entre hermanos. */
export function ManuscriptSidebar({
  bookId,
  nodes,
  activeSectionId,
  canMove,
  canDelete,
  canCreate,
  collapsed,
  onToggle,
}: ManuscriptSidebarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionState>(initialActionState);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const flat = flattenSectionTree(nodes);
  const chapters = flat.filter((node) => node.type === "CHAPTER");
  const move = (node: SectionNode, position: number): void => {
    if (!canMove || pending) return;
    const data = new FormData();
    data.set("sectionId", node.id);
    data.set("parentId", node.parentId ?? "");
    data.set("position", String(position));
    startTransition(async () => {
      const result = await moveSectionAction(initialActionState, data);
      setMessage(result);
      if (result.status === "success") router.refresh();
    });
  };
  const renderNodes = (list: SectionNode[], depth: number): ReactNode => (
    <ul className="studio-section-list">
      {list.map((node, groupIndex) => {
        const siblings = depth === 0 ? nodes : list;
        const index = siblings.findIndex((item) => item.id === node.id);
        const chapterIndex = chapters.findIndex((item) => item.id === node.id);
        return (
          <li key={node.id}>
            <div
              className={`studio-section-row ${node.id === activeSectionId ? "is-current" : ""}`}
              style={{ paddingLeft: depth * 12 }}
              onDragOver={(event) => {
                if (canMove && draggedId && draggedId !== node.id) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const source = siblings.find((item) => item.id === draggedId);
                setDraggedId(null);
                if (source && source.id !== node.id) move(source, index);
              }}
            >
              {canMove ? (
                <button
                  type="button"
                  className="studio-drag"
                  draggable
                  disabled={pending}
                  aria-label={`Mover ${node.title}`}
                  title="Arrastrar para reordenar"
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", node.id);
                    setDraggedId(node.id);
                  }}
                  onDragEnd={() => setDraggedId(null)}
                >
                  ⠿
                </button>
              ) : null}
              <Link
                href={`/books/${bookId}/sections/${node.id}`}
                aria-current={node.id === activeSectionId ? "page" : undefined}
                title={node.title}
              >
                {chapterIndex >= 0 ? (
                  <span className="studio-chapter-number" aria-hidden="true">
                    {chapterIndex + 1}
                  </span>
                ) : (
                  <StudioIcon name="note" />
                )}
                <span>{node.title}</span>
              </Link>
              {canMove || canDelete ? (
                <details className="studio-section-menu">
                  <summary aria-label={`Opciones de ${node.title}`} title="Opciones de la sección">
                    ⋮
                  </summary>
                  <div>
                    {canMove ? (
                      <>
                        <button
                          type="button"
                          disabled={pending || groupIndex === 0}
                          onClick={(event) => {
                            event.currentTarget.closest("details")?.removeAttribute("open");
                            move(
                              node,
                              siblings.findIndex((item) => item.id === list[groupIndex - 1]?.id),
                            );
                          }}
                          aria-label={`Subir ${node.title}`}
                        >
                          ↑ Subir
                        </button>
                        <button
                          type="button"
                          disabled={pending || groupIndex === list.length - 1}
                          onClick={(event) => {
                            event.currentTarget.closest("details")?.removeAttribute("open");
                            move(
                              node,
                              siblings.findIndex((item) => item.id === list[groupIndex + 1]?.id),
                            );
                          }}
                          aria-label={`Bajar ${node.title}`}
                        >
                          ↓ Bajar
                        </button>
                      </>
                    ) : null}
                    {canDelete ? (
                      <form
                        action={async (data) => {
                          const result = await deleteSectionAction(initialActionState, data);
                          setMessage(result);
                          if (result.status === "success") router.refresh();
                        }}
                      >
                        <input type="hidden" name="sectionId" value={node.id} />
                        {!flattenSectionTree([node]).some(
                          (child) => child.id === activeSectionId,
                        ) ? (
                          <input type="hidden" name="stayInEditor" value="on" />
                        ) : null}
                        <ConfirmButton
                          label="Eliminar"
                          confirmLabel="Confirmar eliminación"
                          description={`Se eliminará «${node.title}»${node.children.length ? ` y ${flattenSectionTree(node.children).length} subsecciones` : ""}.`}
                          className="btn btn-danger btn-sm"
                        >
                          <span className="text-xs text-ink-soft">
                            Se eliminará esta sección
                            {node.children.length
                              ? ` y ${flattenSectionTree(node.children).length} subsecciones`
                              : ""}
                            .
                          </span>
                        </ConfirmButton>
                      </form>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </div>
            {node.children.length ? renderNodes(node.children, depth + 1) : null}
          </li>
        );
      })}
    </ul>
  );
  return (
    <aside
      className="manuscript-navigation studio-manuscript-nav"
      aria-label="Navegación del manuscrito"
      data-collapsed={collapsed}
    >
      <button
        type="button"
        className="studio-collapse"
        aria-label={
          collapsed ? "Mostrar navegación del manuscrito" : "Ocultar navegación del manuscrito"
        }
        title={collapsed ? "Mostrar capítulos" : "Ocultar capítulos"}
        aria-expanded={!collapsed}
        aria-controls="studio-chapter-tree"
        onClick={onToggle}
      >
        <StudioIcon name="chevrons" />
      </button>
      {!collapsed ? (
        <>
          <header>
            <h2>Manuscrito</h2>
            {canCreate ? (
              <button type="button" className="studio-add-section" onClick={() => setAdding(true)}>
                <StudioIcon name="plus" />
                Añadir
              </button>
            ) : null}
          </header>
          <Link
            className="mb-3 inline-flex text-xs font-semibold text-accent underline-offset-2 hover:underline"
            href={`/characters?book=${bookId}`}
          >
            Personajes del libro →
          </Link>
          <div id="studio-chapter-tree" className="studio-chapter-tree">
            {groupSections(nodes).map((group) => (
              <details className="studio-section-group" key={group.label} open>
                <summary>
                  <span className="studio-group-chevron" aria-hidden="true">
                    ⌄
                  </span>
                  <strong>{group.label}</strong>
                  <span className="studio-group-count">
                    {flattenSectionTree(group.nodes).length}
                  </span>
                </summary>
                {group.label === "Preliminares" ? (
                  <p className="studio-group-empty">Índice (automático)</p>
                ) : null}
                {group.nodes.length ? (
                  renderNodes(group.nodes, 0)
                ) : (
                  <p className="studio-group-empty">Sin secciones</p>
                )}
              </details>
            ))}
          </div>
        </>
      ) : null}
      {pending || message.message ? (
        <p
          className={`alert ${message.status === "error" ? "alert-error" : "alert-success"}`}
          role="status"
        >
          {pending ? "Guardando el orden…" : message.message}
        </p>
      ) : null}
      {adding ? (
        <Dialog
          abierto
          titulo="Añadir sección"
          descripcion="Elige el tipo y el nombre de la nueva sección del libro."
          onCerrar={() => setAdding(false)}
        >
          <NewSectionForm bookId={bookId} parents={flat.map(({ id, title }) => ({ id, title }))} />
        </Dialog>
      ) : null}
    </aside>
  );
}

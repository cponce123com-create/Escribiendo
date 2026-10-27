"use client";

import { editorialGalleryHref, sectionNavigationHref } from "@/lib/editorial/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { deleteSectionAction, moveSectionAction } from "@/lib/books/actions";
import type { ActionState } from "@/lib/action-state";
import { initialActionState } from "@/lib/action-state";
import { flattenSectionTree, type SectionNode } from "@/lib/books/section-tree";
import { hierarchyTargets } from "@/lib/books/hierarchy-targets";
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
  const [deletePending, startDelete] = useTransition();
  const [message, setMessage] = useState<ActionState>(initialActionState);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingNode, setDeletingNode] = useState<SectionNode | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const openMenuRef = useRef<HTMLDivElement | null>(null);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const flat = flattenSectionTree(nodes);
  const chapters = flat.filter((node) => node.type === "CHAPTER");
  /**
   * El índice tiene su propio scroll. Al abrir un capítulo hay que llevarlo a
   * la vista: en un libro largo el árbol se quedaba siempre al principio y
   * había que buscar a mano la sección que se estaba editando.
   */
  useEffect(() => {
    if (collapsed) return;

    const tree = treeRef.current;
    const activeRow = tree?.querySelector<HTMLElement>(".studio-section-row.is-current");

    if (!activeRow) return;

    // Un grupo cerrado por el usuario escondería la fila; se abre antes de
    // medir para que el desplazamiento apunte a la posición definitiva.
    let group = activeRow.closest("details");

    while (group) {
      group.open = true;
      group = group.parentElement?.closest("details") ?? null;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = window.requestAnimationFrame(() => {
      activeRow.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeSectionId, collapsed]);
  useEffect(() => {
    if (!openMenuId) return;
    const closeOnOutsideTap = (event: PointerEvent): void => {
      if (!openMenuRef.current?.contains(event.target as Node)) setOpenMenuId(null);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpenMenuId(null);
    };
    document.addEventListener("pointerdown", closeOnOutsideTap, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideTap, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenuId]);
  const move = (node: SectionNode, position: number, parentId = node.parentId): void => {
    if (!canMove || pending || deletePending) return;
    const data = new FormData();
    data.set("sectionId", node.id);
    data.set("parentId", parentId ?? "");
    data.set("position", String(position));
    startTransition(async () => {
      const result = await moveSectionAction(initialActionState, data);
      setMessage(result);
      if (result.status === "success") router.refresh();
    });
  };
  const confirmDelete = (formData: FormData): void => {
    if (!deletingNode || deletePending) return;
    const deletesActiveSection = flattenSectionTree([deletingNode]).some(
      (section) => section.id === activeSectionId,
    );
    formData.set("sectionId", deletingNode.id);
    // La acción devuelve el resultado al modal; la navegación se decide aquí
    // para que borrar la sección abierta no deje el editor en una ruta rota.
    formData.set("stayInEditor", "on");
    startDelete(async () => {
      const result = await deleteSectionAction(initialActionState, formData);
      setMessage(result);
      if (result.status !== "success") return;
      setDeletingNode(null);
      if (deletesActiveSection) router.push(`/books/${bookId}`);
      else router.refresh();
    });
  };
  const renderNodes = (list: SectionNode[], depth: number): ReactNode => (
    <ul className="studio-section-list">
      {list.map((node, groupIndex) => {
        const siblings = depth === 0 ? nodes : list;
        const index = siblings.findIndex((item) => item.id === node.id);
        const targets = hierarchyTargets(node, nodes);
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
                prefetch={
                  node.type === "COPYRIGHT" || node.type === "TABLE_OF_CONTENTS" ? false : undefined
                }
                href={sectionNavigationHref(bookId, node)}
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
                <div
                  className="studio-section-menu"
                  ref={openMenuId === node.id ? openMenuRef : null}
                >
                  <button
                    type="button"
                    className="studio-section-menu-trigger"
                    aria-label={`Opciones de ${node.title}`}
                    title="Opciones de la sección"
                    aria-haspopup="true"
                    aria-expanded={openMenuId === node.id}
                    aria-controls={`studio-section-menu-${node.id}`}
                    onClick={() =>
                      setOpenMenuId((current) => (current === node.id ? null : node.id))
                    }
                  >
                    ⋮
                  </button>
                  {openMenuId === node.id ? (
                    <div
                      id={`studio-section-menu-${node.id}`}
                      role="group"
                      aria-label={`Opciones de ${node.title}`}
                    >
                      {canMove ? (
                        <>
                          <button
                            type="button"
                            disabled={pending || deletePending || groupIndex === 0}
                            onClick={() => {
                              setOpenMenuId(null);
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
                            disabled={pending || deletePending || groupIndex === list.length - 1}
                            onClick={() => {
                              setOpenMenuId(null);
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
                      {canMove ? (
                        <>
                          <button
                            type="button"
                            disabled={pending || deletePending || !targets.indent}
                            onClick={() => {
                              setOpenMenuId(null);
                              if (targets.indent)
                                move(node, targets.indent.position, targets.indent.parentId);
                            }}
                          >
                            Sangrar
                          </button>
                          <button
                            type="button"
                            disabled={pending || deletePending || !targets.outdent}
                            onClick={() => {
                              setOpenMenuId(null);
                              if (targets.outdent)
                                move(node, targets.outdent.position, targets.outdent.parentId);
                            }}
                          >
                            Sacar de
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="studio-section-menu-danger"
                        aria-label={
                          canDelete
                            ? `Eliminar parte «${node.title}»`
                            : `Eliminar «${node.title}»: solo propietarios o administradores`
                        }
                        disabled={!canDelete || deletePending}
                        onClick={() => {
                          setOpenMenuId(null);
                          setMessage(initialActionState);
                          setDeletingNode(node);
                        }}
                      >
                        <StudioIcon name="trash" />
                        Eliminar parte
                      </button>
                      {!canDelete ? (
                        <p className="studio-section-delete-help">
                          Eliminar partes: solo propietarios o administradores.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
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
          <Link
            className="mt-2 block text-xs text-ink-soft underline underline-offset-4"
            href={`/books/${bookId}/laboratorio`}
            prefetch={false}
          >
            Laboratorio Editorial →
          </Link>
          <div id="studio-chapter-tree" ref={treeRef} className="studio-chapter-tree">
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
                  <div className="space-y-2 py-2">
                    <Link
                      className="studio-group-empty block underline"
                      prefetch={false}
                      href={editorialGalleryHref(bookId, "legal")}
                    >
                      Página legal · Plantillas
                    </Link>
                    <Link
                      className="studio-group-empty block underline"
                      prefetch={false}
                      href={editorialGalleryHref(bookId, "toc")}
                    >
                      Índice (automático) · Diseños
                    </Link>
                  </div>
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
      {deletingNode ? (
        <Dialog
          abierto
          titulo={`¿Eliminar «${deletingNode.title}»?`}
          descripcion={`Se eliminará esta parte${deletingNode.children.length ? ` y sus ${flattenSectionTree(deletingNode.children).length} subsecciones` : ""}. Esta acción la quitará del borrador.`}
          onCerrar={() => {
            if (!deletePending) setDeletingNode(null);
          }}
        >
          <form action={confirmDelete} className="flex flex-wrap justify-end gap-2">
            <input type="hidden" name="sectionId" value={deletingNode.id} />
            <input type="hidden" name="stayInEditor" value="on" />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={deletePending}
              onClick={() => setDeletingNode(null)}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-danger btn-sm" disabled={deletePending}>
              {deletePending ? "Eliminando…" : "Eliminar parte"}
            </button>
          </form>
          {message.status === "error" && message.message ? (
            <p className="alert alert-error" role="alert">
              {message.message}
            </p>
          ) : null}
        </Dialog>
      ) : null}
    </aside>
  );
}

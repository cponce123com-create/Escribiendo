"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { ManuscriptSidebar } from "@/components/books/manuscript-sidebar";
import type { SectionNode } from "@/lib/books/section-tree";

const SIDEBAR_PREFERENCE_KEY = "escribiendo-manuscript-sidebar-collapsed";
const SIDEBAR_PREFERENCE_EVENT = "escribiendo-manuscript-sidebar-change";
let fallbackCollapsed = false;

function readSidebarPreference(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY) === "true";
  } catch {
    return fallbackCollapsed;
  }
}

function subscribeToSidebarPreference(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(SIDEBAR_PREFERENCE_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SIDEBAR_PREFERENCE_EVENT, onChange);
  };
}

interface ManuscriptWorkspaceProps {
  bookId: string;
  nodes: SectionNode[];
  activeSectionId: string;
  canMove: boolean;
  editor: ReactNode;
  details: ReactNode;
}

/** Organiza el espacio de escritura y recuerda el estado del índice del manuscrito. */
export function ManuscriptWorkspace({
  bookId,
  nodes,
  activeSectionId,
  canMove,
  editor,
  details,
}: ManuscriptWorkspaceProps) {
  const collapsed = useSyncExternalStore(
    subscribeToSidebarPreference,
    readSidebarPreference,
    () => false,
  );

  const toggleSidebar = (): void => {
    fallbackCollapsed = !collapsed;

    try {
      window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(fallbackCollapsed));
    } catch {
      // La preferencia no puede actualizarse si el navegador bloquea el almacenamiento local.
    }

    window.dispatchEvent(new Event(SIDEBAR_PREFERENCE_EVENT));
  };

  return (
    <div
      className={`grid items-start gap-4 transition-[grid-template-columns] duration-300 ease-out xl:gap-5 ${
        collapsed
          ? "xl:grid-cols-[3.5rem_minmax(0,1.8fr)_minmax(15rem,0.8fr)]"
          : "xl:grid-cols-[16rem_minmax(0,1.6fr)_minmax(15rem,0.8fr)]"
      }`}
    >
      <ManuscriptSidebar
        bookId={bookId}
        nodes={nodes}
        activeSectionId={activeSectionId}
        canMove={canMove}
        collapsed={collapsed}
        onToggle={toggleSidebar}
      />
      <section className="min-w-0" aria-label="Manuscrito">
        {editor}
      </section>
      {details}
    </div>
  );
}

"use client";

import { createContext, useSyncExternalStore, type ReactNode } from "react";
import { StudioIcon } from "./studio-icon";
import {
  COMPACT_EDITOR_QUERY,
  editorPanelCollapsed,
  editorPanelKey,
  type EditorPanel,
} from "@/lib/ui/editor-panels";
import { ManuscriptSidebar } from "@/components/books/manuscript-sidebar";
import type { SectionNode } from "@/lib/books/section-tree";

export const InspectorPanelContext = createContext<{
  collapsed: boolean;
  toggle: () => void;
}>({ collapsed: false, toggle: () => undefined });

const PANEL_EVENT = "escribiendo-editor-panels-change";
const fallback = new Map<string, boolean>();

function compactViewport(): boolean {
  return window.matchMedia(COMPACT_EDITOR_QUERY).matches;
}

function readPanel(panel: EditorPanel): boolean {
  const compact = compactViewport();
  const key = editorPanelKey(panel, compact);
  try {
    return editorPanelCollapsed(window.localStorage.getItem(key), compact);
  } catch {
    return fallback.get(key) ?? compact;
  }
}

function subscribeToPanels(onChange: () => void): () => void {
  const media = window.matchMedia(COMPACT_EDITOR_QUERY);
  window.addEventListener("storage", onChange);
  window.addEventListener(PANEL_EVENT, onChange);
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PANEL_EVENT, onChange);
    media.removeEventListener("change", onChange);
  };
}

function togglePanel(panel: EditorPanel, current: boolean): void {
  const key = editorPanelKey(panel, compactViewport());
  fallback.set(key, !current);
  try {
    window.localStorage.setItem(key, String(!current));
  } catch {
    // La sesión conserva el estado aunque el navegador bloquee localStorage.
  }
  window.dispatchEvent(new Event(PANEL_EVENT));
}

const readChapters = () => readPanel("chapters");
const readInspector = () => readPanel("inspector");
const serverSnapshot = () => false;

interface ManuscriptWorkspaceProps {
  bookId: string;
  nodes: SectionNode[];
  activeSectionId: string;
  canMove: boolean;
  canDelete: boolean;
  canCreate: boolean;
  editor: ReactNode;
  details: ReactNode;
}

/** Organiza el espacio de escritura y recuerda el estado del índice del manuscrito. */
export function ManuscriptWorkspace({
  bookId,
  nodes,
  activeSectionId,
  canMove,
  canDelete,
  canCreate,
  editor,
  details,
}: ManuscriptWorkspaceProps) {
  const collapsed = useSyncExternalStore(subscribeToPanels, readChapters, serverSnapshot);
  const inspectorCollapsed = useSyncExternalStore(subscribeToPanels, readInspector, serverSnapshot);
  const toggleSidebar = () => togglePanel("chapters", collapsed);
  const toggleInspector = () => togglePanel("inspector", inspectorCollapsed);

  return (
    <div
      className={`studio-workspace ${collapsed ? "studio-workspace--collapsed" : ""} ${
        inspectorCollapsed ? "studio-workspace--inspector-collapsed" : ""
      }`}
    >
      <nav className="studio-mobile-panels" aria-label="Paneles del editor">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-expanded={!collapsed}
          aria-controls="studio-manuscript-navigation"
        >
          <StudioIcon name="book" /> Capítulos
        </button>
        <span>Espacio de escritura</span>
        <button
          type="button"
          onClick={toggleInspector}
          aria-expanded={!inspectorCollapsed}
          aria-controls="studio-editorial-panel"
        >
          <StudioIcon name="settings" /> Herramientas
        </button>
      </nav>
      <ManuscriptSidebar
        bookId={bookId}
        nodes={nodes}
        activeSectionId={activeSectionId}
        canMove={canMove}
        canDelete={canDelete}
        canCreate={canCreate}
        collapsed={collapsed}
        onToggle={toggleSidebar}
      />
      <InspectorPanelContext.Provider
        value={{ collapsed: inspectorCollapsed, toggle: toggleInspector }}
      >
        {details}
      </InspectorPanelContext.Provider>
      <section className="studio-writing-column min-w-0" aria-label="Manuscrito">
        {editor}
      </section>
    </div>
  );
}

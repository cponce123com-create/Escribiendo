"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

const SIDEBAR_KEY = "escribiendo-app-sidebar-collapsed";
const SIDEBAR_EVENT = "escribiendo-app-sidebar-change";
let fallbackCollapsed = false;

interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

function readPreference(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "true";
  } catch {
    return fallbackCollapsed;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(SIDEBAR_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SIDEBAR_EVENT, onChange);
  };
}

/** Marco de la aplicación con estado compartido para plegar el menú global. */
export function AppShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const collapsed = useSyncExternalStore(subscribe, readPreference, () => false);

  const toggle = (): void => {
    fallbackCollapsed = !collapsed;

    try {
      window.localStorage.setItem(SIDEBAR_KEY, String(fallbackCollapsed));
    } catch {
      // El menú también funciona durante esta sesión si el navegador bloquea el almacenamiento.
    }

    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  };

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      <div className={`app-shell min-h-svh ${collapsed ? "app-shell--sidebar-collapsed" : ""}`}>
        <a href="#contenido" className="skip-link">
          Saltar al contenido
        </a>
        {sidebar}
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

/** Control accesible del menú global, visible en el encabezado de escritorio. */
export function AppSidebarToggle() {
  const context = useContext(SidebarContext);

  if (!context) {
    throw new Error("AppSidebarToggle debe mostrarse dentro de AppShell.");
  }

  return (
    <button
      type="button"
      className="app-sidebar-toggle hidden lg:grid"
      aria-label={context.collapsed ? "Mostrar menú principal" : "Ocultar menú principal"}
      title={context.collapsed ? "Mostrar menú principal" : "Ocultar menú principal"}
      aria-expanded={!context.collapsed}
      aria-controls="navegacion-principal"
      onClick={context.toggle}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5">
        <path
          d="M3 5.5h14M3 10h14M3 14.5h14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d={context.collapsed ? "M6.5 3v14" : "M13.5 3v14"}
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>
    </button>
  );
}

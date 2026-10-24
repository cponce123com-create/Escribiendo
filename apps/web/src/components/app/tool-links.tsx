"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookIcon, LayoutIcon, UsersIcon } from "@/components/icons";

const TOOL_ITEMS = [
  { href: "/planning", label: "Planificación", icon: LayoutIcon },
  { href: "/characters", label: "Personajes", icon: UsersIcon },
  { href: "/narrative", label: "Análisis narrativo", icon: LayoutIcon },
  { href: "/worlds", label: "Mundos", icon: BookIcon },
] as const;

interface ToolLinksProps {
  variant?: "sidebar" | "mobile";
}

/** Accesos a las herramientas de historia, con estado activo por ruta. */
export function ToolLinks({ variant = "sidebar" }: ToolLinksProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Herramientas de historia"
      className={variant === "mobile" ? "flex gap-1 overflow-x-auto px-3 pb-2" : "space-y-1"}
    >
      {TOOL_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={variant === "mobile" ? "nav-item shrink-0" : "nav-item"}
            aria-current={active ? "page" : undefined}
          >
            <Icon />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

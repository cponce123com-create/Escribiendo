"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardIcon, UserIcon } from "@/components/icons";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Panel", icon: DashboardIcon },
  { href: "/account", label: "Mi cuenta", icon: UserIcon },
] as const;

interface NavLinksProps {
  variant?: "sidebar" | "mobile";
}

export function NavLinks({ variant = "sidebar" }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className={variant === "mobile" ? "flex gap-1 overflow-x-auto px-3 pb-2" : "space-y-1"}
    >
      {NAV_ITEMS.map((item) => {
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

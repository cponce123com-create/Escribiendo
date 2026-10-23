"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { StudioIcon } from "./studio-icon";

export function StudioRail() {
  const pathname = usePathname();
  return (
    <div className="studio-rail">
      <Link href="/dashboard" className="studio-rail-logo" aria-label="Escribiendo · Panel">
        <Image src="/icon.png" alt="" width={38} height={38} priority />
      </Link>
      <nav aria-label="Herramientas del estudio">
        <Link href={pathname} aria-current="page">
          <StudioIcon name="pen" />
          <span>Manuscrito</span>
        </Link>
        <Link href="/books">
          <StudioIcon name="book" />
          <span>Biblioteca</span>
        </Link>
        <Link href="/notes">
          <StudioIcon name="note" />
          <span>Notas</span>
        </Link>
        <button type="button" disabled title="Investigación · Pendiente de implementación">
          <StudioIcon name="search" />
          <span>Investigación</span>
        </button>
        <Link href="/stats">
          <StudioIcon name="chart" />
          <span>Estadísticas</span>
        </Link>
      </nav>
      <Link href="/account" className="studio-settings">
        <StudioIcon name="settings" />
        <span>Ajustes</span>
      </Link>
    </div>
  );
}

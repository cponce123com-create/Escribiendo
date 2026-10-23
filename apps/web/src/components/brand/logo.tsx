import Image from "next/image";
import Link from "next/link";

interface LogoProps {
  href?: string;
  inverse?: boolean;
  className?: string;
}

export function Logo({ href = "/", inverse = false, className = "" }: LogoProps) {
  return (
    <Link
      href={href}
      className={`brand ${inverse ? "brand-inverse" : ""} ${className}`}
      aria-label="ESCRIBIENDO, ir al inicio"
    >
      <span className="brand-mark" aria-hidden="true">
        <Image src="/icon.png" alt="" width={128} height={128} priority />
      </span>
      <span>
        <span className="brand-name">ESCRIBIENDO</span>
        <span className="brand-sub">EDITORIAL NO PARA TODOS</span>
      </span>
    </Link>
  );
}

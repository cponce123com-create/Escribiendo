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
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path
            d="M8 11h10.2a5.8 5.8 0 0 1 5.8 5.8V37a5.9 5.9 0 0 0-5.9-5.2H8V11Z"
            strokeLinejoin="round"
          />
          <path
            d="M40 11H29.8a5.8 5.8 0 0 0-5.8 5.8V37a5.9 5.9 0 0 1 5.9-5.2H40V11Z"
            strokeLinejoin="round"
          />
          <path d="M24 34V23.5" strokeLinecap="round" />
        </svg>
      </span>
      <span>
        <span className="brand-name">ESCRIBIENDO</span>
        <span className="brand-sub">EDITORIAL NO PARA TODOS</span>
      </span>
    </Link>
  );
}

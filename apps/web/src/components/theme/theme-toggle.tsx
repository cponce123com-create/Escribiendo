"use client";

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="theme-icon-sun"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="theme-icon-moon"
      aria-hidden="true"
    >
      <path d="M20.8 15.3A8.6 8.6 0 0 1 8.7 3.2 8.7 8.7 0 1 0 20.8 15.3Z" strokeLinejoin="round" />
    </svg>
  );
}

export function ThemeToggle() {
  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = nextTheme;

    try {
      window.localStorage.setItem("escribiendo-theme", nextTheme);
    } catch {
      // La preferencia visual no es información crítica.
    }
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="icon-button"
      aria-label="Cambiar entre tema claro y oscuro"
      title="Cambiar tema"
    >
      <SunIcon />
      <MoonIcon />
    </button>
  );
}

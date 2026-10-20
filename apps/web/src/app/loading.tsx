export default function Loading() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-ink-muted" role="status">
        <span className="spinner text-accent" aria-hidden="true" />
        Cargando…
      </div>
    </div>
  );
}

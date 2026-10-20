export default function AppLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8" role="status" aria-label="Cargando el panel">
      <div className="panel p-8">
        <div className="skeleton h-3 w-28" />
        <div className="skeleton mt-5 h-10 w-3/4" />
        <div className="skeleton mt-4 h-4 w-2/3" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div className="stat-card" key={item}>
            <div className="skeleton h-3 w-20" />
            <div className="skeleton mt-5 h-8 w-16" />
            <div className="skeleton mt-3 h-3 w-24" />
          </div>
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

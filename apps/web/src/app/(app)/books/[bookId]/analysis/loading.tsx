export default function BookAnalysisLoading() {
  return (
    <main
      className="mx-auto max-w-7xl space-y-6"
      aria-busy="true"
      aria-label="Cargando análisis editorial"
    >
      <p className="eyebrow">Escritura asistida</p>
      <div className="h-10 max-w-xl animate-pulse rounded bg-surface-raised" />
      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="panel min-h-40 animate-pulse p-5" />
        <div className="space-y-5">
          <div className="panel min-h-52 animate-pulse p-6" />
          <div className="panel min-h-52 animate-pulse p-6" />
          <div className="panel min-h-52 animate-pulse p-6" />
        </div>
      </div>
      <span className="sr-only">Calculando observaciones y estadísticas del manuscrito.</span>
    </main>
  );
}

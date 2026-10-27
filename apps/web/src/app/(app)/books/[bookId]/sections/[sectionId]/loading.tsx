/**
 * Esqueleto del editor de manuscrito.
 *
 * Cambiar de capítulo recompone la página en el servidor. Sin este archivo,
 * Next.js mostraba el esqueleto del panel —tarjetas de métricas— y el salto se
 * leía como una recarga de la aplicación.
 */
export default function SectionLoading() {
  return (
    <div className="studio-workspace" role="status">
      <aside className="manuscript-navigation studio-manuscript-nav" aria-hidden="true">
        <div className="skeleton h-4 w-24" />
        <div className="mt-6 space-y-3">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
            <div
              key={row}
              className={`skeleton h-3 ${
                row % 3 === 0 ? "w-5/6" : row % 3 === 1 ? "w-2/3" : "w-3/4"
              }`}
            />
          ))}
        </div>
      </aside>
      <section className="studio-writing-column min-w-0" aria-hidden="true">
        <div className="studio-chapter-hero">
          <div className="skeleton h-3 w-28" />
          <div className="skeleton mt-6 h-12 w-2/3" />
          <div className="skeleton mt-4 h-3 w-40" />
        </div>
        <div className="panel space-y-3 p-6">
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-11/12" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-4/5" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-3/5" />
        </div>
      </section>
      <div className="studio-inspector" aria-hidden="true">
        <div className="space-y-3 pt-4">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-5/6" />
        </div>
      </div>
      <span className="sr-only">Cargando el capítulo…</span>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getBook, getSectionTree } from "@/lib/books/queries";
import { flattenSectionTree } from "@/lib/books/section-tree";
import { laboratoryTools } from "@/lib/books/laboratory-navigation";
import { prisma } from "@/lib/db";

export const metadata = { title: "Laboratorio Editorial" };
export default async function LaboratoryPage({ params }: { params: Promise<{ bookId: string }> }) {
  const session = await requireSession();
  const { bookId } = await params;
  const book = await getBook(session, bookId);
  if (!book) notFound();
  const [tree, characterCount] = await Promise.all([
    getSectionTree(session, bookId),
    prisma.storyCharacter.count({
      where: { bookId, workspaceId: session.workspace.id, deletedAt: null },
    }),
  ]);
  const sections = flattenSectionTree(tree);
  const first = sections.find((node) =>
    ["CHAPTER", "SUBCHAPTER", "PROLOGUE", "INTRODUCTION", "INTERLUDE", "EPILOGUE"].includes(
      node.type,
    ),
  );
  const tools = laboratoryTools(bookId, first?.id);
  const format = (value: number) => new Intl.NumberFormat("es-PE").format(value);
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link className="btn btn-ghost btn-sm" href={`/books/${bookId}`}>
        ← Volver al libro
      </Link>
      <header className="panel space-y-3 p-6 sm:p-8">
        <p className="eyebrow">{book.title}</p>
        <h1 className="font-serif text-3xl text-ink sm:text-4xl">Laboratorio Editorial</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-ink-soft">
          Herramientas de análisis local para revisar tu obra. Tú decides qué sugerencias aceptar.
          Ningún análisis modifica el manuscrito ni lo envía a servicios externos de análisis.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link className="btn btn-primary" prefetch={false} href={`/books/${bookId}/analysis`}>
            Analizar manuscrito
          </Link>
          <Link
            className="btn btn-secondary"
            prefetch={false}
            href={`/books/${bookId}/analysis#analysis-options`}
          >
            Elegir capítulo y reglas
          </Link>
        </div>
      </header>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Resumen del manuscrito">
        {[
          ["Palabras guardadas", book.wordCount],
          ["Capítulos", sections.filter((node) => node.type === "CHAPTER").length],
          ["Secciones", sections.length],
          ["Personajes registrados", characterCount],
        ].map(([label, value]) => (
          <div key={String(label)} className="panel p-4">
            <dt className="meta-label">{label}</dt>
            <dd className="mt-2 font-serif text-3xl text-ink">{format(Number(value))}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-ink-muted">
        Las observaciones y métricas se calculan al abrir su análisis. Los recuentos de esta
        pantalla corresponden al contenido guardado; no incluyen cambios pendientes del editor.
      </p>
      <nav
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-label="Categorías del Laboratorio Editorial"
      >
        {tools.map((tool) => (
          <article key={tool.id} className="panel flex min-w-0 flex-col p-5">
            <h2 className="font-serif text-xl text-ink">{tool.name}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">{tool.description}</p>
            <Link
              className="btn btn-secondary btn-sm mt-4 self-start"
              href={tool.href}
              prefetch={false}
            >
              {tool.action}
            </Link>
          </article>
        ))}
      </nav>
    </div>
  );
}

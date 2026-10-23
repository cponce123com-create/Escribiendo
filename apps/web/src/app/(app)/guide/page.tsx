import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Guía del estudio" };
export default function GuidePage() {
  const steps = [
    {
      title: "1. Dale un hogar a tu historia",
      text: "En Biblioteca puedes crear un libro, definir su autoría y organizar sus secciones. Los capítulos se pueden reordenar desde el manuscrito.",
      href: "/books",
      label: "Ir a la biblioteca",
    },
    {
      title: "2. Escribe con espacio para pensar",
      text: "El editor guarda tus cambios y mantiene un historial de revisiones. Pliega los menús para concentrarte. El nombre del capítulo se imprime automáticamente: no hace falta repetirlo en el texto.",
      href: "/books",
      label: "Abrir un manuscrito",
    },
    {
      title: "3. No pierdas una idea",
      text: "Guarda tus notas junto al libro o capítulo correspondiente. Las notas son privadas de su autor y puedes fijar las que quieras tener a mano.",
      href: "/notes",
      label: "Ver mis notas",
    },
    {
      title: "4. Avanza a tu ritmo",
      text: "En Estadísticas puedes definir objetivos y consultar las palabras añadidas a tus manuscritos. Las cifras se calculan a partir de las revisiones guardadas.",
      href: "/stats",
      label: "Definir objetivos",
    },
    {
      title: "5. Prepara tu edición",
      text: "Abre un libro para elegir su maqueta, revisar la vista previa y exportar en PDF, EPUB o DOCX. Comprueba los saltos de página y las notas antes de distribuirlo.",
      href: "/books",
      label: "Elegir un libro",
    },
    {
      title: "6. Trabaja con tu equipo",
      text: "Consulta los miembros de tu espacio y sus permisos. Las acciones disponibles dependen de tu rol dentro del estudio.",
      href: "/team",
      label: "Ver equipo",
    },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <p className="eyebrow">Guía y recursos</p>
        <h1 className="mt-3 text-4xl">Todo empieza con una página.</h1>
        <p className="mt-4 text-ink-soft">
          Conoce las herramientas de tu estudio y encuentra tu forma de escribir.
        </p>
      </header>
      <div className="grid gap-5 md:grid-cols-2">
        {steps.map((step) => (
          <section className="panel p-6" key={step.title}>
            <h2 className="text-2xl">{step.title}</h2>
            <p className="my-4 text-sm leading-relaxed text-ink-soft">{step.text}</p>
            <Link href={step.href} className="btn btn-secondary btn-sm">
              {step.label}
            </Link>
          </section>
        ))}
      </div>
    </div>
  );
}

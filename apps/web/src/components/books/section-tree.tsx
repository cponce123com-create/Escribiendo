import Link from "next/link";
import { SECTION_TYPE_LABELS, formatNumber } from "@/lib/ui/format";
import type { SectionNode } from "@/lib/books/section-tree";

interface SectionTreeProps {
  bookId: string;
  nodes: SectionNode[];
  activeSectionId?: string;
}

/**
 * Estructura de secciones de un libro.
 *
 * Se renderiza en el servidor: la jerarquía se calcula con los datos ya
 * cargados y no depende de JavaScript.
 */
export function SectionTree({ bookId, nodes, activeSectionId }: SectionTreeProps) {
  if (nodes.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        Este libro todavía no tiene secciones. Añade la primera para empezar a escribir.
      </p>
    );
  }

  const renderNodes = (list: SectionNode[], depth: number): React.ReactNode => {
    return list.map((node) => {
      const href = `/books/${bookId}/sections/${node.id}`;
      const isActive = node.id === activeSectionId;

      return (
        <li key={node.id} id={`section-${node.id}`} className="scroll-mt-24">
          <Link
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center justify-between gap-3 rounded-sm px-3 py-2 text-sm transition-colors ${
              isActive ? "bg-accent/10 text-ink" : "text-ink-soft hover:bg-ink/5"
            }`}
            style={depth > 0 ? { paddingLeft: `${0.75 + depth * 1.1}rem` } : undefined}
          >
            <span className="min-w-0 truncate">
              <span className="text-ink-muted">
                {SECTION_TYPE_LABELS[node.type] ?? node.type} ·{" "}
              </span>
              {node.title}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-ink-muted">
              {formatNumber(node.wordCount)}
            </span>
          </Link>

          {node.children.length > 0 ? <ul>{renderNodes(node.children, depth + 1)}</ul> : null}
        </li>
      );
    });
  };

  return <ul className="space-y-0.5">{renderNodes(nodes, 0)}</ul>;
}

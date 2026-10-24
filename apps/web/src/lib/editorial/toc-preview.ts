import "server-only";
import type { TocParameters } from "@escribiendo/templates";
import type { SessionContext } from "@/lib/auth/session";
import {
  buildPreview,
  loadPreviewCover,
  loadPreviewEdition,
  loadPreviewSections,
  type PreviewResult,
} from "@/lib/layout/preview";
import { loadBookMatter, type BookMatter } from "./book-matter";
import { tocPreviewCacheKey } from "./toc-preview-cache";

/**
 * Caché de miniaturas del índice.
 *
 * Componer el libro entero por cada cambio de un control es caro y el
 * resultado solo depende de los contenidos, la configuración de la edición,
 * la portada y los parámetros. La firma cubre esos datos; la caducidad de
 * 60 s es una red de seguridad ante una invalidación que se escape y el
 * límite de entradas evita crecer sin control en un proceso largo.
 */
const TTL_MS = 60_000;
const MAX_ENTRIES = 12;
const cache = new Map<string, { expiresAt: number; value: PreviewResult | null }>();

async function composeTocPreview(
  session: SessionContext,
  bookId: string,
  parameters: TocParameters,
  matter: BookMatter,
): Promise<PreviewResult | null> {
  const preview = await buildPreview(session, bookId, {
    matterOverride: {
      ...matter,
      tocMode: "AUTOMATIC",
      tocParameters: parameters,
      tocOptions: {
        depth: parameters.tocDepth,
        includeFrontMatter: parameters.tocIncludeFrontMatter,
        includeBackMatter: parameters.tocIncludeBackMatter,
      },
    },
  });

  return preview
    ? {
        ...preview,
        cover: null,
        pages: preview.pages.filter((page) =>
          page.blocks.some((block) => block.sectionId === "matter-toc"),
        ),
      }
    : null;
}

export async function buildTocPreview(
  session: SessionContext,
  bookId: string,
  parameters: TocParameters,
): Promise<PreviewResult | null> {
  const sections = await loadPreviewSections(session, bookId);
  const matter = await loadBookMatter(session, bookId, sections);

  if (!matter) return null;

  const edition = await loadPreviewEdition(session, bookId);
  const cover = await loadPreviewCover(session, bookId);
  const key = tocPreviewCacheKey({
    bookId,
    parameters,
    sections,
    matter,
    edition,
    cover,
  });
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && cached.expiresAt > now) {
    // Reinsertar mantiene el orden de uso del Map (LRU aproximado).
    cache.delete(key);
    cache.set(key, cached);
    return cached.value;
  }

  const value = await composeTocPreview(session, bookId, parameters, matter);
  cache.set(key, { expiresAt: now + TTL_MS, value });

  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;

    if (oldest !== undefined) cache.delete(oldest);
  }

  return value;
}

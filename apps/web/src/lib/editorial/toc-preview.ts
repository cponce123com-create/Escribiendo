import "server-only";
import type { TocParameters } from "@escribiendo/templates";
import type { SessionContext } from "@/lib/auth/session";
import { buildPreview, loadPreviewSections } from "@/lib/layout/preview";
import { loadBookMatter } from "./book-matter";
export async function buildTocPreview(
  session: SessionContext,
  bookId: string,
  parameters: TocParameters,
) {
  const sections = await loadPreviewSections(session, bookId);
  const matter = await loadBookMatter(session, bookId, sections);
  if (!matter) return null;
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

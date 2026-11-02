/** Groups measured reader blocks into pages without splitting normal paragraphs. */
export function paginateReaderBlocks(
  heights: readonly number[],
  pageHeight: number,
  gap = 16,
): number[][] {
  if (heights.length === 0) return [];
  const pages: number[][] = [];
  let page: number[] = [];
  let used = 0;

  heights.forEach((rawHeight, index) => {
    const height = Math.max(0, rawHeight);
    const nextHeight = page.length === 0 ? height : used + gap + height;
    if (page.length > 0 && nextHeight > pageHeight) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(index);
    used += (page.length > 1 ? gap : 0) + height;
  });

  if (page.length > 0) pages.push(page);
  return pages;
}

export function readerPageForBlock(pages: readonly number[][], blockIndex: number): number {
  if (blockIndex < 0) return 0;
  const index = pages.findIndex((page) => page.includes(blockIndex));
  return Math.max(0, index);
}

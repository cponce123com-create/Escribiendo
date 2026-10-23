-- Read only. Run on a disposable copy first; never repair manuscripts implicitly.
SELECT child.id, child."bookId", child."parentId",
  CASE WHEN parent.id IS NULL THEN 'MISSING_PARENT'
       WHEN parent."bookId" <> child."bookId" THEN 'CROSS_BOOK_PARENT'
       WHEN parent."deletedAt" IS NOT NULL AND child."deletedAt" IS NULL THEN 'DELETED_PARENT'
  END AS issue
FROM book_sections child
LEFT JOIN book_sections parent ON parent.id = child."parentId"
WHERE child."parentId" IS NOT NULL AND (
  parent.id IS NULL OR parent."bookId" <> child."bookId" OR
  (parent."deletedAt" IS NOT NULL AND child."deletedAt" IS NULL)
);

WITH RECURSIVE chain AS (
  SELECT id AS origin, id, "parentId", ARRAY[id] AS path, false AS cycle
  FROM book_sections
  UNION ALL
  SELECT chain.origin, parent.id, parent."parentId", chain.path || parent.id,
    parent.id = ANY(chain.path)
  FROM chain JOIN book_sections parent ON parent.id = chain."parentId"
  WHERE NOT chain.cycle
)
SELECT DISTINCT origin AS cyclic_section FROM chain WHERE cycle;

SELECT "bookId", "parentId", "sortOrder", COUNT(*)
FROM book_sections WHERE "deletedAt" IS NULL
GROUP BY "bookId", "parentId", "sortOrder" HAVING COUNT(*) > 1;

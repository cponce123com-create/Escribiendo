-- PROPOSAL ONLY: not a deploy migration. Requires disposable PostgreSQL validation
-- and review of audit-section-integrity.sql results before production approval.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS book_sections_id_book_key ON book_sections (id, "bookId");
ALTER TABLE book_sections ADD CONSTRAINT book_sections_parent_same_book
  FOREIGN KEY ("parentId", "bookId") REFERENCES book_sections (id, "bookId")
  ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE book_sections ADD CONSTRAINT book_sections_not_self_parent
  CHECK ("parentId" IS DISTINCT FROM id) NOT VALID;
COMMIT;
-- After explicit remediation of existing inconsistencies:
-- ALTER TABLE book_sections VALIDATE CONSTRAINT book_sections_parent_same_book;
-- ALTER TABLE book_sections VALIDATE CONSTRAINT book_sections_not_self_parent;
-- Rollback of added guards (does not alter manuscript content):
-- ALTER TABLE book_sections DROP CONSTRAINT book_sections_parent_same_book;
-- ALTER TABLE book_sections DROP CONSTRAINT book_sections_not_self_parent;
-- DROP INDEX book_sections_id_book_key;
-- Multi-row cycles still require application serialization and integration tests.

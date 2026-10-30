import { expect, it } from "vitest";
import { registerVarcharColumns, acceptVarcharExpansion } from "./migration-safety";
const expansion = 'ALTER TABLE "story_plan_items" ALTER COLUMN "title" SET DATA TYPE VARCHAR(300);';
function limits() {
  const map = new Map<string, number>();
  registerVarcharColumns(
    'CREATE TABLE "story_plan_items" (\n "title" VARCHAR(200) NOT NULL\n);',
    map,
  );
  return map;
}
it("acepta ampliar un VARCHAR conocido y actualiza el tamaño para migraciones posteriores", () => {
  const map = limits();
  expect(acceptVarcharExpansion(expansion, map)).toBe(true);
  expect(map.get("story_plan_items.title")).toBe(300);
  expect(acceptVarcharExpansion(expansion.replace("300", "250"), map)).toBe(false);
});
it.each([
  expansion.replace("300", "100"),
  expansion.replace("title", "desconocida"),
  expansion.replace("VARCHAR(300)", "TEXT"),
  expansion.replace(";", " USING left(title, 1);"),
  expansion + ' DROP TABLE "books";',
  expansion.replace("300", "999999999"),
])("no exime una transformación destructiva o desconocida: %s", (sql) => {
  expect(acceptVarcharExpansion(sql, limits())).toBe(false);
});
it("no considera seguro convertir un tamaño de origen desconocido", () => {
  expect(acceptVarcharExpansion(expansion, new Map())).toBe(false);
});

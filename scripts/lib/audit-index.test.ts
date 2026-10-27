import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
it("centraliza informes con un índice vigente y enlaces existentes", () => {
  const root = process.cwd();
  const directory = path.join(root, "docs/audits");
  const index = readFileSync(path.join(directory, "README.md"), "utf8");
  expect(index).toContain("Vigente");
  for (const file of readdirSync(directory).filter(
    (name) => name.endsWith(".md") && name !== "README.md",
  )) {
    expect(index, file).toContain(`(${file})`);
    const document = readFileSync(path.join(directory, file), "utf8");
    for (const match of document.matchAll(/\]\(([^)]+)\)/gu)) {
      const link = match[1]!;
      if (!link.includes("://") && !link.startsWith("#")) {
        expect(existsSync(path.resolve(directory, link.split("#")[0]!)), `${file}: ${link}`).toBe(
          true,
        );
      }
    }
  }
  const stub = readFileSync(path.join(root, "auditoria_escribiendo_2026-10-24.md"), "utf8");
  const target = /\]\(([^)]+)\)/u.exec(stub)?.[1];
  expect(target).toBeTruthy();
  expect(existsSync(path.join(root, target!))).toBe(true);
});

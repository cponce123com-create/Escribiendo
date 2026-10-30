/** Visual geometry regression for real route JSX/CSS with isolated server data.
 * Does not replace authenticated E2E: database and child forms are stubbed.
 */
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import type * as ReactModule from "react";
import type * as ReactDOMServer from "react-dom/server";
import { chromium } from "@playwright/test";
import * as modularStructure from "../apps/web/src/lib/story/modular/structure";
import * as planPresentation from "../apps/web/src/lib/story/modular/presentation";
import * as studioIcons from "../apps/web/src/components/books/studio-icon";
import * as storyLabels from "../apps/web/src/lib/story/labels";

const webRequire = createRequire(path.resolve("apps/web/package.json"));
const React = webRequire("react") as typeof ReactModule;
const { renderToStaticMarkup } = webRequire("react-dom/server") as typeof ReactDOMServer;
const postcss = createRequire(webRequire.resolve("@tailwindcss/postcss"))("postcss");
const tailwind = webRequire("@tailwindcss/postcss");
const cssPath = path.resolve("apps/web/src/app/globals.css");
const css = (
  await postcss([tailwind({ base: path.resolve("apps/web") })]).process(
    await readFile(cssPath, "utf8"),
    { from: cssPath },
  )
).css;
const output = path.resolve(process.env.INTERFACE_OUTPUT ?? "/tmp/escribiendo-interface");
await mkdir(output, { recursive: true });
let days = [{ date: "2026-10-22", words: 5209 }];
const option = { value: "OTHER", label: "Una categoría con un nombre largo" };
const mocks: Record<string, unknown> = {
  requireSession: async () => ({ workspace: { id: "test", role: "OWNER" } }),
  prisma: { book: { findMany: async () => [] } },
  listGoals: async () => [],
  getWorkspaceStats: async () => ({
    days,
    total: 5209,
    activeDays: days.length,
    averagePerDay: 174,
  }),
  formatNumber: (value: number) => new Intl.NumberFormat("es-PE").format(value),
  countBooks: async () => 0,
  listBooks: async () => [],
  canPerform: () => true,
  listStoryBooks: async () => [{ id: "test", title: "Un título de libro muy largo ".repeat(8) }],
  getStoryBookOption: async () => null,
  guardStorySchema: (fn: () => unknown) => fn(),
  listCharacters: async () => [],
  listWorlds: async () => [],
  listPlanItems: async () => [],
  CHARACTER_ROLE_VALUES: [],
  WORLD_KIND_VALUES: [],
  CHARACTER_ROLE_OPTIONS: [option],
  WORLD_KIND_OPTIONS: [option],
  BOOK_STATUS_LABELS: { DRAFT: "Borrador", IN_PROGRESS: "En proceso" },
};
// Renderiza el tablero real, no un componente vacío: sus columnas deben
// desplazarse dentro de su región sin ensanchar el documento en móvil.
const modularSource = ts.transpileModule(
  await readFile(path.resolve("apps/web/src/components/story/modular-planning-board.tsx"), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const modularExports: Record<string, ReactModule.ComponentType<Record<string, unknown>>> = {};
vm.runInNewContext(modularSource, {
  exports: modularExports,
  require: (id: string) => {
    if (id === "react") return React;
    if (id === "react/jsx-runtime") return webRequire(id);
    if (id === "next/link")
      return {
        default: ({ children, ...props }: Record<string, unknown>) =>
          React.createElement("a", props, children as ReactModule.ReactNode),
      };
    if (id === "next/image")
      return {
        default: ({ src, alt, width, height }: Record<string, unknown>) =>
          React.createElement("img", { src, alt, width, height }),
      };
    if (id === "@/components/books/studio-icon") return studioIcons;
    if (id === "@/lib/story/modular/presentation") return planPresentation;
    if (id === "@/lib/story/labels") return storyLabels;
    if (id === "@/lib/story/modular/structure") return modularStructure;
    if (id === "@/components/forms/dialog") return { Dialog: () => null };
    if (id === "@/components/forms/form-message") return { FormMessage: () => null };
    if (id === "@/lib/story/modular/actions")
      return {
        modularPlanAction: () => {
          throw new Error("La fixture de geometría no escribe datos.");
        },
      };
    throw new Error(`Dependencia sin fixture: ${id}`);
  },
});
const modularItems = Array.from({ length: 5 }, (_, part) => {
  const common = {
    version: 1,
    sectionId: null,
    createdAt: "2026-01-01",
    status: "IDEA" as const,
    visual: { labels: ["Tema de prueba", "Segundo tema"] },
    summary: "Resumen de prueba para comprobar el ajuste de las tarjetas.",
    goal: "Objetivo de prueba",
    conflict: null,
    outcome: "Cierre de prueba",
    targetWords: 2500,
  };
  return [
    {
      ...common,
      id: `part-${part}`,
      kind: "ACT" as const,
      title: `Parte ${part + 1} · Un título de prueba extenso`,
      parentId: null,
      sortOrder: part,
    },
    ...Array.from({ length: [6, 6, 7, 7, 4][part]! }, (_, chapter) => [
      {
        ...common,
        id: `chapter-${part}-${chapter}`,
        kind: "CHAPTER" as const,
        title: `Capítulo ${[0, 6, 12, 19, 26][part]! + chapter + 1} · Una decisión que transforma el recorrido del personaje`,
        parentId: `part-${part}`,
        sortOrder: chapter,
      },
      {
        ...common,
        id: `scene-${part}-${chapter}`,
        kind: "SCENE" as const,
        title: "Una escena de prueba",
        parentId: `chapter-${part}-${chapter}`,
        sortOrder: 0,
      },
    ]).flat(),
  ];
}).flat();
const modularFixture = {
  book: { id: "test", title: "Libro de prueba visual", narrativeVersion: 0 },
  items: modularStructure.planOrder(modularItems),
  sections: [],
  assets: [],
  manuscriptKey: "0".repeat(64),
};
async function renderRoute(route: string) {
  const filename = path.resolve(`apps/web/src/app/(app)/${route}/page.tsx`);
  const source = await readFile(filename, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports: { default?: (props: unknown) => Promise<ReactModule.ReactNode> } = {};
  vm.runInNewContext(
    js,
    {
      exports,
      require: (id: string) => {
        if (id === "react/jsx-runtime") return webRequire(id);
        if (id === "next/link")
          return {
            default: ({ children, ...props }: Record<string, unknown>) =>
              React.createElement("a", props, children as ReactModule.ReactNode),
          };
        const scopedMocks =
          route === "planning"
            ? {
                ...mocks,
                getStoryBookOption: async () => ({ id: "test", title: "Libro de prueba visual" }),
                loadModularPlan: async () => modularFixture,
                ModularPlanningBoard: modularExports.ModularPlanningBoard,
              }
            : mocks;
        return new Proxy(scopedMocks, {
          get: (target, key: string) => (target as Record<string, unknown>)[key] ?? (() => null),
        });
      },
    },
    { filename },
  );
  assert(exports.default);
  return renderToStaticMarkup(
    await exports.default({ searchParams: Promise.resolve({ q: "prueba" }) }),
  );
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ["--no-sandbox"],
});
let checks = 0;
try {
  const page = await browser.newPage();
  for (const route of ["stats", "books", "characters", "worlds", "planning"]) {
    const scenarios =
      route === "stats"
        ? [
            [{ date: "2026-10-22", words: 5209 }],
            [
              { date: "2026-10-20", words: 0 },
              { date: "2026-10-21", words: 12 },
              { date: "2026-10-22", words: 1000000 },
            ],
            [],
          ]
        : [days];
    for (const [scenario, data] of scenarios.entries()) {
      days = data;
      const markup = await renderRoute(route);
      for (const width of [320, 375, 390, 768, 1024, 1366, 1440, 1920]) {
        await page.setViewportSize({ width, height: width === 1366 ? 768 : 1000 });
        for (const theme of ["light", "dark"]) {
          await page.setContent(
            `<html lang="es" data-theme="${theme}"><head><style>${css}</style></head><body><div class="app-shell frontend-studio"><aside></aside><main id="contenido">${markup}</main></div></body></html>`,
          );
          // Verificar también los filtros que normalmente se revelan al cambiar libro.
          await page
            .locator(".plan-book-picker")
            .evaluateAll((nodes) => nodes.forEach((n) => ((n as HTMLDetailsElement).open = true)));
          const issues = await page.evaluate(() => {
            const failures: string[] = [];
            if (document.documentElement.scrollWidth > innerWidth + 1)
              failures.push("page overflow");
            for (const row of document.querySelectorAll(".writing-activity-row")) {
              const bounds = row.getBoundingClientRect();
              for (const child of row.children) {
                const box = child.getBoundingClientRect();
                if (box.left < bounds.left - 1 || box.right > bounds.right + 1)
                  failures.push("chart overflow");
              }
              const track = row.querySelector(".writing-activity-track")!.getBoundingClientRect();
              const bar = row.querySelector(".writing-activity-bar")!.getBoundingClientRect();
              if (bar.width > track.width + 1) failures.push("bar exceeds track");
            }
            for (const column of document.querySelectorAll(".plan-column")) {
              if (column.getBoundingClientRect().height > innerHeight + 1)
                failures.push("planning column exceeds viewport height");
            }
            for (const form of document.querySelectorAll(".studio-filters")) {
              const bounds = form.getBoundingClientRect();
              for (const control of form.querySelectorAll("input,select,.btn")) {
                const box = control.getBoundingClientRect();
                if (box.right > bounds.right + 1 || box.left < bounds.left - 1)
                  failures.push("filter overflow");
                if (Math.abs(box.height - 44) > 1) failures.push(`control height ${box.height}`);
              }
            }
            return failures;
          });
          assert.deepEqual(issues, [], `${route}, scenario ${scenario}, ${width}px, ${theme}`);
          await page
            .locator(".plan-book-picker")
            .evaluateAll((nodes) => nodes.forEach((n) => ((n as HTMLDetailsElement).open = false)));
          if (route === "planning" && width >= 1366) {
            const map = await page.locator(".plan-map-card").evaluateAll((cards) => ({
              count: cards.length,
              fits: cards.every((card) => {
                const r = card.getBoundingClientRect();
                return (
                  r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
                );
              }),
            }));
            assert.equal(map.count, 30, "El mapa debe mostrar los treinta capítulos de la fixture");
            assert.equal(
              map.fits,
              true,
              "Cinco partes y treinta capítulos deben caber en una pantalla de escritorio",
            );
          }
          checks++;
          if (scenario === 0 && [390, 1440].includes(width)) {
            await page.screenshot({
              path: path.join(output, `${route}-${width}-${theme}.png`),
              fullPage: true,
            });
          }
        }
      }
    }
  }
  console.log(`${checks} route/data/viewport/theme combinations passed; screenshots: ${output}`);
} finally {
  await browser.close();
}

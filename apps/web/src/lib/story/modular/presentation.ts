import { z } from "zod";
import { tieneControlesIlegales } from "@escribiendo/shared";
import type { PlanNode } from "./structure";
export const PLAN_TONES = ["blue", "mint", "amber", "rose", "violet"] as const;
export const planVisualSchema = z.object({
  version: z.literal(1).default(1),
  tone: z.enum(["auto", ...PLAN_TONES]).default("auto"),
  imageAssetId: z.uuid().nullable().default(null),
  labels: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(24)
        .refine((s) => !tieneControlesIlegales(s)),
    )
    .max(8)
    .default([]),
});
export function planVisual(value: unknown) {
  const parsed = planVisualSchema.safeParse(value);
  return parsed.success ? parsed.data : planVisualSchema.parse({});
}
export function parsePlanLabels(text: string): string[] {
  const labels = text
    .split(/[,\n]/u)
    .map((s) => s.normalize("NFC").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return planVisualSchema.shape.labels.parse(
    labels.filter((label) => {
      const key = label.toLocaleLowerCase("es");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}
export function planProgress(nodes: readonly Pick<PlanNode, "kind" | "status">[]) {
  const chapters = nodes.filter((n) => n.kind === "CHAPTER");
  const done = chapters.filter((n) => n.status === "DONE").length;
  return {
    total: chapters.length,
    done,
    percent: chapters.length ? Math.round((done * 100) / chapters.length) : 0,
  };
}
export function planTone(value: unknown, index: number) {
  const tone = planVisual(value).tone;
  return tone === "auto"
    ? PLAN_TONES[((index % PLAN_TONES.length) + PLAN_TONES.length) % PLAN_TONES.length]!
    : tone;
}

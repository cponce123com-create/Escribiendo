import { z } from "zod";

export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const MAX_NODE_COUNT = 20_000;

export interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
}

export interface TiptapDocument extends TiptapNode {
  type: "doc";
  content: TiptapNode[];
}

export const emptyTiptapDocument: TiptapDocument = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const markSchema = z
  .object({
    type: z.string().min(1).max(64),
    attrs: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const nodeSchema: z.ZodType<TiptapNode> = z.lazy(() =>
  z
    .object({
      type: z.string().min(1).max(64),
      attrs: z.record(z.string(), z.unknown()).optional(),
      content: z.array(nodeSchema).max(MAX_NODE_COUNT).optional(),
      marks: z.array(markSchema).max(16).optional(),
      text: z.string().max(500_000).optional(),
    })
    .strict()
    .superRefine((node, context) => {
      if (node.type === "text" && typeof node.text !== "string") {
        context.addIssue({
          code: "custom",
          message: "Un nodo de texto debe incluir la propiedad text.",
        });
      }

      if (node.type !== "text" && node.text !== undefined) {
        context.addIssue({
          code: "custom",
          message: "Solo los nodos de texto pueden incluir la propiedad text.",
        });
      }
    }),
);

export const tiptapDocumentSchema = z
  .custom<unknown>((value) => value !== null && typeof value === "object", {
    message: "El documento debe ser un objeto JSON.",
  })
  .pipe(
    nodeSchema.superRefine((node, context) => {
      if (node.type !== "doc") {
        context.addIssue({
          code: "custom",
          message: "El nodo raíz debe ser de tipo doc.",
        });
      }

      if (!Array.isArray(node.content)) {
        context.addIssue({
          code: "custom",
          message: "El documento debe incluir un arreglo content.",
        });
      }
    }),
  )
  .transform((node) => node as TiptapDocument);

export class TiptapValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TiptapValidationError";
  }
}

export function parseTiptapDocument(value: unknown): TiptapDocument {
  const result = tiptapDocumentSchema.safeParse(value);

  if (!result.success) {
    throw new TiptapValidationError(
      result.error.issues[0]?.message ?? "El contenido del documento no es válido.",
    );
  }

  assertDocumentLimits(result.data);
  return result.data;
}

export function assertDocumentLimits(document: TiptapDocument): void {
  const bytes = new TextEncoder().encode(JSON.stringify(document)).byteLength;

  if (bytes > MAX_DOCUMENT_BYTES) {
    throw new TiptapValidationError("El contenido supera el tamaño máximo permitido.");
  }

  let nodes = 0;
  let depth = 0;
  const stack: Array<{ node: TiptapNode; depth: number }> = [{ node: document, depth: 1 }];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      break;
    }

    nodes += 1;
    depth = Math.max(depth, current.depth);

    if (nodes > MAX_NODE_COUNT) {
      throw new TiptapValidationError("El documento contiene demasiados nodos.");
    }

    if (current.depth > 100) {
      throw new TiptapValidationError("El documento contiene demasiados niveles de anidación.");
    }

    for (const child of current.node.content ?? []) {
      stack.push({ node: child, depth: current.depth + 1 });
    }
  }
}

const BLOCK_NODE_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "horizontalRule",
  "sceneBreak",
  "image",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "footnote",
  "footnotes",
]);

function collectText(node: TiptapNode): string {
  if (node.type === "text") {
    return node.text ?? "";
  }

  const inner = (node.content ?? []).map(collectText).join("");
  return BLOCK_NODE_TYPES.has(node.type) ? `${inner}\n` : inner;
}

export function extractPlainText(document: TiptapDocument): string {
  return collectText(document)
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function countWordsInDocument(document: TiptapDocument): number {
  return countWords(extractPlainText(document));
}

import "server-only";
import { createHash } from "node:crypto";

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitStore {
  buckets: Map<string, Bucket>;
}

const globalStore = globalThis as unknown as {
  __escribiendoRateLimit?: RateLimitStore;
};

const store: RateLimitStore =
  globalStore.__escribiendoRateLimit ??
  (globalStore.__escribiendoRateLimit = { buckets: new Map() });

const MAX_BUCKETS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

function keyHash(scope: string, identifier: string): string {
  return createHash("sha256").update(`${scope}:${identifier}`, "utf8").digest("hex");
}

function prune(now: number): void {
  if (store.buckets.size < MAX_BUCKETS) {
    return;
  }

  for (const [key, bucket] of store.buckets) {
    if (bucket.resetAt <= now) {
      store.buckets.delete(key);
    }
  }
}

/**
 * Limitador en memoria para una única instancia. La cuenta también aplica un
 * bloqueo persistente en PostgreSQL. Si Render ejecuta más de una instancia,
 * este límite debe sustituirse por un almacén compartido.
 */
export function consumeRateLimit(input: {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
  now?: number;
}): RateLimitResult {
  const now = input.now ?? Date.now();
  const key = keyHash(input.scope, input.identifier);
  const current = store.buckets.get(key);

  if (!current || current.resetAt <= now) {
    prune(now);
    store.buckets.set(key, { count: 1, resetAt: now + input.windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, input.limit - 1),
      retryAfterSeconds: Math.ceil(input.windowMs / 1_000),
    };
  }

  current.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1_000));

  if (current.count > input.limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  return {
    allowed: true,
    remaining: Math.max(0, input.limit - current.count),
    retryAfterSeconds,
  };
}

export function resetRateLimitsForTests(): void {
  store.buckets.clear();
}

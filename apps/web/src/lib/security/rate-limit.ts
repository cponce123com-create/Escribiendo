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

/**
 * Límite de intentos de acceso.
 *
 * Los valores por defecto son los de producción. Se pueden ajustar con
 * variables de entorno porque el presupuesto de intentos depende del
 * entorno: una suite automatizada que abre muchas sesiones desde la misma
 * dirección necesita más margen, y eso no debe exigir desactivar el control.
 */
export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Política de intentos de acceso por dirección IP. */
export function loginRateLimitPolicy(): RateLimitPolicy {
  return {
    limit: readPositiveInt(process.env.RATE_LIMIT_LOGIN_ATTEMPTS, 10),
    windowMs: readPositiveInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MINUTES, 15) * 60_000,
  };
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

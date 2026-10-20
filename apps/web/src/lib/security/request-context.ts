import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { isSameOrigin, resolveExpectedOrigin } from "./origin-policy";

export interface RequestContext {
  requestId: string;
  ip: string | null;
  ipHash: string | null;
  userAgent: string | null;
}

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first || null;
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip, "utf8").digest("hex");
}

export async function getRequestContext(): Promise<RequestContext> {
  const headerStore = await headers();
  const ip =
    firstHeaderValue(headerStore.get("x-forwarded-for")) ??
    firstHeaderValue(headerStore.get("x-real-ip"));
  const userAgent = headerStore.get("user-agent")?.slice(0, 512) ?? null;

  return {
    requestId: headerStore.get("x-request-id") ?? randomUUID(),
    ip,
    ipHash: ip ? hashIp(ip) : null,
    userAgent,
  };
}

function assertOrigin(input: {
  origin: string | null;
  host: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
  requestId: string;
}): void {
  const env = getServerEnv();
  const expectedOrigin = resolveExpectedOrigin({
    appUrl: env.APP_URL,
    host: input.forwardedHost ?? input.host,
    protocol: input.forwardedProto,
  });

  if (!isSameOrigin(input.origin, expectedOrigin)) {
    logger.warn("security.origin_rejected", {
      requestId: input.requestId,
      expectedOrigin,
    });
    throw new AppError("FORBIDDEN", "La solicitud no procede de un origen autorizado.", 403);
  }
}

export async function assertServerActionOrigin(): Promise<RequestContext> {
  const context = await getRequestContext();
  const headerStore = await headers();

  assertOrigin({
    origin: headerStore.get("origin"),
    host: headerStore.get("host"),
    forwardedHost: headerStore.get("x-forwarded-host"),
    forwardedProto: headerStore.get("x-forwarded-proto"),
    requestId: context.requestId,
  });

  return context;
}

export function assertRequestOrigin(request: Request): void {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();

  assertOrigin({
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    requestId,
  });
}

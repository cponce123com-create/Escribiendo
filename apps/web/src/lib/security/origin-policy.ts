export interface ExpectedOriginInput {
  appUrl?: string;
  host?: string | null;
  protocol?: string | null;
}

export function resolveExpectedOrigin(input: ExpectedOriginInput): string | null {
  if (input.appUrl) {
    try {
      return new URL(input.appUrl).origin;
    } catch {
      return null;
    }
  }

  if (!input.host) {
    return null;
  }

  const protocol = input.protocol === "http" ? "http" : "https";
  return `${protocol}://${input.host}`;
}

export function isSameOrigin(origin: string | null, expectedOrigin: string | null): boolean {
  if (!origin || !expectedOrigin) {
    return false;
  }

  try {
    return new URL(origin).origin === expectedOrigin;
  } catch {
    return false;
  }
}

import "server-only";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY_PATTERN =
  /pass(word)?|secret|token|authorization|cookie|content|manuscript|manuscrito|api[_-]?key|database[_-]?url/i;

function configuredLevel(): LogLevel {
  const value = process.env.LOG_LEVEL?.toLowerCase();

  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }

  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configuredLevel()];
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return "[truncated]";
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(process.env.NODE_ENV !== "production" && value.stack ? { stack: value.stack } : {}),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => redact(item, depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redact(item, depth + 1),
      ]),
    );
  }

  if (typeof value === "string" && value.length > 1_000) {
    return `${value.slice(0, 1_000)}…`;
  }

  return value;
}

function write(level: LogLevel, event: string, context: Record<string, unknown> = {}): void {
  if (!shouldLog(level)) {
    return;
  }

  const payload = JSON.stringify({
    level,
    time: new Date().toISOString(),
    service: "escribiendo-web",
    event,
    ...((redact(context) as Record<string, unknown>) ?? {}),
  });

  if (level === "error" || level === "warn") {
    process.stderr.write(`${payload}\n`);
  } else {
    process.stdout.write(`${payload}\n`);
  }
}

export const logger = {
  debug(event: string, context?: Record<string, unknown>) {
    write("debug", event, context);
  },
  info(event: string, context?: Record<string, unknown>) {
    write("info", event, context);
  },
  warn(event: string, context?: Record<string, unknown>) {
    write("warn", event, context);
  },
  error(event: string, context?: Record<string, unknown>) {
    write("error", event, context);
  },
};

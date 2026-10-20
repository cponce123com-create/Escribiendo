export type AppErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "CONFIGURATION_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly exposeMessage: string;

  constructor(code: AppErrorCode, message: string, status = 400, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.exposeMessage = message;
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super("CONFIGURATION_ERROR", message, 500);
    this.name = "ConfigurationError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toSafeErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.exposeMessage;
  }

  return "No se ha podido completar la operación. Inténtalo de nuevo.";
}

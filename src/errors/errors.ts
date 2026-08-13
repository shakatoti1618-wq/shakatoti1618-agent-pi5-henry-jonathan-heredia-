// src/errors/errors.ts
// Manejo de errores del MCP server.
//
// Un MCP server no le devuelve al usuario stack traces: el error que devuelve
// un tool lo lee el LLM y lo comunica en lenguaje natural. Por eso cada error
// se clasifica en una categoría y se transforma a un mensaje accionable.
//
// Categorías:
//   VALIDATION     -> input incorrecto (lo detecta Zod antes de tocar la API)
//   AUTHENTICATION -> token inválido, expirado o sin el scope necesario (401/403)
//   API            -> GitHub respondió pero algo falló (404, 409, 422, ...)
//   RATE_LIMIT     -> se superó el límite de requests (403/429 con header X-RateLimit)
//   NETWORK        -> no se pudo hablar con GitHub (DNS, timeout, conexión)

export type ErrorCategory =
  | "VALIDATION"
  | "AUTHENTICATION"
  | "API"
  | "RATE_LIMIT"
  | "NETWORK";

/** Error base: categoría + mensaje que el LLM puede comunicar al usuario. */
export class AppError extends Error {
  readonly category: ErrorCategory;
  readonly userMessage: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    category: ErrorCategory,
    userMessage: string,
    options: { cause?: unknown; status?: number; retryable?: boolean } = {},
  ) {
    super(userMessage, { cause: options.cause });
    this.name = "AppError";
    this.category = category;
    this.userMessage = userMessage;
    this.status = options.status;
    this.retryable = options.retryable ?? (category === "RATE_LIMIT" || category === "NETWORK");
  }
}

export class ValidationError extends AppError {
  constructor(userMessage: string, cause?: unknown) {
    super("VALIDATION", userMessage, { cause });
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends AppError {
  constructor(userMessage: string, cause?: unknown, status?: number) {
    super("AUTHENTICATION", userMessage, { cause, status });
    this.name = "AuthenticationError";
  }
}

export class GitHubAPIError extends AppError {
  constructor(userMessage: string, cause?: unknown, status?: number) {
    super("API", userMessage, { cause, status });
    this.name = "GitHubAPIError";
  }
}

export class RateLimitError extends AppError {
  constructor(userMessage: string, cause?: unknown, status?: number) {
    super("RATE_LIMIT", userMessage, { cause, status });
    this.name = "RateLimitError";
  }
}

export class NetworkError extends AppError {
  constructor(userMessage: string, cause?: unknown) {
    super("NETWORK", userMessage, { cause });
    this.name = "NetworkError";
  }
}

/**
 * Detecta rate limiting en la respuesta de GitHub a partir de los headers.
 * Octokit expone los headers de la última response en el error (response.headers).
 */
function rateLimitRemaining(err: { response?: { headers?: Record<string, string | undefined> } }): number | undefined {
  const headers = err.response?.headers;
  const raw = headers?.["x-ratelimit-remaining"] ?? headers?.["X-RateLimit-Remaining"];
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Convierte cualquier error que lance Octokit/GitHub en un AppError con un
 * mensaje en lenguaje natural. Este es el punto único donde un stack trace
 * técnico se transforma en algo que el LLM puede decirle al usuario.
 */
export function fromOctokitError(err: unknown): AppError {
  const octokitErr = err as {
    status?: number;
    name?: string;
    message?: string;
    response?: { headers?: Record<string, string | undefined> };
  };

  // 1) Errores de red: no hay status HTTP, Octokit lanza RequestError por timeout/ECONNREFUSED.
  if (!octokitErr?.status) {
    const msg = "No se pudo conectar con GitHub. Verifica tu conexión a internet e intenta de nuevo.";
    return new NetworkError(msg, err);
  }

  const status = octokitErr.status;
  const apiMessage = octokitErr.message ?? "Error desconocido de GitHub";

  // 2) Rate limit: GitHub responde 403/429 y aclara el límite en los headers.
  const remaining = rateLimitRemaining(octokitErr);
  if (status === 429 || (status === 403 && remaining !== undefined && remaining === 0)) {
    return new RateLimitError(
      "Se alcanzó el límite de solicitudes a la API de GitHub. Espera un momento y vuelve a intentarlo.",
      err,
      status,
    );
  }

  // 3) Autenticación / autorización: 401 o 403 sin rate limit.
  if (status === 401) {
    return new AuthenticationError(
      "La autenticación con GitHub falló. Verifica que tu token sea válido.",
      err,
      status,
    );
  }
  if (status === 403) {
    return new AuthenticationError(
      "Tu token no tiene permisos para esta operación. Revisa que incluya el scope necesario (repo, user o admin:org).",
      err,
      status,
    );
  }
  // 3.5) Recurso no encontrado: 404 → mensaje específico, más útil que el genérico.
  if (status === 404) {
    return new GitHubAPIError(
      `El recurso solicitado no existe o no es accesible. Verifica los datos enviados e intenta de nuevo.`,
      err,
      status,
    );
  }
  // 4) Resto: errores de la API de GitHub (409, 422, ...).
  return new GitHubAPIError(
    `GitHub respondió con un error (${status}): ${apiMessage}`,
    err,
    status,
  );
}

/**
 * Clasifica cualquier error desconocido que ocurra durante la ejecución.
 * Si ya es un AppError, se devuelve tal cual.
 */
export function classifyError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const candidate = err as { name?: string; status?: number };
  if (candidate?.name === "AbortError") {
    return new NetworkError("La solicitud a GitHub tardó demasiado y se canceló. Inténtalo de nuevo.", err);
  }

  // La red suele lanzar TypeError con causas como ECONNREFUSED, ENOTFOUND, ETIMEDOUT.
  if (err instanceof TypeError && /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ENETUNREACH/i.test(String(err.message))) {
    return new NetworkError("No se pudo conectar con GitHub. Verifica tu conexión a internet.", err);
  }

  return new GitHubAPIError("Ocurrió un error inesperado al ejecutar la operación.", err);
}

/** Configuración del retry con exponential backoff. */
export const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
} as const;

/**
 * Retry con exponential backoff. Se usa para errores transitorios (RATE_LIMIT,
 * NETWORK). No reintenta errores definitivos (VALIDATION, AUTHENTICATION).
 * Reintentar inmediatamente cuando GitHub pide "espera" empeora el problema;
 * por eso la espera crece de forma exponencial entre intentos.
 */
export async function withRetry<T>(operation: () => Promise<T>, options?: { retries?: number }): Promise<T> {
  const maxRetries = options?.retries ?? RETRY_CONFIG.maxRetries;
  let attempt = 0;

  for (; ;) {
    try {
      return await operation();
    } catch (err) {
      const classified = classifyError(err);
      const shouldRetry =
        classified.retryable &&
        attempt < maxRetries &&
        (classified.category === "RATE_LIMIT" || classified.category === "NETWORK");

      if (!shouldRetry) throw classified;

      attempt += 1;
      const delay = Math.min(RETRY_CONFIG.baseDelayMs * 2 ** (attempt - 1), RETRY_CONFIG.maxDelayMs);
      // El retry usa un factor de "jitter" reducido para no golpear la API en ráfaga.
      const jitter = Math.floor(delay * (0.5 + Math.random() * 0.5));
      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }
}

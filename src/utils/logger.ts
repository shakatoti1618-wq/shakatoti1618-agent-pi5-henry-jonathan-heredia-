// src/utils/logger.ts
// Logging estructurado con niveles. Vive en console.error (stderr), NUNCA en
// console.log: el server MCP se comunica por stdio, y cualquier salida en stdout
// corrompe el protocolo JSON-RPC con el host.

export type LogLevel = "debug" | "info" | "warn" | "error";

const PREFIX = "[github-agent]";

/**
 * Escribe un log en stderr. El nivel se puede controlar con la variable
 * LOG_LEVEL (por defecto "info"). No se registra ningún dato sensible: el
 * token NUNCA pasa por aquí.
 */
export function log(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
  const threshold = process.env.LOG_LEVEL ?? "info";
  const rank: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  if (rank[level] < rank[threshold as LogLevel]) return;

  const suffix = extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
  console.error(`${PREFIX} [${level.toUpperCase()}] ${message}${suffix}`);
}

export const logger = {
  debug: (message: string, extra?: Record<string, unknown>) => log("debug", message, extra),
  info: (message: string, extra?: Record<string, unknown>) => log("info", message, extra),
  warn: (message: string, extra?: Record<string, unknown>) => log("warn", message, extra),
  error: (message: string, extra?: Record<string, unknown>) => log("error", message, extra),
};

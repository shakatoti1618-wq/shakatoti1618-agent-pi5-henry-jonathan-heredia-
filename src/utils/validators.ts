// src/utils/validators.ts
// Utilidades de validación compartidas. Centralizan las reglas de negocio de
// GitHub para que los schemas de Zod y los tests usen la MISMA fuente de verdad.

/** Regla real de GitHub para nombres de repositorios: 3-100 caracteres, alfanuméricos y guiones. */
export const REPO_NAME_RULES = {
  min: 3,
  max: 100,
  // No puede empezar ni terminar con punto, y evita ".." consecutivos.
  pattern: /^[a-zA-Z0-9._-]+$/,
  disallowDotStart: /^\./,
  disallowDotEnd: /\.$/,
  disallowConsecutiveDots: /\.\./,
} as const;

/** Reglas del identificador de organización/usuario (owner). */
export const OWNER_RULES = {
  min: 1,
  max: 39,
  pattern: /^[a-zA-Z0-9-]+$/,
} as const;

// src/schemas/schemas.ts
// Schemas de Zod: validan inputs ANTES de tocar la API y, a la vez, le dicen al
// LLM qué parámetros espera cada tool (via las descripciones, que se propagan
// al JSON Schema que el LLM recibe en "tools/list").
//
// Reglas reales de GitHub reflejadas en los schemas:
//   - nombre de repo: 3-100 chars, alfanumérico, guiones, puntos internos
//   - owner: 1-39 chars, alfanumérico con guiones
//   - issueNumber: entero positivo
import { z } from "zod";
import { OWNER_RULES, REPO_NAME_RULES } from "../utils/validators.js";

/** Nombre de repositorio válido según las reglas de GitHub. */
const repoNameSchema = z
  .string()
  .min(REPO_NAME_RULES.min, `El nombre del repositorio debe tener al menos ${REPO_NAME_RULES.min} caracteres.`)
  .max(REPO_NAME_RULES.max, `El nombre del repositorio no puede superar los ${REPO_NAME_RULES.max} caracteres.`)
  .regex(REPO_NAME_RULES.pattern, "El nombre solo puede contener letras, números, guiones y puntos.")
  .refine((v) => !REPO_NAME_RULES.disallowDotStart.test(v), {
    message: "El nombre del repositorio no puede comenzar con un punto.",
  })
  .refine((v) => !REPO_NAME_RULES.disallowDotEnd.test(v), {
    message: "El nombre del repositorio no puede terminar con un punto.",
  })
  .refine((v) => !REPO_NAME_RULES.disallowConsecutiveDots.test(v), {
    message: "El nombre del repositorio no puede contener dos puntos consecutivos.",
  })
  .describe("Nombre del repositorio. Debe tener entre 3 y 100 caracteres, solo letras, números, guiones y puntos. Ejemplo: mi-proyecto.");

/** Usuario u organización dueña del repositorio. */
const ownerSchema = z
  .string()
  .min(OWNER_RULES.min, "El owner no puede estar vacío.")
  .max(OWNER_RULES.max, "El owner no puede superar los 39 caracteres.")
  .regex(OWNER_RULES.pattern, "El owner solo puede contener letras, números y guiones.")
  .describe("Usuario o organización de GitHub dueña del repositorio. Ejemplo: shakatoti1618.");

const positiveIntSchema = z
  .number()
  .int("Debe ser un número entero.")
  .positive("Debe ser un número positivo.")
  .describe("Número entero positivo.");

export const createRepositorySchema = z.object({
  name: repoNameSchema,
  description: z
    .string()
    .max(255, "La descripción no puede superar los 255 caracteres.")
    .optional()
    .describe("Descripción breve del repositorio (opcional)."),
  isPrivate: z
    .boolean()
    .optional()
    .describe("Si es true, crea un repositorio privado. Por defecto es público."),
  autoInit: z
    .boolean()
    .optional()
    .describe("Si es true, inicializa el repositorio con un README y un commit inicial."),
});
export type CreateRepositoryInput = z.infer<typeof createRepositorySchema>;

export const createIssueSchema = z.object({
  owner: ownerSchema,
  repo: repoNameSchema,
  title: z
    .string({ required_error: "El título del issue no puede estar vacío." })
    .min(1, "El título del issue no puede estar vacío.")
    .max(256, "El título del issue no puede superar los 256 caracteres.")
    .describe("Título corto y descriptivo del issue. Ejemplo: 'Fix: error al iniciar sesión'."),
  body: z
    .string()
    .optional()
    .describe("Cuerpo del issue en Markdown. Describe el problema o la tarea (opcional)."),
});
export type CreateIssueInput = z.infer<typeof createIssueSchema>;

export const listRepositoriesSchema = z.object({
  perPage: z
    .number()
    .int()
    .min(1, "perPage debe ser al menos 1.")
    .max(100, "perPage no puede superar 100.")
    .optional()
    .describe("Cantidad de repositorios a devolver por página (máx. 100). Por defecto 30."),
  page: z
    .number()
    .int()
    .min(1, "page debe ser al menos 1.")
    .optional()
    .describe("Número de página a consultar. Por defecto 1."),
});
export type ListRepositoriesInput = z.infer<typeof listRepositoriesSchema>;

export const createCommitSchema = z.object({
  owner: ownerSchema,
  repo: repoNameSchema,
  path: z
    .string()
    .min(1, "La ruta del archivo no puede estar vacía.")
    .describe("Ruta del archivo dentro del repositorio. Ejemplo: docs/README.md."),
  message: z
    .string()
    .min(1, "El mensaje del commit no puede estar vacío.")
    .describe("Mensaje del commit. Ejemplo: 'Agrega sección de instalación'."),
  content: z
    .string()
    .min(1, "El contenido no puede estar vacío.")
    .describe("Contenido del archivo en texto plano (no codificado)."),
  branch: z
    .string()
    .default("main")
    .describe("Rama sobre la que se realiza el commit. Por defecto 'main'."),
});
export type CreateCommitInput = z.infer<typeof createCommitSchema>;

export const listIssuesSchema = z.object({
  owner: ownerSchema,
  repo: repoNameSchema,
  state: z
    .enum(["open", "closed", "all"], {
      errorMap: () => ({ message: "El estado debe ser 'open', 'closed' o 'all'." }),
    })
    .optional()
    .describe("Filtro de issues por estado. Por defecto 'open'."),
  perPage: z
    .number()
    .int()
    .min(1, "perPage debe ser al menos 1.")
    .max(100, "perPage no puede superar 100.")
    .optional()
    .describe("Cantidad de issues a devolver por página (máx. 100). Por defecto 30."),
});
export type ListIssuesInput = z.infer<typeof listIssuesSchema>;

export const closeIssueSchema = z.object({
  owner: ownerSchema,
  repo: repoNameSchema,
  issueNumber: positiveIntSchema.describe("Número del issue a cerrar. Ejemplo: 12."),
});
export type CloseIssueInput = z.infer<typeof closeIssueSchema>;

export const createPullRequestSchema = z.object({
  owner: ownerSchema,
  repo: repoNameSchema,
  title: z
    .string()
    .min(1, "El título del PR no puede estar vacío.")
    .max(256, "El título del PR no puede superar los 256 caracteres.")
    .describe("Título del pull request."),
  head: z
    .string()
    .min(1, "La rama origen (head) no puede estar vacía.")
    .describe("Nombre de la rama origen con los cambios. Ejemplo: feature/nueva-funcionalidad."),
  base: z
    .string()
    .min(1, "La rama destino (base) no puede estar vacía.")
    .describe("Nombre de la rama destino de la fusión. Ejemplo: main."),
  body: z
    .string()
    .optional()
    .describe("Descripción del pull request en Markdown (opcional)."),
});
export type CreatePullRequestInput = z.infer<typeof createPullRequestSchema>;

export const listCommitsSchema = z.object({
  owner: ownerSchema,
  repo: repoNameSchema,
  perPage: z
    .number()
    .int()
    .min(1, "perPage debe ser al menos 1.")
    .max(100, "perPage no puede superar 100.")
    .optional()
    .describe("Cantidad de commits a devolver por página (máx. 100). Por defecto 30."),
});
export type ListCommitsInput = z.infer<typeof listCommitsSchema>;

/** Mapa nombre-de-tool -> schema. Permite registrar tools y handler de forma declarativa. */
export const toolSchemas = {
  create_repository: createRepositorySchema,
  create_issue: createIssueSchema,
  list_repositories: listRepositoriesSchema,
  create_commit: createCommitSchema,
  list_issues: listIssuesSchema,
  close_issue: closeIssueSchema,
  create_pull_request: createPullRequestSchema,
  list_commits: listCommitsSchema,
} as const;

export type ToolName = keyof typeof toolSchemas;

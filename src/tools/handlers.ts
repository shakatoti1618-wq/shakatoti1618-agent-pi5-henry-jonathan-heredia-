// src/tools/handlers.ts
// Handlers de los tools: validan el input con Zod, ejecutan la operación de
// GitHub y formatean el resultado (o el error) como texto que el LLM puede
// comunicar al usuario. NUNCA devuelve stack traces: devuelve isError + mensaje
// en lenguaje natural.

import { ZodError } from "zod";
import type { GitHubOperations } from "../github/operations.js";
import { toolSchemas } from "../schemas/schemas.js";
import { AppError, classifyError } from "../errors/errors.js";
import { logger } from "../utils/logger.js";
import type { ToolResult } from "../types.js";

/**
 * Ejecuta un tool por nombre. Retorna siempre una ToolResult válida:
 *   - success: { content: [{ type: "text", text }] }
 *   - error:   { content: [{ type: "text", text }], isError: true }
 */
export async function callTool(operations: GitHubOperations, name: string, args: unknown): Promise<ToolResult> {
  // 1) Validación del input con Zod.
  const schema = (toolSchemas as Record<string, unknown>)[name] as
    | (typeof toolSchemas)[keyof typeof toolSchemas]
    | undefined;
  if (!schema) {
    return errorResult(`Tool desconocido: "${name}". Los tools disponibles son: ${Object.keys(toolSchemas).join(", ")}.`);
  }

  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return errorResult(formatValidationError(parsed.error));
  }

  // 2) Ejecución de la operación con manejo de errores.
  try {
    const result = await runOperation(operations, name, parsed.data);
    logger.debug(`Tool "${name}" ejecutado correctamente`);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const appError = classifyError(err);
    logger.warn(`Tool "${name}" falló: ${appError.category}`, { message: appError.userMessage });
    return errorResult(appError.userMessage);
  }
}

async function runOperation(
  operations: GitHubOperations,
  name: string,
  data: unknown,
): Promise<unknown> {
  switch (name) {
    case "create_repository":
      return operations.createRepository(data as Parameters<GitHubOperations["createRepository"]>[0]);
    case "create_issue":
      return operations.createIssue(data as Parameters<GitHubOperations["createIssue"]>[0]);
    case "list_repositories":
      return operations.listRepositories(data as Parameters<GitHubOperations["listRepositories"]>[0]);
    case "create_commit":
      return operations.createCommit(data as Parameters<GitHubOperations["createCommit"]>[0]);
    case "list_issues":
      return operations.listIssues(data as Parameters<GitHubOperations["listIssues"]>[0]);
    case "close_issue":
      return operations.closeIssue(data as Parameters<GitHubOperations["closeIssue"]>[0]);
    case "create_pull_request":
      return operations.createPullRequest(data as Parameters<GitHubOperations["createPullRequest"]>[0]);
    case "list_commits":
      return operations.listCommits(data as Parameters<GitHubOperations["listCommits"]>[0]);
    default:
      throw new AppError("VALIDATION", `No hay un handler para el tool "${name}".`);
  }
}

/** Convierte un ZodError en mensajes que el usuario/LLM pueda entender. */
function formatValidationError(error: ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `"${issue.path.join(".")}"` : "input";
    return `- ${path}: ${issue.message}`;
  });
  return `Los datos enviados no son válidos:\n${issues.join("\n")}`;
}

function errorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

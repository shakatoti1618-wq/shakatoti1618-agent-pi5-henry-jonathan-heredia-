// tests/handlers.test.ts
// Tests del dispatcher de tools: validación antes de ejecutar, mensajes en
// lenguaje natural y flujo de errores hacia el LLM.

import { describe, expect, it, vi } from "vitest";
import { callTool } from "../src/tools/handlers.js";
import { GitHubAPIError } from "../src/errors/errors.js";
import type { GitHubOperations } from "../src/github/operations.js";

function createMockOperations(): GitHubOperations {
  // El cast es deliberado: solo interesa verificar el contrato del dispatcher.
  return {
    createRepository: vi.fn().mockResolvedValue({ name: "mi-proyecto", fullName: "u/mi-proyecto" }),
    createIssue: vi.fn().mockResolvedValue({ number: 1, state: "open" }),
    listRepositories: vi.fn().mockResolvedValue([]),
    createCommit: vi.fn().mockResolvedValue({ sha: "abc", commitUrl: "https://x" }),
    listIssues: vi.fn().mockResolvedValue([]),
    closeIssue: vi.fn().mockResolvedValue({ number: 1, state: "closed" }),
    createPullRequest: vi.fn().mockResolvedValue({ number: 2, htmlUrl: "https://x", state: "open" }),
    listCommits: vi.fn().mockResolvedValue([]),
  } as unknown as GitHubOperations;
}

describe("callTool", () => {
  it("rechaza un tool desconocido con isError true y mensaje útil", async () => {
    const ops = createMockOperations();
    const result = await callTool(ops, "no_existe", {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Tool desconocido/);
  });

  it("rechaza inputs inválidos sin llamar a la API y con mensajes de validación claros", async () => {
    const ops = createMockOperations();
    const result = await callTool(ops, "create_repository", { name: "ab" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/al menos 3 caracteres/);
    // Verifica que NUNCA se llegó a ejecutar la operación.
    expect(ops.createRepository).not.toHaveBeenCalled();
  });

  it("ejecuta el tool y devuelve el resultado como JSON", async () => {
    const ops = createMockOperations();
    const result = await callTool(ops, "create_repository", { name: "mi-proyecto" });

    expect(result.isError).toBeFalsy();
    expect(ops.createRepository).toHaveBeenCalledWith({ name: "mi-proyecto" });
    expect(JSON.parse(result.content[0].text)).toMatchObject({ name: "mi-proyecto" });
  });

  it("transforma un error de la operación en un mensaje que el LLM puede comunicar", async () => {
    const ops = createMockOperations();
    (ops.createIssue as ReturnType<typeof vi.fn>).mockRejectedValue(
      new GitHubAPIError(
        "El repositorio [no-existe] no fue encontrado. Verifica el nombre e intenta de nuevo.",
        undefined,
        404,
      ),
    );

    const result = await callTool(ops, "create_issue", {
      owner: "no-existe",
      repo: "repo",
      title: "Algo",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/no fue encontrado/);
  });
});

// tests/operations.test.ts
// Tests de la capa de operaciones con el cliente de Octokit MOCKEADO.
// No se hace ninguna llamada real a GitHub: se usa un objeto fake con vi.fn()
// para verificar qué métodos se invocan y cómo se mapean los resultados.

import { describe, expect, it, vi } from "vitest";
import { GitHubOperations } from "../src/github/operations.js";
import { GitHubAPIError, RateLimitError, AuthenticationError } from "../src/errors/errors.js";

/** Construye un fake de Octokit con métodos espiables. */
function createFakeOctokit(overrides: Record<string, unknown> = {}) {
  return {
    repos: {
      createForAuthenticatedUser: vi.fn(),
      listForAuthenticatedUser: vi.fn(),
      getContent: vi.fn(),
      createOrUpdateFileContents: vi.fn(),
      listCommits: vi.fn(),
      ...(overrides.repos as object ?? {}),
    },
    issues: {
      create: vi.fn(),
      listForRepo: vi.fn(),
      update: vi.fn(),
      ...(overrides.issues as object ?? {}),
    },
    pulls: {
      create: vi.fn(),
    },
  };
}

type FakeOctokit = ReturnType<typeof createFakeOctokit>;

describe("GitHubOperations", () => {
  it("createRepository llama a la API correcta y devuelve datos de dominio", async () => {
    const octokit = createFakeOctokit();
    octokit.repos.createForAuthenticatedUser.mockResolvedValue({
      data: {
        name: "mi-proyecto",
        full_name: "shakatoti1618/mi-proyecto",
        owner: { login: "shakatoti1618" },
        private: false,
        description: "Descripción",
        html_url: "https://github.com/shakatoti1618/mi-proyecto",
        default_branch: "main",
        created_at: "2025-01-01T00:00:00Z",
      },
    });

    const ops = new GitHubOperations(octokit as unknown as never);
    const repo = await ops.createRepository({ name: "mi-proyecto", description: "Descripción" });

    expect(octokit.repos.createForAuthenticatedUser).toHaveBeenCalledWith({
      name: "mi-proyecto",
      description: "Descripción",
      private: false,
      auto_init: false,
    });
    expect(repo).toEqual({
      name: "mi-proyecto",
      fullName: "shakatoti1618/mi-proyecto",
      owner: "shakatoti1618",
      private: false,
      description: "Descripción",
      htmlUrl: "https://github.com/shakatoti1618/mi-proyecto",
      defaultBranch: "main",
      createdAt: "2025-01-01T00:00:00Z",
    });
  });

  it("createIssue mapea el issue creado", async () => {
    const octokit = createFakeOctokit();
    octokit.issues.create.mockResolvedValue({
      data: {
        number: 42,
        title: "Bug de login",
        state: "open",
        html_url: "https://github.com/o/r/issues/42",
        user: { login: "shakatoti1618" },
        created_at: "2025-01-01T00:00:00Z",
      },
    });

    const ops = new GitHubOperations(octokit as unknown as never);
    const issue = await ops.createIssue({ owner: "o", repo: "r", title: "Bug de login" });

    expect(octokit.issues.create).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      title: "Bug de login",
      body: undefined,
    });
    expect(issue.number).toBe(42);
    expect(issue.state).toBe("open");
  });

  it("un 404 al crear issue se convierte en GitHubAPIError con mensaje útil", async () => {
    const octokit = createFakeOctokit();
    octokit.issues.create.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404, message: "Not Found" }),
    );

    const ops = new GitHubOperations(octokit as unknown as never);
    await expect(ops.createIssue({ owner: "no-existe", repo: "r", title: "t" })).rejects.toMatchObject({
      category: "API",
      status: 404,
    });
  });

  it("un 401 se transforma en AuthenticationError", async () => {
    const octokit = createFakeOctokit();
    octokit.repos.listForAuthenticatedUser.mockRejectedValue(
      Object.assign(new Error("Bad credentials"), { status: 401, message: "Bad credentials" }),
    );

    const ops = new GitHubOperations(octokit as unknown as never);
    await expect(ops.listRepositories({})).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("un rate limit (429) se transforma en RateLimitError", async () => {
    vi.useFakeTimers();
    const octokit = createFakeOctokit();
    octokit.repos.listForAuthenticatedUser.mockRejectedValue(
      Object.assign(new Error("Too Many Requests"), { status: 429, message: "Too Many Requests" }),
    );

    const ops = new GitHubOperations(octokit as unknown as never);
    // El backoff real tarda varios segundos; con timers fake se verifica la
    // transformación sin esperar. Se adjunta la aserción antes de correr timers.
    const assertion = expect(ops.listRepositories({})).rejects.toBeInstanceOf(RateLimitError);
    await vi.runAllTimersAsync();
    await assertion;
    vi.useRealTimers();
  });

  it("listRepositories devuelve la lista mapeada", async () => {
    const octokit = createFakeOctokit();
    octokit.repos.listForAuthenticatedUser.mockResolvedValue({
      data: [
        { name: "a", full_name: "u/a", owner: { login: "u" }, private: true, description: null, html_url: "https://x", default_branch: "main", created_at: "2025-01-01T00:00:00Z" },
        { name: "b", full_name: "u/b", owner: { login: "u" }, private: false, description: "x", html_url: "https://y", default_branch: "main", created_at: "2025-01-01T00:00:00Z" },
      ],
    });

    const ops = new GitHubOperations(octokit as unknown as never);
    const repos = await ops.listRepositories({ perPage: 2 });

    expect(repos).toHaveLength(2);
    expect(repos[0].private).toBe(true);
    expect(octokit.repos.listForAuthenticatedUser).toHaveBeenCalledWith({ per_page: 2, page: 1 });
  });

  it("createCommit crea un archivo nuevo (sin sha previo) y devuelve el commit", async () => {
    const octokit = createFakeOctokit();
    // El archivo no existe -> GitHub responde 404
    octokit.repos.getContent.mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }));
    octokit.repos.createOrUpdateFileContents.mockResolvedValue({
      data: {
        commit: { sha: "abc123", html_url: "https://github.com/o/r/commit/abc123" },
      },
    });

    const ops = new GitHubOperations(octokit as unknown as never);
    const result = await ops.createCommit({
      owner: "o",
      repo: "r",
      path: "docs/README.md",
      message: "Agrega README",
      content: "# Hola mundo",
      branch: "main",
    });

    expect(result.sha).toBe("abc123");
    expect(octokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "o", repo: "r", path: "docs/README.md", branch: "main" }),
    );
  });

  it("createCommit falla si la API devuelve un error distinto de 404 al buscar el archivo", async () => {
    const octokit = createFakeOctokit();
    octokit.repos.getContent.mockRejectedValue(Object.assign(new Error("Bad credentials"), { status: 401 }));

    const ops = new GitHubOperations(octokit as unknown as never);
    await expect(
      ops.createCommit({ owner: "o", repo: "r", path: "a.txt", message: "m", content: "c" }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("closeIssue marca el issue como cerrado", async () => {
    const octokit = createFakeOctokit();
    octokit.issues.update.mockResolvedValue({
      data: {
        number: 7,
        title: "t",
        state: "closed",
        html_url: "https://github.com/o/r/issues/7",
        user: { login: "u" },
        created_at: "2025-01-01T00:00:00Z",
      },
    });

    const ops = new GitHubOperations(octokit as unknown as never);
    const issue = await ops.closeIssue({ owner: "o", repo: "r", issueNumber: 7 });

    expect(octokit.issues.update).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 7, state: "closed" }),
    );
    expect(issue.state).toBe("closed");
  });

  it("un error 500 inesperado se clasifica como GitHubAPIError", async () => {
    const octokit = createFakeOctokit();
    octokit.pulls.create.mockRejectedValue(Object.assign(new Error("Internal Server Error"), { status: 500 }));

    const ops = new GitHubOperations(octokit as unknown as never);
    await expect(
      ops.createPullRequest({ owner: "o", repo: "r", title: "t", head: "feat", base: "main" }),
    ).rejects.toBeInstanceOf(GitHubAPIError);
  });
});

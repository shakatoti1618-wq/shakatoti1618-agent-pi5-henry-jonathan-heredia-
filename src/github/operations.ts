// src/github/operations.ts
// Operaciones de negocio sobre GitHub. Cada método recibe el cliente ya
// configurado, ejecuta la llamada con retry y devuelve datos de dominio
// (nuestros tipos), nunca la respuesta cruda de Octokit. Todos los errores
// pasan por fromOctokitError/withRetry y se transforman en AppError.

import type { Octokit } from "@octokit/rest";
import { fromOctokitError, withRetry } from "../errors/errors.js";
import { logger } from "../utils/logger.js";
import type { CommitInfo, IssueInfo, RepositoryInfo } from "../types.js";
import type {
  CloseIssueInput,
  CreateCommitInput,
  CreateIssueInput,
  CreatePullRequestInput,
  CreateRepositoryInput,
  ListCommitsInput,
  ListIssuesInput,
  ListRepositoriesInput,
} from "../schemas/schemas.js";

export class GitHubOperations {
  constructor(private readonly octokit: Octokit) {}

  async createRepository(input: CreateRepositoryInput): Promise<RepositoryInfo> {
    return withRetry(async () => {
      try {
        const { data } = await this.octokit.repos.createForAuthenticatedUser({
          name: input.name,
          description: input.description ?? undefined,
          private: input.isPrivate ?? false,
          auto_init: input.autoInit ?? false,
        });
        logger.info(`Repositorio creado: ${data.full_name}`);
        return mapRepository(data);
      } catch (err) {
        throw fromOctokitError(err);
      }
    });
  }

  async createIssue(input: CreateIssueInput): Promise<IssueInfo> {
    return withRetry(async () => {
      try {
        const { data } = await this.octokit.issues.create({
          owner: input.owner,
          repo: input.repo,
          title: input.title,
          body: input.body ?? undefined,
        });
        logger.info(`Issue #${data.number} creado en ${input.owner}/${input.repo}`);
        return mapIssue(data);
      } catch (err) {
        throw fromOctokitError(err);
      }
    });
  }

  async listRepositories(input: ListRepositoriesInput): Promise<RepositoryInfo[]> {
    return withRetry(async () => {
      try {
        const { data } = await this.octokit.repos.listForAuthenticatedUser({
          per_page: input.perPage ?? 30,
          page: input.page ?? 1,
        });
        return data.map(mapRepository);
      } catch (err) {
        throw fromOctokitError(err);
      }
    });
  }

  /**
   * "create_commit": crea o modifica un archivo, lo que genera un commit en
   * GitHub. Para modificar un archivo existente primero se obtiene su sha, de
   * lo contrario GitHub devuelve 422.
   */
  async createCommit(input: CreateCommitInput): Promise<{ sha: string; path: string; commitUrl: string }> {
    return withRetry(async () => {
      try {
        const content = Buffer.from(input.content, "utf8").toString("base64");

        let sha: string | undefined;
        try {
          const existing = await this.octokit.repos.getContent({
            owner: input.owner,
            repo: input.repo,
            path: input.path,
            ref: input.branch,
          });
          if (Array.isArray(existing.data)) {
            throw new Error("La ruta apunta a un directorio, no a un archivo.");
          }
          sha = existing.data.sha;
        } catch (err) {
          // 404 = el archivo no existe aún -> commit de creación (sin sha).
          // Cualquier otro error se propaga.
          if (!(err as { status?: number }).status || (err as { status?: number }).status !== 404) {
            throw fromOctokitError(err);
          }
        }

        const { data } = await this.octokit.repos.createOrUpdateFileContents({
          owner: input.owner,
          repo: input.repo,
          path: input.path,
          message: input.message,
          content,
          branch: input.branch,
          sha,
        });
        logger.info(`Commit creado en ${input.owner}/${input.repo} (${input.path})`);
        return {
          sha: data.commit.sha ?? "",
          path: input.path,
          commitUrl: data.commit.html_url ?? "",
        };
      } catch (err) {
        throw fromOctokitError(err);
      }
    });
  }

  async listIssues(input: ListIssuesInput): Promise<IssueInfo[]> {
    return withRetry(async () => {
      try {
        const { data } = await this.octokit.issues.listForRepo({
          owner: input.owner,
          repo: input.repo,
          state: input.state ?? "open",
          per_page: input.perPage ?? 30,
        });
        return data.map(mapIssue);
      } catch (err) {
        throw fromOctokitError(err);
      }
    });
  }

  async closeIssue(input: CloseIssueInput): Promise<IssueInfo> {
    return withRetry(async () => {
      try {
        const { data } = await this.octokit.issues.update({
          owner: input.owner,
          repo: input.repo,
          issue_number: input.issueNumber,
          state: "closed",
        });
        logger.info(`Issue #${input.issueNumber} cerrado en ${input.owner}/${input.repo}`);
        return mapIssue(data);
      } catch (err) {
        throw fromOctokitError(err);
      }
    });
  }

  async createPullRequest(input: CreatePullRequestInput): Promise<{ number: number; htmlUrl: string; state: string }> {
    return withRetry(async () => {
      try {
        const { data } = await this.octokit.pulls.create({
          owner: input.owner,
          repo: input.repo,
          title: input.title,
          head: input.head,
          base: input.base,
          body: input.body ?? undefined,
        });
        logger.info(`PR #${data.number} creado en ${input.owner}/${input.repo}`);
        return {
          number: data.number,
          htmlUrl: data.html_url,
          state: data.state,
        };
      } catch (err) {
        throw fromOctokitError(err);
      }
    });
  }

  async listCommits(input: ListCommitsInput): Promise<CommitInfo[]> {
    return withRetry(async () => {
      try {
        const { data } = await this.octokit.repos.listCommits({
          owner: input.owner,
          repo: input.repo,
          per_page: input.perPage ?? 30,
        });
        return data.map((commit) => ({
          sha: commit.sha,
          message: commit.commit.message,
          author: commit.commit.author?.name ?? "desconocido",
          date: commit.commit.author?.date ?? "",
          htmlUrl: commit.html_url,
        }));
      } catch (err) {
        throw fromOctokitError(err);
      }
    });
  }
}

function mapRepository(repo: {
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  description: string | null;
  html_url: string;
  default_branch: string;
  created_at: string | null;
}): RepositoryInfo {
  return {
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    private: repo.private,
    description: repo.description,
    htmlUrl: repo.html_url,
    defaultBranch: repo.default_branch,
    createdAt: repo.created_at ?? "",
  };
}

function mapIssue(issue: { number: number; title: string; state: string; html_url: string; user: { login: string } | null; created_at: string }): IssueInfo {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    htmlUrl: issue.html_url,
    user: issue.user?.login ?? null,
    createdAt: issue.created_at,
  };
}

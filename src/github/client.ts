// src/github/client.ts
// Configuración del cliente de Octokit (el cliente oficial de GitHub API).
// Separar la CONFIGURACIÓN del cliente (este archivo) de las OPERACIONES
// (operations.ts) permite mockear el cliente en los tests sin tocar la lógica
// de negocio.

import { Octokit } from "@octokit/rest";

/**
 * Crea el cliente autenticado de GitHub.
 * El token se lee desde variables de entorno (GITHUB_TOKEN) y NUNCA se
 * hardcodea ni se loguea.
 */
export function createGitHubClient(token: string): Octokit {
  return new Octokit({
    auth: token,
    userAgent: "shakatoti1618-agent/1.0.0",
    request: { timeout: 10_000 },
  });
}

// src/index.ts
// Entry point del MCP server.
// Responsabilidades:
//   1. Cargar variables de entorno (.env)
//   2. Validar que exista el token de GitHub
//   3. Crear el cliente de Octokit + operaciones + server MCP
//   4. Conectarlo al transporte stdio (comunicación con Antigravity/LLM)
//
// IMPORTANTE: en un MCP server la comunicación con el host es por stdout.
// Cualquier console.log aquí rompería el protocolo. Por eso todo el logging
// usa console.error (stderr) via el logger.

import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_INFO, createServer } from "./server.js";
import { createGitHubClient } from "./github/client.js";
import { GitHubOperations } from "./github/operations.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    logger.error(
      "No se encontró GITHUB_TOKEN. Copia .env.example a .env y agrega tu token con scopes 'repo', 'user' y 'admin:org'.",
    );
    process.exit(1);
  }

  // No se loguea el token, solo su presencia.
  logger.info("Configurando cliente de GitHub...");
  const octokit = createGitHubClient(token);
  const operations = new GitHubOperations(octokit);

  const server = createServer(operations);
  const transport = new StdioServerTransport();

  logger.info("Conectando server al transporte stdio...");
  await server.connect(transport);
  logger.info(`Server iniciado (${SERVER_INFO.name} v${SERVER_INFO.version}). Esperando requests del LLM...`);

  // Cierre limpio al recibir señales de terminación del host.
  const shutdown = async (): Promise<void> => {
    logger.info("Cerrando server...");
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  logger.error("Error fatal en el arranque del server", { error: String(err) });
  process.exit(1);
});

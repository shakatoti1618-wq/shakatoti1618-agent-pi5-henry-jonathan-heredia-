// src/server.ts
// Configura el MCP Server: le da identidad, declara capacidades y registra los
// handlers de "tools/list" y "tools/call". El entry point (index.ts) solo se
// encarga de crear las dependencias y conectarlo al transporte stdio.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { GitHubOperations } from "./github/operations.js";
import { TOOL_DEFINITIONS } from "./tools/definitions.js";
import { callTool } from "./tools/handlers.js";

export const SERVER_INFO = {
  name: "shakatoti1618-agent",
  version: "1.0.0",
} as const;

/** Crea el server MCP con todos los tools registrados. */
export function createServer(operations: GitHubOperations): Server {
  const server = new Server(SERVER_INFO, {
    capabilities: { tools: {} },
  });

  // "tools/list": le dice al LLM qué tools existen y cómo usarlos.
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  // "tools/call": ejecuta el tool que el LLM haya decidido invocar.
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return callTool(operations, name, args);
  });

  return server;
}

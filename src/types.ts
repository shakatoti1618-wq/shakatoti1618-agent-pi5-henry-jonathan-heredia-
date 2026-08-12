// src/types.ts
// Tipos de dominio compartidos. Reflejan el problema (GitHub + MCP) y no detalles
// de implementación, para que el resto del código sea predecible.

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** El resultado que devuelve un tool al LLM (mismo shape que CallToolResult del SDK). */
export type ToolResult = CallToolResult;

export interface RepositoryInfo {
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  description: string | null;
  htmlUrl: string;
  defaultBranch: string;
  createdAt: string;
}

export interface IssueInfo {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  user: string | null;
  createdAt: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  htmlUrl: string;
}

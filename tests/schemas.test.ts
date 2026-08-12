// tests/schemas.test.ts
// Tests de validación de schemas Zod: inputs válidos pasan, inválidos fallan
// con mensajes claros que el LLM puede comunicar al usuario.

import { describe, expect, it } from "vitest";
import {
  closeIssueSchema,
  createCommitSchema,
  createIssueSchema,
  createPullRequestSchema,
  createRepositorySchema,
  listIssuesSchema,
} from "../src/schemas/schemas.js";

describe("createRepositorySchema", () => {
  it("acepta un nombre de repositorio válido", () => {
    const result = createRepositorySchema.safeParse({ name: "mi-proyecto" });
    expect(result.success).toBe(true);
  });

  it("rechaza un nombre con menos de 3 caracteres", () => {
    const result = createRepositorySchema.safeParse({ name: "ab" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/al menos 3 caracteres/i);
    }
  });

  it("rechaza caracteres no permitidos (espacios y acentos)", () => {
    const result = createRepositorySchema.safeParse({ name: "mi proyecto ñ" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/letras, números, guiones y puntos/i);
    }
  });

  it("rechaza nombres que empiezan o terminan con punto", () => {
    expect(createRepositorySchema.safeParse({ name: ".repo" }).success).toBe(false);
    expect(createRepositorySchema.safeParse({ name: "repo." }).success).toBe(false);
  });

  it("acepta campos opcionales (descripción, privado, autoInit)", () => {
    const result = createRepositorySchema.safeParse({
      name: "api-gateway",
      description: "Servicio de gateway",
      isPrivate: true,
      autoInit: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("createIssueSchema", () => {
  it("acepta owner, repo y título", () => {
    const result = createIssueSchema.safeParse({
      owner: "shakatoti1618",
      repo: "mi-proyecto",
      title: "Fix: no inicia sesión",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un issue sin título", () => {
    const result = createIssueSchema.safeParse({
      owner: "shakatoti1618",
      repo: "mi-proyecto",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/título.*no puede estar vacío/i);
    }
  });

  it("rechaza un owner con caracteres inválidos", () => {
    const result = createIssueSchema.safeParse({
      owner: "usuario@malo",
      repo: "mi-proyecto",
      title: "Algo",
    });
    expect(result.success).toBe(false);
  });
});

describe("listIssuesSchema", () => {
  it("rechaza un state inválido", () => {
    const result = listIssuesSchema.safeParse({
      owner: "shakatoti1618",
      repo: "mi-proyecto",
      state: "en-progreso",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/open|closed|all/i);
    }
  });
});

describe("closeIssueSchema", () => {
  it("rechaza un issueNumber que no es entero positivo", () => {
    expect(
      closeIssueSchema.safeParse({ owner: "shakatoti1618", repo: "mi-proyecto", issueNumber: -3 }).success,
    ).toBe(false);
    expect(
      closeIssueSchema.safeParse({ owner: "shakatoti1618", repo: "mi-proyecto", issueNumber: 1.5 }).success,
    ).toBe(false);
  });

  it("acepta un issueNumber entero positivo", () => {
    expect(
      closeIssueSchema.safeParse({ owner: "shakatoti1618", repo: "mi-proyecto", issueNumber: 12 }).success,
    ).toBe(true);
  });
});

describe("createCommitSchema", () => {
  it("asigna la rama 'main' por defecto", () => {
    const result = createCommitSchema.safeParse({
      owner: "shakatoti1618",
      repo: "mi-proyecto",
      path: "docs/README.md",
      message: "Agrega documentación",
      content: "# Hola",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.branch).toBe("main");
    }
  });

  it("rechaza un commit sin mensaje", () => {
    const result = createCommitSchema.safeParse({
      owner: "shakatoti1618",
      repo: "mi-proyecto",
      path: "a.txt",
      content: "hola",
    });
    expect(result.success).toBe(false);
  });
});

describe("createPullRequestSchema", () => {
  it("requiere head y base", () => {
    const result = createPullRequestSchema.safeParse({
      owner: "shakatoti1618",
      repo: "mi-proyecto",
      title: "PR de ejemplo",
    });
    expect(result.success).toBe(false);
  });
});

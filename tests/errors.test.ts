// tests/errors.test.ts
// Tests de la transformación de errores y del retry con exponential backoff.

import { describe, expect, it, vi, afterEach } from "vitest";
import {
  AppError,
  AuthenticationError,
  GitHubAPIError,
  NetworkError,
  RateLimitError,
  classifyError,
  fromOctokitError,
  withRetry,
} from "../src/errors/errors.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("fromOctokitError", () => {
  it("convierte un 401 en AuthenticationError", () => {
    const err = Object.assign(new Error("Bad credentials"), { status: 401 });
    const appError = fromOctokitError(err);
    expect(appError).toBeInstanceOf(AuthenticationError);
    expect(appError.userMessage).toMatch(/token/);
  });

  it("convierte un 403 en AuthenticationError (sin rate limit)", () => {
    const err = Object.assign(new Error("Forbidden"), { status: 403 });
    const appError = fromOctokitError(err);
    expect(appError.category).toBe("AUTHENTICATION");
    expect(appError.userMessage).toMatch(/permisos/);
  });

  it("convierte un 429 en RateLimitError", () => {
    const err = Object.assign(new Error("Too Many Requests"), { status: 429 });
    const appError = fromOctokitError(err);
    expect(appError).toBeInstanceOf(RateLimitError);
    expect(appError.userMessage).toMatch(/límite/);
  });

  it("detecta rate limit por header X-RateLimit-Remaining: 0", () => {
    const err = Object.assign(new Error("Forbidden"), {
      status: 403,
      response: { headers: { "x-ratelimit-remaining": "0" } },
    });
    const appError = fromOctokitError(err);
    expect(appError).toBeInstanceOf(RateLimitError);
  });

  it("convierte un error sin status en NetworkError", () => {
    const err = new Error("socket hang up");
    const appError = fromOctokitError(err);
    expect(appError).toBeInstanceOf(NetworkError);
  });

  it("convierte un 404 en GitHubAPIError", () => {
    const err = Object.assign(new Error("Not Found"), { status: 404 });
    const appError = fromOctokitError(err);
    expect(appError.category).toBe("API");
    expect(appError.status).toBe(404);
  });
});

describe("classifyError", () => {
  it("devuelve los AppError tal cual", () => {
    const appError = new AppError("API", "mensaje");
    expect(classifyError(appError)).toBe(appError);
  });

  it("detecta errores de red por nombre/causa", () => {
    const err = new TypeError("connect ECONNREFUSED 127.0.0.1:443");
    expect(classifyError(err)).toBeInstanceOf(NetworkError);
  });

  it("clasifica errores desconocidos como GitHubAPIError", () => {
    expect(classifyError(new Error("cosa rara"))).toBeInstanceOf(GitHubAPIError);
  });
});

describe("withRetry", () => {
  it("reintenta errores de red con backoff y termina lanzando AppError", async () => {
    vi.useFakeTimers();
    const failing = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new NetworkError("no hay red"))
      .mockRejectedValueOnce(new NetworkError("no hay red"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(failing, { retries: 3 });
    // Avanza los timers de los 2 reintentos.
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe("ok");
    expect(failing).toHaveBeenCalledTimes(3);
  });

  it("agota los intentos y propaga el error final", async () => {
    vi.useFakeTimers();
    const failing = vi.fn<() => Promise<string>>().mockRejectedValue(new NetworkError("sin red"));

    const promise = withRetry(failing, { retries: 1 });
    // Se adjunta el manejador ANTES de avanzar los timers para evitar unhandled rejection.
    const assertion = expect(promise).rejects.toBeInstanceOf(NetworkError);
    await vi.runAllTimersAsync();

    await assertion;
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("no reintenta errores no transitorios (AuthenticationError)", async () => {
    const failing = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new AuthenticationError("token inválido"));

    await expect(withRetry(failing, { retries: 3 })).rejects.toBeInstanceOf(AuthenticationError);
    expect(failing).toHaveBeenCalledTimes(1);
  });
});

import type { AdPlatform } from "@4him/shared";

/** Erro vindo da API da plataforma (resposta não-ok). */
export class PlatformApiError extends Error {
  constructor(
    readonly platform: AdPlatform,
    readonly status: number,
    message: string,
    readonly payload?: unknown,
  ) {
    super(`[${platform}] ${status}: ${message}`);
    this.name = "PlatformApiError";
  }
}

/** A plataforma não suporta (ainda) esta operação. */
export class UnsupportedOperationError extends Error {
  constructor(platform: AdPlatform, operation: string) {
    super(`[${platform}] operação não suportada: ${operation}`);
    this.name = "UnsupportedOperationError";
  }
}

/** Token expirado/revogado — a conexão precisa ser refeita pelo usuário. */
export class AuthExpiredError extends Error {
  constructor(readonly platform: AdPlatform, message = "credenciais expiradas ou revogadas") {
    super(`[${platform}] ${message}`);
    this.name = "AuthExpiredError";
  }
}

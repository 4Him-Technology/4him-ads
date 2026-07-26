import { PlatformApiError, AuthExpiredError } from "../errors.js";

const GRAPH_HOST = "https://graph.facebook.com";

/** Códigos do Meta que significam "token morto" — exigem reconectar. */
const AUTH_ERROR_CODES = new Set([190, 102, 463, 467]);

interface MetaErrorBody {
  error?: { message?: string; code?: number; type?: string };
}

/** Uma página de resposta do Graph API. */
interface MetaPage<T> {
  data?: T[];
  paging?: { next?: string; cursors?: { after?: string } };
}

export interface MetaClientOptions {
  apiVersion: string;
  accessToken: string;
  /** Injeta um fetch alternativo (testes). Padrão: fetch global. */
  fetchImpl?: typeof fetch;
}

export class MetaClient {
  private readonly apiVersion: string;
  private readonly accessToken: string;
  private readonly doFetch: typeof fetch;

  constructor(options: MetaClientOptions) {
    this.apiVersion = options.apiVersion;
    this.accessToken = options.accessToken;
    this.doFetch = options.fetchImpl ?? fetch;
  }

  private url(path: string, params: Record<string, string | undefined> = {}): string {
    const clean = path.startsWith("/") ? path.slice(1) : path;
    const url = new URL(`${GRAPH_HOST}/${this.apiVersion}/${clean}`);
    url.searchParams.set("access_token", this.accessToken);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await this.doFetch(url, init);
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : {};

    if (!res.ok) {
      const err = (body as MetaErrorBody).error;
      const code = err?.code;
      if (code !== undefined && AUTH_ERROR_CODES.has(code)) {
        throw new AuthExpiredError("meta", err?.message);
      }
      throw new PlatformApiError("meta", res.status, err?.message ?? "erro desconhecido", body);
    }

    return body as T;
  }

  /** GET simples. */
  async get<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
    return this.request<T>(this.url(path, params));
  }

  /**
   * GET seguindo a paginação por cursor até acabar.
   * O Graph devolve `paging.next` já com o token embutido.
   */
  async getAll<T>(path: string, params?: Record<string, string | undefined>): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined = this.url(path, { limit: "200", ...params });

    while (next) {
      const page: MetaPage<T> = await this.request<MetaPage<T>>(next);
      if (page.data) out.push(...page.data);
      next = page.paging?.next;
    }

    return out;
  }

  /** POST com corpo form-encoded (padrão do Marketing API). */
  async post<T>(path: string, fields: Record<string, string | undefined>): Promise<T> {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) form.set(key, value);
    }
    form.set("access_token", this.accessToken);

    const clean = path.startsWith("/") ? path.slice(1) : path;
    return this.request<T>(`${GRAPH_HOST}/${this.apiVersion}/${clean}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  }
}

export { GRAPH_HOST };

import type { AdPlatform, EntityStatus, MetricLevel } from "@4him/shared";

/**
 * Contrato único de conector de plataforma de anúncios.
 *
 * Toda plataforma (Meta, Google, TikTok, LinkedIn...) implementa esta mesma
 * interface. O domínio e a UI falam só com o contrato — adicionar plataforma
 * é acrescentar um adapter, sem tocar no resto do sistema.
 */

// ============================================================
// Autenticação (OAuth)
// ============================================================

export interface OAuthAppConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  /** Versão da API da plataforma (ex.: "v21.0" no Meta). */
  apiVersion?: string;
}

export interface AuthUrlParams {
  /** Valor opaco devolvido pela plataforma no callback — protege contra CSRF. */
  state: string;
  scopes?: string[];
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Momento em que o token expira; ausente = sem expiração conhecida. */
  expiresAt?: Date;
  scopes?: string[];
}

// ============================================================
// Entidades retornadas pelos conectores (DTOs neutros de plataforma)
// ============================================================

export interface ExternalAdAccount {
  externalId: string;
  name: string;
  currency?: string;
  timezone?: string;
  status: EntityStatus;
}

export interface ExternalCampaign {
  externalId: string;
  name: string;
  objective?: string;
  status: EntityStatus;
  /** Valores já convertidos para a unidade principal da moeda (ex.: reais, não centavos). */
  dailyBudget?: number;
  lifetimeBudget?: number;
  startTime?: Date;
  stopTime?: Date;
  raw: unknown;
}

export interface ExternalAdSet {
  externalId: string;
  campaignExternalId: string;
  name: string;
  status: EntityStatus;
  dailyBudget?: number;
  lifetimeBudget?: number;
  targeting?: unknown;
  raw: unknown;
}

export interface ExternalAd {
  externalId: string;
  adSetExternalId: string;
  name: string;
  status: EntityStatus;
  creativeExternalId?: string;
  raw: unknown;
}

/** Uma linha de métrica diária de uma entidade. */
export interface ExternalInsight {
  entityExternalId: string;
  level: MetricLevel;
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
  raw: unknown;
}

export interface InsightsQuery {
  /** Conta de anúncios (id externo) de onde puxar. */
  accountExternalId: string;
  level: MetricLevel;
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
}

// ============================================================
// Operações de escrita
// ============================================================

export interface CreateCampaignInput {
  accountExternalId: string;
  name: string;
  objective: string;
  status?: Extract<EntityStatus, "active" | "paused">;
  dailyBudget?: number;
  lifetimeBudget?: number;
}

export interface UpdateBudgetInput {
  entityExternalId: string;
  level: Extract<MetricLevel, "campaign" | "adset">;
  dailyBudget?: number;
  lifetimeBudget?: number;
}

export interface SetStatusInput {
  entityExternalId: string;
  level: Extract<MetricLevel, "campaign" | "adset" | "ad">;
  status: Extract<EntityStatus, "active" | "paused">;
}

// ============================================================
// O contrato
// ============================================================

export interface PlatformConnector {
  readonly platform: AdPlatform;

  /** Capacidades declaradas — a UI usa para habilitar/desabilitar ações. */
  readonly capabilities: {
    read: boolean;
    write: boolean;
  };

  // --- auth ---
  getAuthUrl(params: AuthUrlParams): string;
  exchangeCode(code: string): Promise<TokenSet>;
  refreshToken(tokens: TokenSet): Promise<TokenSet>;

  // --- leitura ---
  listAdAccounts(tokens: TokenSet): Promise<ExternalAdAccount[]>;
  listCampaigns(tokens: TokenSet, accountExternalId: string): Promise<ExternalCampaign[]>;
  listAdSets(tokens: TokenSet, accountExternalId: string): Promise<ExternalAdSet[]>;
  listAds(tokens: TokenSet, accountExternalId: string): Promise<ExternalAd[]>;
  getInsights(tokens: TokenSet, query: InsightsQuery): Promise<ExternalInsight[]>;

  // --- escrita (pode lançar UnsupportedOperationError) ---
  createCampaign(tokens: TokenSet, input: CreateCampaignInput): Promise<{ externalId: string }>;
  updateBudget(tokens: TokenSet, input: UpdateBudgetInput): Promise<void>;
  setStatus(tokens: TokenSet, input: SetStatusInput): Promise<void>;
}

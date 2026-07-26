import type { AdPlatform } from "@4him/shared";
import { UnsupportedOperationError } from "../errors.js";
import { MetaClient } from "./client.js";
import {
  majorToMinor,
  mapAd,
  mapAdAccount,
  mapAdSet,
  mapCampaign,
  mapInsight,
  toMetaStatus,
  type MetaAdAccountRaw,
  type MetaAdRaw,
  type MetaAdSetRaw,
  type MetaCampaignRaw,
  type MetaInsightRaw,
} from "./mappers.js";
import type {
  AuthUrlParams,
  CreateCampaignInput,
  ExternalAd,
  ExternalAdAccount,
  ExternalAdSet,
  ExternalCampaign,
  ExternalInsight,
  InsightsQuery,
  OAuthAppConfig,
  PlatformConnector,
  SetStatusInput,
  TokenSet,
  UpdateBudgetInput,
} from "../types.js";

const DEFAULT_API_VERSION = "v21.0";

/** Escopos mínimos para leitura de relatórios. */
export const META_READ_SCOPES = ["ads_read", "business_management"];
/** Escopos para gerenciar campanhas — exigem App Review da Meta. */
export const META_WRITE_SCOPES = ["ads_management", "business_management"];

const ACCOUNT_FIELDS = "id,account_id,name,currency,timezone_name,account_status";
const CAMPAIGN_FIELDS =
  "id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time";
const ADSET_FIELDS = "id,campaign_id,name,status,daily_budget,lifetime_budget,targeting";
const AD_FIELDS = "id,adset_id,name,status,creative{id}";
const INSIGHT_FIELDS = "impressions,clicks,spend,actions,action_values";

/** Nível do nosso domínio → parâmetro `level` do Meta. */
const LEVEL_MAP = {
  account: "account",
  campaign: "campaign",
  adset: "adset",
  ad: "ad",
} as const;

/**
 * Conector do Meta Ads (Marketing API).
 *
 * Leitura funciona com `ads_read`. As operações de escrita exigem
 * `ads_management` + App Review aprovado — por isso `capabilities.write`
 * é derivado da configuração, e a UI usa isso para liberar as ações.
 */
export class MetaConnector implements PlatformConnector {
  readonly platform: AdPlatform = "meta";

  private readonly config: OAuthAppConfig;
  private readonly apiVersion: string;
  private readonly writeEnabled: boolean;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(
    config: OAuthAppConfig,
    options: { writeEnabled?: boolean; fetchImpl?: typeof fetch } = {},
  ) {
    this.config = config;
    this.apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
    this.writeEnabled = options.writeEnabled ?? false;
    this.fetchImpl = options.fetchImpl;
  }

  get capabilities() {
    return { read: true, write: this.writeEnabled };
  }

  private client(tokens: TokenSet): MetaClient {
    return new MetaClient({
      apiVersion: this.apiVersion,
      accessToken: tokens.accessToken,
      fetchImpl: this.fetchImpl,
    });
  }

  // ============================================================
  // Auth
  // ============================================================

  getAuthUrl({ state, scopes }: AuthUrlParams): string {
    const url = new URL(`https://www.facebook.com/${this.apiVersion}/dialog/oauth`);
    url.searchParams.set("client_id", this.config.appId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      (scopes ?? (this.writeEnabled ? META_WRITE_SCOPES : META_READ_SCOPES)).join(","),
    );
    return url.toString();
  }

  async exchangeCode(code: string): Promise<TokenSet> {
    const client = new MetaClient({
      apiVersion: this.apiVersion,
      accessToken: "",
      fetchImpl: this.fetchImpl,
    });

    const short = await client.get<{ access_token: string; expires_in?: number }>(
      "oauth/access_token",
      {
        client_id: this.config.appId,
        client_secret: this.config.appSecret,
        redirect_uri: this.config.redirectUri,
        code,
      },
    );

    // Troca imediata pelo token de longa duração (~60 dias).
    return this.exchangeForLongLived(short.access_token);
  }

  /**
   * O Meta não usa refresh token: renova-se trocando o token atual
   * por um novo de longa duração, enquanto ele ainda for válido.
   */
  async refreshToken(tokens: TokenSet): Promise<TokenSet> {
    return this.exchangeForLongLived(tokens.accessToken);
  }

  private async exchangeForLongLived(accessToken: string): Promise<TokenSet> {
    const client = new MetaClient({
      apiVersion: this.apiVersion,
      accessToken: "",
      fetchImpl: this.fetchImpl,
    });

    const long = await client.get<{ access_token: string; expires_in?: number }>(
      "oauth/access_token",
      {
        grant_type: "fb_exchange_token",
        client_id: this.config.appId,
        client_secret: this.config.appSecret,
        fb_exchange_token: accessToken,
      },
    );

    return {
      accessToken: long.access_token,
      expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : undefined,
      scopes: this.writeEnabled ? META_WRITE_SCOPES : META_READ_SCOPES,
    };
  }

  // ============================================================
  // Leitura
  // ============================================================

  async listAdAccounts(tokens: TokenSet): Promise<ExternalAdAccount[]> {
    const rows = await this.client(tokens).getAll<MetaAdAccountRaw>("me/adaccounts", {
      fields: ACCOUNT_FIELDS,
    });
    return rows.map(mapAdAccount);
  }

  async listCampaigns(tokens: TokenSet, accountExternalId: string): Promise<ExternalCampaign[]> {
    const rows = await this.client(tokens).getAll<MetaCampaignRaw>(
      `${normalizeAccountId(accountExternalId)}/campaigns`,
      { fields: CAMPAIGN_FIELDS },
    );
    return rows.map(mapCampaign);
  }

  async listAdSets(tokens: TokenSet, accountExternalId: string): Promise<ExternalAdSet[]> {
    const rows = await this.client(tokens).getAll<MetaAdSetRaw>(
      `${normalizeAccountId(accountExternalId)}/adsets`,
      { fields: ADSET_FIELDS },
    );
    return rows.map(mapAdSet);
  }

  async listAds(tokens: TokenSet, accountExternalId: string): Promise<ExternalAd[]> {
    const rows = await this.client(tokens).getAll<MetaAdRaw>(
      `${normalizeAccountId(accountExternalId)}/ads`,
      { fields: AD_FIELDS },
    );
    return rows.map(mapAd);
  }

  async getInsights(tokens: TokenSet, query: InsightsQuery): Promise<ExternalInsight[]> {
    const rows = await this.client(tokens).getAll<MetaInsightRaw>(
      `${normalizeAccountId(query.accountExternalId)}/insights`,
      {
        fields: INSIGHT_FIELDS,
        level: LEVEL_MAP[query.level],
        // time_increment=1 quebra o resultado em linhas diárias.
        time_increment: "1",
        time_range: JSON.stringify({ since: query.since, until: query.until }),
      },
    );
    return rows.map((row) => mapInsight(row, query.level));
  }

  // ============================================================
  // Escrita (gated por App Review)
  // ============================================================

  async createCampaign(
    tokens: TokenSet,
    input: CreateCampaignInput,
  ): Promise<{ externalId: string }> {
    this.assertWrite("createCampaign");

    const res = await this.client(tokens).post<{ id: string }>(
      `${normalizeAccountId(input.accountExternalId)}/campaigns`,
      {
        name: input.name,
        objective: input.objective,
        status: toMetaStatus(input.status ?? "paused"),
        daily_budget: input.dailyBudget ? majorToMinor(input.dailyBudget) : undefined,
        lifetime_budget: input.lifetimeBudget ? majorToMinor(input.lifetimeBudget) : undefined,
        special_ad_categories: "[]",
      },
    );

    return { externalId: res.id };
  }

  async updateBudget(tokens: TokenSet, input: UpdateBudgetInput): Promise<void> {
    this.assertWrite("updateBudget");

    await this.client(tokens).post(input.entityExternalId, {
      daily_budget: input.dailyBudget ? majorToMinor(input.dailyBudget) : undefined,
      lifetime_budget: input.lifetimeBudget ? majorToMinor(input.lifetimeBudget) : undefined,
    });
  }

  async setStatus(tokens: TokenSet, input: SetStatusInput): Promise<void> {
    this.assertWrite("setStatus");

    await this.client(tokens).post(input.entityExternalId, {
      status: toMetaStatus(input.status),
    });
  }

  private assertWrite(operation: string): void {
    if (!this.writeEnabled) {
      throw new UnsupportedOperationError("meta", `${operation} (escrita desabilitada)`);
    }
  }
}

/** O Marketing API espera contas no formato `act_<id>`. */
function normalizeAccountId(id: string): string {
  return id.startsWith("act_") ? id : `act_${id}`;
}

export { MetaClient };

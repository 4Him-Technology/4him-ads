import type { EntityStatus, MetricLevel } from "@4him/shared";
import type {
  ExternalAd,
  ExternalAdAccount,
  ExternalAdSet,
  ExternalCampaign,
  ExternalInsight,
} from "../types.js";

// ============================================================
// Formatos crus do Meta (só os campos que pedimos)
// ============================================================

export interface MetaAdAccountRaw {
  id: string;
  account_id?: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
}

export interface MetaCampaignRaw {
  id: string;
  name?: string;
  objective?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
}

export interface MetaAdSetRaw {
  id: string;
  campaign_id?: string;
  name?: string;
  status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  targeting?: unknown;
}

export interface MetaAdRaw {
  id: string;
  adset_id?: string;
  name?: string;
  status?: string;
  creative?: { id?: string };
}

export interface MetaInsightRaw {
  date_start?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  actions?: { action_type?: string; value?: string }[];
  action_values?: { action_type?: string; value?: string }[];
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  account_id?: string;
}

// ============================================================
// Helpers
// ============================================================

/** Meta manda números como string; orçamentos vêm em centavos. */
function toNumber(value: string | undefined): number {
  if (value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function minorToMajor(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n / 100 : undefined;
}

/** Converte reais → centavos (o Meta espera a unidade menor na escrita). */
export function majorToMinor(value: number): string {
  return String(Math.round(value * 100));
}

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Status do Meta → status do nosso domínio. */
export function mapStatus(status: string | undefined): EntityStatus {
  switch ((status ?? "").toUpperCase()) {
    case "ACTIVE":
      return "active";
    case "PAUSED":
    case "CAMPAIGN_PAUSED":
    case "ADSET_PAUSED":
      return "paused";
    case "ARCHIVED":
      return "archived";
    case "DELETED":
      return "deleted";
    case "PENDING_REVIEW":
    case "IN_PROCESS":
      return "pending";
    default:
      return "draft";
  }
}

/** Status do nosso domínio → status do Meta (escrita). */
export function toMetaStatus(status: "active" | "paused"): string {
  return status === "active" ? "ACTIVE" : "PAUSED";
}

/**
 * `account_status` do Meta é numérico: 1 = ativo, 2 = desabilitado,
 * 3 = irreversivelmente fechado, 101/100 = variações de encerrada.
 */
function mapAccountStatus(status: number | undefined): EntityStatus {
  return status === 1 ? "active" : "paused";
}

/**
 * Soma as conversões relevantes. O Meta devolve dezenas de `action_type`;
 * consideramos os tipos ligados a compra/lead — que é o que o cliente
 * acompanha como resultado.
 */
const CONVERSION_ACTIONS = new Set([
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "complete_registration",
]);

function sumActions(
  actions: { action_type?: string; value?: string }[] | undefined,
): number {
  if (!actions) return 0;
  return actions.reduce((total, action) => {
    if (action.action_type && CONVERSION_ACTIONS.has(action.action_type)) {
      return total + toNumber(action.value);
    }
    return total;
  }, 0);
}

// ============================================================
// Mapeadores
// ============================================================

export function mapAdAccount(raw: MetaAdAccountRaw): ExternalAdAccount {
  return {
    externalId: raw.id,
    name: raw.name ?? raw.id,
    currency: raw.currency,
    timezone: raw.timezone_name,
    status: mapAccountStatus(raw.account_status),
  };
}

export function mapCampaign(raw: MetaCampaignRaw): ExternalCampaign {
  return {
    externalId: raw.id,
    name: raw.name ?? raw.id,
    objective: raw.objective,
    status: mapStatus(raw.effective_status ?? raw.status),
    dailyBudget: minorToMajor(raw.daily_budget),
    lifetimeBudget: minorToMajor(raw.lifetime_budget),
    startTime: toDate(raw.start_time),
    stopTime: toDate(raw.stop_time),
    raw,
  };
}

export function mapAdSet(raw: MetaAdSetRaw): ExternalAdSet {
  return {
    externalId: raw.id,
    campaignExternalId: raw.campaign_id ?? "",
    name: raw.name ?? raw.id,
    status: mapStatus(raw.status),
    dailyBudget: minorToMajor(raw.daily_budget),
    lifetimeBudget: minorToMajor(raw.lifetime_budget),
    targeting: raw.targeting,
    raw,
  };
}

export function mapAd(raw: MetaAdRaw): ExternalAd {
  return {
    externalId: raw.id,
    adSetExternalId: raw.adset_id ?? "",
    name: raw.name ?? raw.id,
    status: mapStatus(raw.status),
    creativeExternalId: raw.creative?.id,
    raw,
  };
}

export function mapInsight(raw: MetaInsightRaw, level: MetricLevel): ExternalInsight {
  const entityExternalId =
    level === "ad"
      ? (raw.ad_id ?? "")
      : level === "adset"
        ? (raw.adset_id ?? "")
        : level === "campaign"
          ? (raw.campaign_id ?? "")
          : (raw.account_id ?? "");

  return {
    entityExternalId,
    level,
    date: raw.date_start ?? "",
    impressions: toNumber(raw.impressions),
    clicks: toNumber(raw.clicks),
    spend: toNumber(raw.spend),
    conversions: sumActions(raw.actions),
    revenue: sumActions(raw.action_values),
    raw,
  };
}

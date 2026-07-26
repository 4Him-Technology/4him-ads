import { z } from "zod";

/**
 * @4him/shared — contratos compartilhados entre web e api.
 * Fonte de verdade de enums, tipos de domínio e schemas de validação.
 * Espelha o schema do banco (supabase/migrations).
 */

// ============================================================
// Enums (espelham os tipos do Postgres)
// ============================================================

export const AD_PLATFORMS = ["meta", "google", "tiktok", "linkedin", "pinterest", "other"] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

export const MEMBERSHIP_ROLES = ["owner", "admin", "manager", "analyst", "client"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const ENTITY_STATUSES = ["active", "paused", "archived", "deleted", "pending", "draft"] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];

export const METRIC_LEVELS = ["account", "campaign", "adset", "ad"] as const;
export type MetricLevel = (typeof METRIC_LEVELS)[number];

export const TASK_STATUSES = ["backlog", "todo", "in_progress", "review", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "changes_requested", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** Rótulos amigáveis das plataformas (UI). */
export const PLATFORM_LABELS: Record<AdPlatform, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  tiktok: "TikTok Ads",
  linkedin: "LinkedIn Ads",
  pinterest: "Pinterest Ads",
  other: "Outra",
};

// ============================================================
// Tipos de domínio (mínimos — crescem por módulo)
// ============================================================

export interface Client {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  status: "active" | "paused" | "archived";
  currency: string;
  timezone: string;
}

/** Métrica agregada para dashboards. */
export interface MetricsSummary {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
  ctr: number; // %
  cpc: number;
  cpm: number;
  roas: number;
}

// ============================================================
// Helpers de métricas (usados em web e api)
// ============================================================

/** Deriva CTR, CPC, CPM e ROAS a partir dos totais brutos. */
export function deriveMetrics(base: {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
}): MetricsSummary {
  const { impressions, clicks, spend, conversions, revenue } = base;
  return {
    impressions,
    clicks,
    spend,
    conversions,
    revenue,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    roas: spend > 0 ? revenue / spend : 0,
  };
}

// ============================================================
// Schemas Zod (validação de payloads de API)
// ============================================================

export const dateRangeSchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
});
export type DateRange = z.infer<typeof dateRangeSchema>;

export const createClientSchema = z.object({
  name: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "use apenas minúsculas, números e hífens"),
  currency: z.string().default("BRL"),
  timezone: z.string().default("America/Sao_Paulo"),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

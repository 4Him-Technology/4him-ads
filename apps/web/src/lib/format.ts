/** Formatações compartilhadas pelas telas. */

export const brl = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const num = (n: number | null | undefined) => (Number(n) || 0).toLocaleString("pt-BR");

export const data = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";

export const CICLO_LABEL: Record<string, string> = {
  monthly: "mensal",
  quarterly: "trimestral",
  yearly: "anual",
};

export const METRICA_LABEL: Record<string, string> = {
  ad_spend: "verba investida",
  revenue: "receita gerada",
  conversions: "conversões",
  leads: "leads",
};

export const STATUS_ASSINATURA: Record<string, { label: string; cor: string }> = {
  trialing: { label: "Em carência", cor: "bg-amber-500/10 text-amber-700" },
  active: { label: "Ativa", cor: "bg-emerald-500/10 text-emerald-700" },
  past_due: { label: "Em atraso", cor: "bg-red-500/10 text-red-700" },
  suspended: { label: "Suspensa", cor: "bg-red-500/10 text-red-700" },
  cancelled: { label: "Cancelada", cor: "bg-muted text-muted-foreground" },
};

export const STATUS_FATURA: Record<string, { label: string; cor: string }> = {
  pending: { label: "Aguardando", cor: "bg-amber-500/10 text-amber-700" },
  paid: { label: "Paga", cor: "bg-emerald-500/10 text-emerald-700" },
  overdue: { label: "Vencida", cor: "bg-red-500/10 text-red-700" },
  refunded: { label: "Estornada", cor: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelada", cor: "bg-muted text-muted-foreground" },
};

/** Descreve a regra variável de um plano em uma frase. */
export function descreverVariavel(p: {
  variable_pct: number | null;
  variable_threshold: number | null;
  variable_metric: string | null;
  variable_grace_months?: number;
}): string | null {
  if (!p.variable_pct || !p.variable_metric) return null;

  const base = `${p.variable_pct}% sobre ${METRICA_LABEL[p.variable_metric] ?? p.variable_metric} acima de ${brl(p.variable_threshold)}`;
  const carencia = p.variable_grace_months
    ? `, a partir do ${p.variable_grace_months}º mês`
    : "";
  return base + carencia;
}

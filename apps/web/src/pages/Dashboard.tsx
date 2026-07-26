import { AD_PLATFORMS, PLATFORM_LABELS, deriveMetrics, type AdPlatform } from "@4him/shared";
import { cn } from "@/lib/utils";

// Placeholder até o conector Meta trazer dados reais.
const kpis = deriveMetrics({ impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 });

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");

const PLATFORM_STATUS: Record<AdPlatform, string> = {
  meta: "Fase 1",
  google: "Planejado",
  tiktok: "Planejado",
  linkedin: "Planejado",
  pinterest: "Planejado",
  other: "Planejado",
};

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Visão consolidada de tráfego pago</p>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground/80">
        🚧 <strong className="text-primary">Fase 0 — fundação.</strong> Estrutura, modelo de dados
        multi-tenant e o painel no padrão 4Him prontos. Os números abaixo são placeholders até
        plugarmos o conector do Meta Ads.
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Investimento" value={brl(kpis.spend)} />
        <Kpi label="Impressões" value={num(kpis.impressions)} />
        <Kpi label="Cliques" value={num(kpis.clicks)} />
        <Kpi label="Conversões" value={num(kpis.conversions)} />
        <Kpi label="ROAS" value={`${kpis.roas.toFixed(2)}x`} highlight />
      </section>

      {/* Conectores */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Conectores de plataforma
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {AD_PLATFORMS.filter((p) => p !== "other").map((platform) => (
            <div
              key={platform}
              className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3"
            >
              <span className="text-sm text-foreground">{PLATFORM_LABELS[platform]}</span>
              <span
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] uppercase tracking-wide",
                  platform === "meta"
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {PLATFORM_STATUS[platform]}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold", highlight ? "text-primary" : "text-foreground")}>
        {value}
      </div>
    </div>
  );
}

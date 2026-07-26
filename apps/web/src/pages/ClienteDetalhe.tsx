import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CircleDollarSign,
  Images,
  Loader2,
  Megaphone,
  Plug,
  Sparkles,
  UserPlus,
} from "lucide-react";
import SeletorPeriodo, { PERIODOS, type ChavePeriodo } from "@/components/SeletorPeriodo";
import ConviteCliente from "@/components/ConviteCliente";
import PainelCobranca from "@/components/cliente/PainelCobranca";
import PainelBriefing from "@/components/cliente/PainelBriefing";
import {
  fetchClient,
  fetchVisaoCliente,
  type CampanhaResumo,
  type Periodo,
  type VisaoCliente,
} from "@/lib/api";
import { brl, num } from "@/lib/format";
import { cn } from "@/lib/utils";

type Aba = "visao" | "campanhas" | "criativos" | "cobranca" | "briefing" | "acessos";

const ABAS: { id: Aba; label: string; icon: typeof Megaphone }[] = [
  { id: "visao", label: "Visão geral", icon: Building2 },
  { id: "campanhas", label: "Campanhas", icon: Megaphone },
  { id: "criativos", label: "Criativos", icon: Images },
  { id: "cobranca", label: "Cobrança", icon: CircleDollarSign },
  { id: "briefing", label: "Briefing", icon: Sparkles },
  { id: "acessos", label: "Acessos", icon: BadgeCheck },
];

/**
 * Tela dedicada a UM cliente — tudo dele em um lugar.
 * É a tela mais usada da operação: resultado, campanhas, criativos,
 * cobrança e briefing sem precisar sair daqui.
 */
export default function ClienteDetalhe() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [aba, setAba] = useState<Aba>("visao");
  const [chave, setChave] = useState<ChavePeriodo>("30d");
  const [periodo, setPeriodo] = useState<Periodo>(() => PERIODOS["30d"]());
  const [convite, setConvite] = useState(false);

  const cliente = useQuery({ queryKey: ["client", id], queryFn: () => fetchClient(id) });
  const visao = useQuery({
    queryKey: ["client", id, "overview", periodo],
    queryFn: () => fetchVisaoCliente(id, periodo),
    enabled: Boolean(id),
  });

  const recarregar = () => {
    void queryClient.invalidateQueries({ queryKey: ["client", id] });
    void queryClient.invalidateQueries({ queryKey: ["clients"] });
  };

  if (cliente.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (cliente.isError || !cliente.data) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-muted-foreground">Cliente não encontrado.</p>
        <button
          type="button"
          onClick={() => navigate("/clientes")}
          className="mt-4 text-sm font-medium text-primary hover:underline"
        >
          Voltar para clientes
        </button>
      </div>
    );
  }

  const c = cliente.data;
  const contrato = c.subscriptions?.find((s) => s.status !== "cancelled") ?? null;

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div>
        <Link
          to="/clientes"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Clientes
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-2xl font-bold text-foreground">{c.name}</h2>
              <p className="text-sm text-muted-foreground">
                {[c.segment, c.service_area, contrato ? `${brl(contrato.amount)}/mês` : "sem contrato"]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConvite(true)}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <UserPlus className="h-4 w-4" />
              Dar acesso
            </button>
            <SeletorPeriodo
              atual={chave}
              aoMudar={(k, p) => {
                setChave(k);
                setPeriodo(p);
              }}
            />
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {ABAS.map((item) => {
          const Icon = item.icon;
          const ativa = aba === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setAba(item.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition",
                ativa
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      {aba === "visao" && <AbaVisao visao={visao.data} carregando={visao.isLoading} />}
      {aba === "campanhas" && <AbaCampanhas campanhas={visao.data?.campanhas ?? []} />}
      {aba === "criativos" && <AbaCriativos total={visao.data?.criativos_total ?? 0} />}
      {aba === "cobranca" && (
        <PainelCobranca
          cliente={c}
          contrato={contrato}
          faturas={visao.data?.faturas ?? []}
          aoAtualizar={recarregar}
        />
      )}
      {aba === "briefing" && <PainelBriefing cliente={c} aoAtualizar={recarregar} />}
      {aba === "acessos" && <AbaAcessos aoConvidar={() => setConvite(true)} />}

      <ConviteCliente cliente={convite ? c : null} aoFechar={() => setConvite(false)} />
    </div>
  );
}

/* ---------------------------------------------------------------- */

function AbaVisao({ visao, carregando }: { visao?: VisaoCliente; carregando: boolean }) {
  if (carregando) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const semDados = (visao?.verba ?? 0) === 0 && (visao?.impressoes ?? 0) === 0;

  return (
    <div className="space-y-5">
      {semDados && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <Plug className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm text-foreground/80">
            Sem conta de anúncios conectada — os números aparecem aqui assim que o conector do
            Meta estiver ligado.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi rotulo="Verba investida" valor={brl(visao?.verba)} />
        <Kpi rotulo="Vendas geradas" valor={brl(visao?.receita)} destaque />
        <Kpi rotulo="Retorno (ROAS)" valor={`${(visao?.roas ?? 0).toFixed(2)}x`} />
        <Kpi
          rotulo="Conversões"
          valor={num(visao?.conversoes)}
          detalhe={visao?.cpa ? `${brl(visao.cpa)} cada` : undefined}
        />
        <Kpi rotulo="Impressões" valor={num(visao?.impressoes)} />
        <Kpi rotulo="Cliques" valor={num(visao?.cliques)} />
        <Kpi rotulo="Taxa de clique" valor={`${(visao?.ctr ?? 0).toFixed(2)}%`} />
        <Kpi rotulo="Criativos" valor={num(visao?.criativos_total)} />
      </div>
    </div>
  );
}

function AbaCampanhas({ campanhas }: { campanhas: CampanhaResumo[] }) {
  if (campanhas.length === 0) {
    return (
      <Vazio
        icone={Megaphone}
        titulo="Nenhuma campanha sincronizada"
        texto="As campanhas aparecem aqui automaticamente quando a conta de anúncios for conectada. Daqui você poderá pausar, reativar e ajustar verba."
      />
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-5 py-2 font-medium">Campanha</th>
            <th className="px-5 py-2 font-medium">Plataforma</th>
            <th className="px-5 py-2 font-medium">Situação</th>
            <th className="px-5 py-2 text-right font-medium">Verba diária</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {campanhas.map((k) => (
            <tr key={k.id}>
              <td className="px-5 py-3 font-medium text-foreground">{k.name}</td>
              <td className="px-5 py-3 text-muted-foreground">{k.platform}</td>
              <td className="px-5 py-3 text-muted-foreground">{k.status}</td>
              <td className="px-5 py-3 text-right text-foreground">{brl(k.daily_budget)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AbaCriativos({ total }: { total: number }) {
  if (total === 0) {
    return (
      <Vazio
        icone={Images}
        titulo="Nenhum criativo na biblioteca"
        texto="Aqui ficará a biblioteca de criativos deste cliente, com o desempenho de cada peça e o histórico de aprovações."
      />
    );
  }
  return <p className="py-6 text-sm text-muted-foreground">{total} criativo(s).</p>;
}

function AbaAcessos({ aoConvidar }: { aoConvidar: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <BadgeCheck className="mx-auto h-7 w-7 text-muted-foreground/40" />
      <h4 className="mt-3 font-semibold text-foreground">Acessos ao portal</h4>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Pessoas do lado do cliente que podem acompanhar os resultados e aprovar criativos.
      </p>
      <button
        type="button"
        onClick={aoConvidar}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
      >
        <UserPlus className="h-4 w-4" />
        Dar acesso
      </button>
    </div>
  );
}

function Vazio({
  icone: Icone,
  titulo,
  texto,
}: {
  icone: typeof Megaphone;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <Icone className="mx-auto h-7 w-7 text-muted-foreground/40" />
      <h4 className="mt-3 font-semibold text-foreground">{titulo}</h4>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}

function Kpi({
  rotulo,
  valor,
  detalhe,
  destaque,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{rotulo}</div>
      <div className={cn("mt-1 text-xl font-bold", destaque ? "text-primary" : "text-foreground")}>
        {valor}
      </div>
      {detalhe && <div className="mt-0.5 text-xs text-muted-foreground">{detalhe}</div>}
    </div>
  );
}

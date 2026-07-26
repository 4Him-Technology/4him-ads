import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Plus, Search, UserPlus } from "lucide-react";
import CadastroCliente from "@/components/CadastroCliente";
import DetalheCliente from "@/components/DetalheCliente";
import ConviteCliente from "@/components/ConviteCliente";
import { fetchClients, type Client } from "@/lib/api";
import { STATUS_ASSINATURA, brl } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const STATUS_CLIENTE: Record<Client["status"], string> = {
  active: "Ativo",
  paused: "Pausado",
  archived: "Arquivado",
};

/**
 * Painel central de clientes: tudo sobre cada marca atendida em um lugar,
 * incluindo a situação comercial — evita ir e voltar entre telas.
 */
export default function Clientes() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [busca, setBusca] = useState("");
  const [modalNovo, setModalNovo] = useState(false);
  const [detalhe, setDetalhe] = useState<Client | null>(null);
  const [convite, setConvite] = useState<Client | null>(null);

  const { data: clientes, isLoading } = useQuery({ queryKey: ["clients"], queryFn: fetchClients });

  const recarregar = () => {
    void queryClient.invalidateQueries({ queryKey: ["clients"] });
    void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    void queryClient.invalidateQueries({ queryKey: ["billing"] });
    void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
  };

  const filtrados = useMemo(() => {
    if (!clientes) return [];
    const termo = busca.trim().toLowerCase();
    if (!termo) return clientes;
    return clientes.filter((c) =>
      [c.name, c.slug, c.contact_name, c.contact_email, c.segment]
        .filter(Boolean)
        .some((campo) => campo!.toLowerCase().includes(termo)),
    );
  }, [clientes, busca]);

  const mrr = useMemo(
    () =>
      (clientes ?? []).reduce((total, c) => {
        const ativa = c.subscriptions?.find((s) => s.status === "active" || s.status === "trialing");
        return total + (ativa ? Number(ativa.amount) : 0);
      }, 0),
    [clientes],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Clientes</h2>
            <p className="text-sm text-muted-foreground">
              {clientes?.length ?? 0} cliente(s) · {brl(mrr)} por mês
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setModalNovo(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Novo cliente
        </button>
      </div>

      {clientes && clientes.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="Buscar por nome, contato ou segmento…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !clientes?.length ? (
        <EstadoVazio aoCriar={() => setModalNovo(true)} />
      ) : filtrados.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum cliente encontrado para “{busca}”.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((cliente) => (
            <CardCliente
              key={cliente.id}
              cliente={cliente}
              podeConvidar={isAdmin}
              aoAbrir={() => setDetalhe(cliente)}
              aoConvidar={() => setConvite(cliente)}
            />
          ))}
        </div>
      )}

      <CadastroCliente
        aberto={modalNovo}
        aoFechar={() => setModalNovo(false)}
        aoCriar={recarregar}
      />
      <DetalheCliente
        cliente={detalhe}
        aoFechar={() => setDetalhe(null)}
        aoAtualizar={recarregar}
      />
      <ConviteCliente cliente={convite} aoFechar={() => setConvite(null)} />
    </div>
  );
}

function EstadoVazio({ aoCriar }: { aoCriar: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <Building2 className="mx-auto h-8 w-8 text-muted-foreground/40" />
      <h3 className="mt-3 font-semibold text-foreground">Nenhum cliente cadastrado</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Cadastre a primeira marca atendida — dados e condições comerciais na mesma tela.
      </p>
      <button
        type="button"
        onClick={aoCriar}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        Cadastrar cliente
      </button>
    </div>
  );
}

function CardCliente({
  cliente,
  podeConvidar,
  aoAbrir,
  aoConvidar,
}: {
  cliente: Client;
  podeConvidar: boolean;
  aoAbrir: () => void;
  aoConvidar: () => void;
}) {
  const contrato = cliente.subscriptions?.find(
    (s) => s.status !== "cancelled",
  );
  const statusContrato = contrato ? STATUS_ASSINATURA[contrato.status] : null;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 transition hover:border-primary/40">
      <button type="button" onClick={aoAbrir} className="flex-1 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-foreground">{cliente.name}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {cliente.segment || cliente.slug}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              cliente.status === "active"
                ? "bg-emerald-500/10 text-emerald-700"
                : "bg-muted text-muted-foreground",
            )}
          >
            {STATUS_CLIENTE[cliente.status]}
          </span>
        </div>

        <div className="mt-3 border-t border-border pt-3">
          {contrato ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{brl(contrato.amount)}</span>
              {statusContrato && (
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-[10px] font-medium uppercase",
                    statusContrato.cor,
                  )}
                >
                  {statusContrato.label}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Sem contrato</span>
          )}
        </div>
      </button>

      {podeConvidar && (
        <button
          type="button"
          onClick={aoConvidar}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Dar acesso
        </button>
      )}
    </div>
  );
}

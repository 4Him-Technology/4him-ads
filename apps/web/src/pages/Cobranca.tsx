import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleDollarSign,
  ExternalLink,
  Hourglass,
  Loader2,
  Plus,
  TrendingUp,
} from "lucide-react";
import Modal, { Campo, inputClasses } from "@/components/Modal";
import {
  ApiError,
  cancelSubscription,
  createSubscription,
  fetchBillingSummary,
  fetchClients,
  fetchInvoices,
  fetchPlans,
  fetchSubscriptions,
  fetchVariablePreview,
  type Subscription,
} from "@/lib/api";
import {
  CICLO_LABEL,
  METRICA_LABEL,
  STATUS_ASSINATURA,
  STATUS_FATURA,
  brl,
  data as fmtData,
  descreverVariavel,
} from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export default function Cobranca() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [modalAssinar, setModalAssinar] = useState(false);

  const resumo = useQuery({ queryKey: ["billing", "summary"], queryFn: fetchBillingSummary });
  const assinaturas = useQuery({ queryKey: ["subscriptions"], queryFn: fetchSubscriptions });
  const faturas = useQuery({ queryKey: ["invoices"], queryFn: fetchInvoices });

  const recarregar = () => {
    void queryClient.invalidateQueries({ queryKey: ["billing"] });
    void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };

  const r = resumo.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CircleDollarSign className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Cobrança</h2>
            <p className="text-sm text-muted-foreground">
              Assinaturas, faturas e receita recorrente
            </p>
          </div>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setModalAssinar(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Assinar cliente
          </button>
        )}
      </div>

      {/* Indicadores */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador
          rotulo="Receita recorrente"
          valor={brl(r?.mrr)}
          detalhe="por mês"
          destaque
        />
        <Indicador rotulo="Recebido no mês" valor={brl(r?.recebido_mes)} />
        <Indicador
          rotulo="A receber"
          valor={brl(r?.a_receber)}
          detalhe={r?.vencidas ? `${brl(r.vencidas)} vencido` : undefined}
          alerta={Boolean(r?.vencidas)}
        />
        <Indicador
          rotulo="Assinaturas"
          valor={String(r?.assinaturas_ativas ?? 0)}
          detalhe={
            [
              r?.em_carencia ? `${r.em_carencia} em carência` : null,
              r?.inadimplentes ? `${r.inadimplentes} em atraso` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "ativas"
          }
          alerta={Boolean(r?.inadimplentes)}
        />
      </section>

      {/* Assinaturas */}
      <section className="rounded-xl border border-border bg-card">
        <header className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Assinaturas
          </h3>
        </header>

        {assinaturas.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : !assinaturas.data?.length ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Nenhuma assinatura ainda. Assine um cliente para começar a faturar.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {assinaturas.data.map((a) => (
              <LinhaAssinatura
                key={a.id}
                assinatura={a}
                podeCancelar={isAdmin}
                aoCancelar={recarregar}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Faturas */}
      <section className="rounded-xl border border-border bg-card">
        <header className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Faturas
          </h3>
        </header>

        {faturas.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : !faturas.data?.length ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Nenhuma fatura ainda. Elas aparecem aqui conforme o provedor de pagamento
            as gera.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Cliente</th>
                  <th className="px-5 py-2 font-medium">Vencimento</th>
                  <th className="px-5 py-2 font-medium">Valor</th>
                  <th className="px-5 py-2 font-medium">Situação</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {faturas.data.map((f) => {
                  const s = STATUS_FATURA[f.status] ?? STATUS_FATURA.pending!;
                  return (
                    <tr key={f.id}>
                      <td className="px-5 py-3 text-foreground">{f.clients?.name ?? "—"}</td>
                      <td className="px-5 py-3 text-muted-foreground">{fmtData(f.due_date)}</td>
                      <td className="px-5 py-3 font-medium text-foreground">{brl(f.amount)}</td>
                      <td className="px-5 py-3">
                        <span className={cn("rounded px-2 py-0.5 text-[10px] font-medium uppercase", s.cor)}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {f.invoice_url && (
                          <a
                            href={f.invoice_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            Abrir <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ModalAssinar
        aberto={modalAssinar}
        aoFechar={() => setModalAssinar(false)}
        aoCriar={recarregar}
      />
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  detalhe,
  destaque,
  alerta,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  destaque?: boolean;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{rotulo}</div>
      <div className={cn("mt-1 text-2xl font-bold", destaque ? "text-primary" : "text-foreground")}>
        {valor}
      </div>
      {detalhe && (
        <div className={cn("mt-0.5 text-xs", alerta ? "text-red-600" : "text-muted-foreground")}>
          {detalhe}
        </div>
      )}
    </div>
  );
}

/** Linha da assinatura, com a prévia da parte variável do mês. */
function LinhaAssinatura({
  assinatura,
  podeCancelar,
  aoCancelar,
}: {
  assinatura: Subscription;
  podeCancelar: boolean;
  aoCancelar: () => void;
}) {
  const s = STATUS_ASSINATURA[assinatura.status] ?? STATUS_ASSINATURA.trialing!;

  const variavel = useQuery({
    queryKey: ["variable", assinatura.id],
    queryFn: () => fetchVariablePreview(assinatura.id),
    retry: false,
  });

  const cancelar = useMutation({
    mutationFn: () => cancelSubscription(assinatura.id),
    onSuccess: aoCancelar,
  });

  const v = variavel.data;

  return (
    <li className="flex flex-wrap items-center gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-foreground">
            {assinatura.clients?.name ?? "Cliente"}
          </span>
          <span className={cn("rounded px-2 py-0.5 text-[10px] font-medium uppercase", s.cor)}>
            {s.label}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {assinatura.plans?.name ?? "Sem plano"} · {brl(assinatura.amount)}{" "}
          {CICLO_LABEL[assinatura.cycle] ?? assinatura.cycle}
          {assinatura.next_due_date && ` · vence ${fmtData(assinatura.next_due_date)}`}
        </p>

        {/* Parte variável do mês corrente */}
        {v && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs">
            {v.em_carencia ? (
              <>
                <Hourglass className="h-3 w-3 shrink-0 text-amber-600" />
                <span className="text-amber-700">
                  Em maturação — o percentual passa a valer em {fmtData(v.carencia_ate)}
                </span>
              </>
            ) : (
              <>
                <TrendingUp className="h-3 w-3 shrink-0 text-primary" />
                <span className="text-muted-foreground">
                  {METRICA_LABEL[v.metric]}: {brl(v.metric_value)} · excedente{" "}
                  {brl(v.excedente)} ·{" "}
                  <strong className="text-foreground">variável {brl(v.amount)}</strong>
                </span>
              </>
            )}
          </p>
        )}
      </div>

      {podeCancelar && assinatura.status !== "cancelled" && (
        <button
          type="button"
          onClick={() => {
            if (confirm(`Cancelar a assinatura de ${assinatura.clients?.name}?`)) {
              cancelar.mutate();
            }
          }}
          disabled={cancelar.isPending}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-60"
        >
          {cancelar.isPending ? "Cancelando…" : "Cancelar"}
        </button>
      )}
    </li>
  );
}

function ModalAssinar({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [planId, setPlanId] = useState("");
  const [vencimento, setVencimento] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const clientes = useQuery({ queryKey: ["clients"], queryFn: fetchClients, enabled: aberto });
  const planos = useQuery({ queryKey: ["plans"], queryFn: fetchPlans, enabled: aberto });

  const planoEscolhido = planos.data?.find((p) => p.id === planId);
  const regra = planoEscolhido ? descreverVariavel(planoEscolhido) : null;

  const mutation = useMutation({
    mutationFn: createSubscription,
    onSuccess: () => {
      aoCriar();
      fechar();
    },
    onError: (err) =>
      setErro(err instanceof ApiError ? err.message : "Não foi possível criar a assinatura"),
  });

  function fechar() {
    setClientId("");
    setPlanId("");
    setCpfCnpj("");
    setEmail("");
    setErro(null);
    aoFechar();
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    mutation.mutate({
      client_id: clientId,
      plan_id: planId,
      next_due_date: vencimento,
      cpf_cnpj: cpfCnpj || undefined,
      email: email || undefined,
    });
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      titulo="Assinar cliente"
      descricao="O cliente recebe um link de pagamento; nenhum dado de cartão passa por aqui."
    >
      <form onSubmit={enviar} className="space-y-4">
        <Campo label="Cliente">
          <select
            className={inputClasses}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
          >
            <option value="">Selecione…</option>
            {clientes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Campo>

        <Campo label="Plano">
          <select
            className={inputClasses}
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            required
          >
            <option value="">Selecione…</option>
            {planos.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {brl(p.amount)}
              </option>
            ))}
          </select>
        </Campo>

        {regra && (
          <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground/80">
            Além do fixo: <strong className="text-primary">{regra}</strong>.
          </p>
        )}

        <Campo label="Primeiro vencimento">
          <input
            type="date"
            className={inputClasses}
            value={vencimento}
            onChange={(e) => setVencimento(e.target.value)}
            required
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="CPF ou CNPJ" dica="Exigido pelo provedor de pagamento.">
            <input
              className={inputClasses}
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(e.target.value)}
              placeholder="000.000.000-00"
            />
          </Campo>
          <Campo label="E-mail do financeiro">
            <input
              type="email"
              className={inputClasses}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="financeiro@empresa.com.br"
            />
          </Campo>
        </div>

        {erro && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={fechar}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar assinatura
          </button>
        </div>
      </form>
    </Modal>
  );
}

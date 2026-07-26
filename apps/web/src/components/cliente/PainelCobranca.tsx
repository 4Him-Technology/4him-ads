import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, ExternalLink, Hourglass, Loader2, Pencil, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Campo, inputClasses } from "@/components/Modal";
import {
  ApiError,
  fetchVariablePreview,
  updateSubscription,
  type Client,
  type ClientSubscription,
  type FaturaResumo,
} from "@/lib/api";
import {
  CICLO_LABEL,
  METRICA_LABEL,
  STATUS_ASSINATURA,
  STATUS_FATURA,
  brl,
  data as fmtData,
} from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/** Tudo sobre o dinheiro deste cliente — e editável sem sair daqui. */
export default function PainelCobranca({
  cliente,
  contrato,
  faturas,
  aoAtualizar,
}: {
  cliente: Client;
  contrato: ClientSubscription | null;
  faturas: FaturaResumo[];
  aoAtualizar: () => void;
}) {
  const { isAdmin } = useAuth();
  const [editando, setEditando] = useState(false);

  const variavel = useQuery({
    queryKey: ["variable", contrato?.id],
    queryFn: () => fetchVariablePreview(contrato!.id),
    enabled: Boolean(contrato),
    retry: false,
  });

  if (!contrato) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
        <h4 className="font-semibold text-foreground">Sem contrato ativo</h4>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {cliente.name} está cadastrado, mas ainda não tem cobrança. Assine pela tela de
          Cobrança.
        </p>
      </div>
    );
  }

  const status = STATUS_ASSINATURA[contrato.status];
  const v = variavel.data;

  return (
    <div className="space-y-5">
      {/* Contrato */}
      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Contrato
          </h3>
          <div className="flex items-center gap-2">
            {status && (
              <span className={cn("rounded px-2 py-0.5 text-[10px] font-medium uppercase", status.cor)}>
                {status.label}
              </span>
            )}
            {isAdmin && !editando && (
              <button
                type="button"
                onClick={() => setEditando(true)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Pencil className="h-3 w-3" />
                Renegociar
              </button>
            )}
          </div>
        </header>

        <div className="px-5 py-4">
          {editando ? (
            <FormularioRenegociacao
              contrato={contrato}
              aoCancelar={() => setEditando(false)}
              aoSalvar={() => {
                setEditando(false);
                aoAtualizar();
                void variavel.refetch();
              }}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Dado rotulo="Mensalidade" valor={`${brl(contrato.amount)}`} sub={CICLO_LABEL[contrato.cycle]} destaque />
              <Dado rotulo="Implantação" valor={contrato.setup_fee ? brl(contrato.setup_fee) : "—"} />
              <Dado rotulo="Início" valor={fmtData(contrato.started_at)} />
              <Dado rotulo="Próximo vencimento" valor={fmtData(contrato.next_due_date)} />
            </div>
          )}
        </div>
      </section>

      {/* Parte variável */}
      {contrato.variable_pct ? (
        <section className="rounded-xl border border-border bg-card px-5 py-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Parte variável no período
          </h3>

          {v?.em_carencia ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-800">
                Em maturação — o percentual de {contrato.variable_pct}% passa a valer em{" "}
                <strong>{fmtData(v.carencia_ate)}</strong>. Até lá o cliente paga apenas o fixo.
              </p>
            </div>
          ) : v ? (
            <div className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-4">
                <Dado rotulo={METRICA_LABEL[v.metric] ?? v.metric} valor={brl(v.metric_value)} />
                <Dado rotulo="Limite" valor={brl(v.threshold)} />
                <Dado rotulo="Excedente" valor={brl(v.excedente)} />
                <Dado rotulo={`Variável (${v.pct}%)`} valor={brl(v.amount)} destaque />
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                Prévia — a fatura só é gerada após conferência da equipe.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem apuração para este período.</p>
          )}
        </section>
      ) : null}

      {/* Faturas */}
      <section className="rounded-xl border border-border bg-card">
        <header className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Faturas
          </h3>
        </header>

        {faturas.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Nenhuma fatura ainda.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {faturas.map((f) => {
                const s = STATUS_FATURA[f.status] ?? STATUS_FATURA.pending!;
                return (
                  <tr key={f.id}>
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
        )}
      </section>
    </div>
  );
}

function Dado({
  rotulo,
  valor,
  sub,
  destaque,
}: {
  rotulo: string;
  valor: string;
  sub?: string;
  destaque?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{rotulo}</div>
      <div className={cn("mt-0.5 text-lg font-bold", destaque ? "text-primary" : "text-foreground")}>
        {valor}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function FormularioRenegociacao({
  contrato,
  aoCancelar,
  aoSalvar,
}: {
  contrato: ClientSubscription;
  aoCancelar: () => void;
  aoSalvar: () => void;
}) {
  const [amount, setAmount] = useState(String(contrato.amount));
  const [setupFee, setSetupFee] = useState(contrato.setup_fee ? String(contrato.setup_fee) : "");
  const [pct, setPct] = useState(contrato.variable_pct != null ? String(contrato.variable_pct) : "");
  const [limite, setLimite] = useState(
    contrato.variable_threshold != null ? String(contrato.variable_threshold) : "",
  );
  const [carencia, setCarencia] = useState(
    contrato.variable_grace_months != null ? String(contrato.variable_grace_months) : "",
  );
  const [notas, setNotas] = useState(contrato.notes ?? "");
  const [erro, setErro] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      updateSubscription(contrato.id, {
        amount: Number(amount),
        setup_fee: setupFee ? Number(setupFee) : null,
        variable_pct: pct ? Number(pct) : null,
        variable_threshold: limite ? Number(limite) : null,
        variable_grace_months: carencia ? Number(carencia) : null,
        notes: notas.trim() || null,
      }),
    onSuccess: aoSalvar,
    onError: (err) => setErro(err instanceof ApiError ? err.message : "Não foi possível salvar"),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    mutation.mutate();
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Campo label="Mensalidade (R$)">
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputClasses}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </Campo>
        <Campo label="Implantação (R$)">
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputClasses}
            value={setupFee}
            onChange={(e) => setSetupFee(e.target.value)}
            placeholder="sem"
          />
        </Campo>
        <Campo label="Percentual (%)">
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            className={inputClasses}
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            placeholder="0"
          />
        </Campo>
        <Campo label="Acima de (R$)">
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputClasses}
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
          />
        </Campo>
        <Campo label="Carência (meses)">
          <input
            type="number"
            min="0"
            max="24"
            className={inputClasses}
            value={carencia}
            onChange={(e) => setCarencia(e.target.value)}
          />
        </Campo>
      </div>

      <Campo label="Anotações do contrato">
        <textarea
          className={`${inputClasses} min-h-[56px]`}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Motivo do desconto, condição especial…"
        />
      </Campo>

      {erro && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {erro}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={aoCancelar}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {mutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Salvar
        </button>
      </div>
    </form>
  );
}

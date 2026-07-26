import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Hourglass, Loader2, Plus, Tags, TrendingUp } from "lucide-react";
import Modal, { Campo, inputClasses } from "@/components/Modal";
import { ApiError, createPlan, fetchPlans, type BillingMetric, type Plan } from "@/lib/api";
import { CICLO_LABEL, METRICA_LABEL, brl, descreverVariavel } from "@/lib/format";
import { useAuth } from "@/lib/auth";

export default function Planos() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(false);

  const { data: planos, isLoading } = useQuery({ queryKey: ["plans"], queryFn: fetchPlans });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Tags className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Planos</h2>
            <p className="text-sm text-muted-foreground">O que a 4Him vende e por quanto</p>
          </div>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setModal(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Novo plano
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !planos?.length ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Tags className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <h3 className="mt-3 font-semibold text-foreground">Nenhum plano cadastrado</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Crie o primeiro plano para poder assinar clientes.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {planos.map((p) => (
            <CardPlano key={p.id} plano={p} />
          ))}
        </div>
      )}

      <ModalNovoPlano
        aberto={modal}
        aoFechar={() => setModal(false)}
        aoCriar={() => void queryClient.invalidateQueries({ queryKey: ["plans"] })}
      />
    </div>
  );
}

function CardPlano({ plano }: { plano: Plan }) {
  const regra = descreverVariavel(plano);
  const features = Array.isArray(plano.features) ? plano.features : [];

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5">
      <h3 className="font-semibold text-foreground">{plano.name}</h3>
      {plano.description && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{plano.description}</p>
      )}

      <div className="mt-4">
        <span className="text-2xl font-bold text-primary">{brl(plano.amount)}</span>
        <span className="ml-1 text-xs text-muted-foreground">
          / {CICLO_LABEL[plano.cycle] ?? plano.cycle}
        </span>
      </div>

      {regra && (
        <div className="mt-3 space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <p className="flex items-start gap-1.5 text-xs text-foreground/80">
            <TrendingUp className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
            {plano.variable_pct}% sobre {METRICA_LABEL[plano.variable_metric ?? ""] ?? ""} acima de{" "}
            {brl(plano.variable_threshold)}
          </p>
          {plano.variable_grace_months > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Hourglass className="mt-0.5 h-3 w-3 shrink-0" />
              Só a partir do {plano.variable_grace_months}º mês (maturação)
            </p>
          )}
        </div>
      )}

      {features.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-xs text-foreground/80">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModalNovoPlano({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("1200");
  const [temVariavel, setTemVariavel] = useState(true);
  const [metrica, setMetrica] = useState<BillingMetric>("ad_spend");
  const [pct, setPct] = useState("10");
  const [limite, setLimite] = useState("5000");
  const [erro, setErro] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createPlan,
    onSuccess: () => {
      aoCriar();
      fechar();
    },
    onError: (err) =>
      setErro(err instanceof ApiError ? err.message : "Não foi possível criar o plano"),
  });

  function fechar() {
    setNome("");
    setDescricao("");
    setErro(null);
    aoFechar();
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    mutation.mutate({
      name: nome.trim(),
      description: descricao.trim() || undefined,
      amount: Number(valor),
      cycle: "monthly",
      ...(temVariavel
        ? {
            variable_metric: metrica,
            variable_pct: Number(pct),
            variable_threshold: Number(limite),
          }
        : {}),
    });
  }

  return (
    <Modal aberto={aberto} aoFechar={fechar} titulo="Novo plano">
      <form onSubmit={enviar} className="space-y-4">
        <Campo label="Nome">
          <input
            className={inputClasses}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Essencial"
            required
            minLength={2}
            autoFocus
          />
        </Campo>

        <Campo label="Descrição">
          <input
            className={inputClasses}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Gestão de tráfego pago com painel e portal"
          />
        </Campo>

        <Campo label="Mensalidade (R$)">
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputClasses}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
          />
        </Campo>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={temVariavel}
            onChange={(e) => setTemVariavel(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Cobrar percentual quando o cliente atingir uma meta
        </label>

        {temVariavel && (
          <div className="space-y-4 rounded-lg border border-border bg-background p-3">
            <Campo label="Meta baseada em">
              <select
                className={inputClasses}
                value={metrica}
                onChange={(e) => setMetrica(e.target.value as BillingMetric)}
              >
                <option value="ad_spend">Verba investida (mensurável hoje)</option>
                <option value="revenue">Receita gerada (exige integração com CRM)</option>
                <option value="conversions">Conversões</option>
                <option value="leads">Leads</option>
              </select>
            </Campo>

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Percentual (%)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  className={inputClasses}
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
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
            </div>

            <p className="text-xs text-muted-foreground">
              A carência padrão é de 3 meses: o percentual só passa a valer depois desse
              período de maturação do tráfego.
            </p>
          </div>
        )}

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
            Criar plano
          </button>
        </div>
      </form>
    </Modal>
  );
}

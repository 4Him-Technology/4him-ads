import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Building2, Check, Loader2, Pencil, Sparkles, X } from "lucide-react";
import { Campo, inputClasses } from "@/components/Modal";
import { ApiError, updateSubscription, type Client, type ClientSubscription } from "@/lib/api";
import { CICLO_LABEL, METRICA_LABEL, STATUS_ASSINATURA, brl, data as fmtData } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const MODELO_CONTA = {
  agency_owned: "Conta criada pela 4Him",
  client_owned: "Conta própria do cliente",
} as const;

const SAUDE_PAGAMENTO = {
  ok: "Válida",
  missing: "Não cadastrada",
  failing: "Com problema",
  unknown: "Ainda não verificada",
} as const;

/**
 * Painel lateral com tudo de um cliente — gestão isolada.
 * As condições comerciais são editáveis aqui: renegociar é rotina, e
 * alterar aqui não afeta o plano nem nenhum outro cliente.
 */
export default function DetalheCliente({
  cliente,
  aoFechar,
  aoAtualizar,
}: {
  cliente: Client | null;
  aoFechar: () => void;
  aoAtualizar: () => void;
}) {
  const { isAdmin } = useAuth();
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (!cliente) return;
    setEditando(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cliente, aoFechar]);

  if (!cliente) return null;

  const contrato = cliente.subscriptions?.find((s) => s.status !== "cancelled") ?? null;
  const statusContrato = contrato ? STATUS_ASSINATURA[contrato.status] : null;
  const temBriefing = Boolean(cliente.business_description || cliente.target_audience);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={aoFechar} aria-hidden />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes de ${cliente.name}`}
        className="relative z-10 flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-card"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-foreground">{cliente.name}</h3>
              <p className="truncate text-xs text-muted-foreground">{cliente.slug}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-6 px-5 py-5">
          <Secao titulo="Cadastro">
            <Linha rotulo="CPF / CNPJ" valor={cliente.document} />
            <Linha rotulo="Contato" valor={cliente.contact_name} />
            <Linha rotulo="E-mail" valor={cliente.contact_email} />
            <Linha rotulo="Telefone" valor={cliente.contact_phone} />
            <Linha rotulo="Segmento" valor={cliente.segment} />
            <Linha rotulo="Moeda / fuso" valor={`${cliente.currency} · ${cliente.timezone}`} />
          </Secao>

          <Secao titulo="Conta de anúncios">
            <Linha rotulo="Modelo" valor={MODELO_CONTA[cliente.ad_account_model]} />
            <Linha rotulo="Business Manager" valor={cliente.meta_business_id} />
            <Linha
              rotulo="Forma de pagamento"
              valor={SAUDE_PAGAMENTO[cliente.billing_health]}
              alerta={cliente.billing_health === "missing" || cliente.billing_health === "failing"}
            />
          </Secao>

          {/* Contrato */}
          <section>
            <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Condições comerciais
              </h4>
              {contrato && isAdmin && !editando && (
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

            {!contrato ? (
              <p className="py-3 text-sm text-muted-foreground">
                Sem contrato. Assine este cliente pela tela de Cobrança.
              </p>
            ) : editando ? (
              <FormularioRenegociacao
                contrato={contrato}
                aoCancelar={() => setEditando(false)}
                aoSalvar={() => {
                  setEditando(false);
                  aoAtualizar();
                }}
              />
            ) : (
              <dl className="space-y-2 pt-1">
                <Linha rotulo="Plano de referência" valor={contrato.plans?.name} />
                <Linha
                  rotulo="Mensalidade"
                  valor={`${brl(contrato.amount)} ${CICLO_LABEL[contrato.cycle] ?? ""}`}
                  destaque
                />
                {contrato.setup_fee ? (
                  <Linha rotulo="Implantação" valor={brl(contrato.setup_fee)} />
                ) : null}
                <Linha rotulo="Situação" valor={statusContrato?.label ?? contrato.status} />
                <Linha rotulo="Início" valor={fmtData(contrato.started_at)} />
                <Linha rotulo="Próximo vencimento" valor={fmtData(contrato.next_due_date)} />
                <Linha
                  rotulo="Parte variável"
                  valor={
                    contrato.variable_pct
                      ? `${contrato.variable_pct}% sobre ${
                          METRICA_LABEL[contrato.variable_metric ?? ""] ?? "—"
                        } acima de ${brl(contrato.variable_threshold)}${
                          contrato.variable_grace_months
                            ? ` · a partir do ${contrato.variable_grace_months}º mês`
                            : ""
                        }`
                      : "Somente valor fixo"
                  }
                />
                {contrato.notes && <Linha rotulo="Anotações" valor={contrato.notes} />}
              </dl>
            )}
          </section>

          {/* Briefing — contexto que alimenta a IA */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 border-b border-border pb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Briefing
            </h4>

            {!temBriefing ? (
              <p className="py-3 text-sm text-muted-foreground">
                Sem briefing preenchido. Sem ele, as sugestões de palavras-chave e criativos
                saem genéricas.
              </p>
            ) : (
              <dl className="space-y-2 pt-1">
                <Linha rotulo="O que faz" valor={cliente.business_description} />
                <Linha rotulo="Público-alvo" valor={cliente.target_audience} />
                <Linha rotulo="Diferenciais" valor={cliente.value_proposition} />
                <Linha rotulo="Produtos" valor={cliente.main_products} />
                <Linha rotulo="Região" valor={cliente.service_area} />
                <Linha rotulo="Ticket médio" valor={cliente.avg_ticket ? brl(cliente.avg_ticket) : null} />
                <Linha rotulo="Objetivo" valor={cliente.campaign_goal} />
                <Linha rotulo="Termos-semente" valor={cliente.seed_keywords?.join(", ")} />
                <Linha rotulo="Restrições" valor={cliente.restrictions} alerta={Boolean(cliente.restrictions)} />
                <Linha rotulo="Site" valor={cliente.website} />
              </dl>
            )}
          </section>

          {cliente.notes && (
            <Secao titulo="Observações">
              <p className="text-sm leading-relaxed text-foreground/80">{cliente.notes}</p>
            </Secao>
          )}
        </div>
      </aside>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 border-b border-border pb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </h4>
      <dl className="space-y-2 pt-1">{children}</dl>
    </section>
  );
}

function Linha({
  rotulo,
  valor,
  destaque,
  alerta,
}: {
  rotulo: string;
  valor: string | null | undefined;
  destaque?: boolean;
  alerta?: boolean;
}) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-36 shrink-0 text-muted-foreground">{rotulo}</dt>
      <dd
        className={cn(
          "min-w-0 flex-1 break-words",
          destaque ? "font-semibold text-primary" : alerta ? "text-amber-700" : "text-foreground",
        )}
      >
        {valor || "—"}
      </dd>
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
    <form onSubmit={enviar} className="space-y-3 pt-2">
      <div className="grid grid-cols-2 gap-3">
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
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Campo label="%">
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
        <Campo label="Acima de">
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputClasses}
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
          />
        </Campo>
        <Campo label="Carência">
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

      <Campo label="Anotações">
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
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {mutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Salvar
        </button>
      </div>
    </form>
  );
}

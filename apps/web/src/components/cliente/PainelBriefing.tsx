import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Sparkles } from "lucide-react";
import { Campo, inputClasses } from "@/components/Modal";
import { ApiError, updateBriefing, type Client } from "@/lib/api";
import { brl } from "@/lib/format";
import { useAuth } from "@/lib/auth";

const OBJETIVOS = [
  { valor: "vendas", rotulo: "Vendas" },
  { valor: "leads", rotulo: "Gerar leads" },
  { valor: "agendamento", rotulo: "Agendamentos" },
  { valor: "visita_loja", rotulo: "Visitas à loja" },
  { valor: "reconhecimento", rotulo: "Reconhecimento de marca" },
];

/**
 * Briefing do cliente — o contexto que a IA usa.
 * Editável aqui porque o entendimento do negócio amadurece com o tempo:
 * o briefing do mês 6 é sempre melhor que o do dia 1.
 */
export default function PainelBriefing({
  cliente,
  aoAtualizar,
}: {
  cliente: Client;
  aoAtualizar: () => void;
}) {
  const { isStaff } = useAuth();
  const [editando, setEditando] = useState(false);

  const preenchidos = [
    cliente.business_description,
    cliente.target_audience,
    cliente.value_proposition,
    cliente.main_products,
    cliente.service_area,
    cliente.campaign_goal,
  ].filter(Boolean).length;

  const completude = Math.round((preenchidos / 6) * 100);

  if (editando) {
    return (
      <Formulario
        cliente={cliente}
        aoCancelar={() => setEditando(false)}
        aoSalvar={() => {
          setEditando(false);
          aoAtualizar();
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm text-foreground/80">
              Este é o contexto que a IA usa para sugerir palavras-chave, públicos e ângulos de
              criativo.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {completude === 100
                ? "Briefing completo — sugestões terão o melhor contexto possível."
                : `${completude}% preenchido. Quanto mais específico, menos genérica a sugestão.`}
            </p>
          </div>
        </div>
        {isStaff && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Pencil className="h-3 w-3" />
            Editar
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco titulo="O que a empresa faz" texto={cliente.business_description} />
        <Bloco titulo="Público-alvo" texto={cliente.target_audience} />
        <Bloco titulo="Diferenciais" texto={cliente.value_proposition} />
        <Bloco titulo="Produtos e serviços" texto={cliente.main_products} />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Item rotulo="Região atendida" valor={cliente.service_area} />
          <Item rotulo="Ticket médio" valor={cliente.avg_ticket ? brl(cliente.avg_ticket) : null} />
          <Item
            rotulo="Objetivo"
            valor={OBJETIVOS.find((o) => o.valor === cliente.campaign_goal)?.rotulo}
          />
          <Item rotulo="Concorrentes" valor={cliente.competitors?.join(", ")} />
          <Item rotulo="Termos-semente" valor={cliente.seed_keywords?.join(", ")} />
          <Item rotulo="Site" valor={cliente.website} />
        </dl>

        {cliente.restrictions && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              Restrições
            </p>
            <p className="mt-0.5 text-sm text-amber-800">{cliente.restrictions}</p>
            <p className="mt-1 text-xs text-amber-700/70">
              Entra no prompt como limite — evita sugestão que reprova no Meta.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Bloco({ titulo, texto }: { titulo: string; texto: string | null }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </h4>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">
        {texto || <span className="text-muted-foreground">Não preenchido</span>}
      </p>
    </div>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{valor || "—"}</dd>
    </div>
  );
}

function listaDeTexto(texto: string): string[] | undefined {
  const itens = texto.split(",").map((t) => t.trim()).filter(Boolean);
  return itens.length ? itens : undefined;
}

function Formulario({
  cliente,
  aoCancelar,
  aoSalvar,
}: {
  cliente: Client;
  aoCancelar: () => void;
  aoSalvar: () => void;
}) {
  const [descricao, setDescricao] = useState(cliente.business_description ?? "");
  const [publico, setPublico] = useState(cliente.target_audience ?? "");
  const [diferenciais, setDiferenciais] = useState(cliente.value_proposition ?? "");
  const [produtos, setProdutos] = useState(cliente.main_products ?? "");
  const [regiao, setRegiao] = useState(cliente.service_area ?? "");
  const [ticket, setTicket] = useState(cliente.avg_ticket ? String(cliente.avg_ticket) : "");
  const [objetivo, setObjetivo] = useState(cliente.campaign_goal ?? "");
  const [concorrentes, setConcorrentes] = useState(cliente.competitors?.join(", ") ?? "");
  const [termos, setTermos] = useState(cliente.seed_keywords?.join(", ") ?? "");
  const [restricoes, setRestricoes] = useState(cliente.restrictions ?? "");
  const [site, setSite] = useState(cliente.website ?? "");
  const [erro, setErro] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      updateBriefing(cliente.id, {
        business_description: descricao.trim() || undefined,
        target_audience: publico.trim() || undefined,
        value_proposition: diferenciais.trim() || undefined,
        main_products: produtos.trim() || undefined,
        service_area: regiao.trim() || undefined,
        avg_ticket: ticket ? Number(ticket) : undefined,
        campaign_goal: objetivo || undefined,
        competitors: listaDeTexto(concorrentes),
        seed_keywords: listaDeTexto(termos),
        restrictions: restricoes.trim() || undefined,
        website: site.trim() || undefined,
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
    <form onSubmit={enviar} className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <Campo label="O que a empresa faz">
          <textarea
            className={`${inputClasses} min-h-[80px]`}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            autoFocus
          />
        </Campo>
        <Campo label="Público-alvo">
          <textarea
            className={`${inputClasses} min-h-[80px]`}
            value={publico}
            onChange={(e) => setPublico(e.target.value)}
          />
        </Campo>
        <Campo label="Diferenciais">
          <textarea
            className={`${inputClasses} min-h-[72px]`}
            value={diferenciais}
            onChange={(e) => setDiferenciais(e.target.value)}
          />
        </Campo>
        <Campo label="Produtos e serviços">
          <textarea
            className={`${inputClasses} min-h-[72px]`}
            value={produtos}
            onChange={(e) => setProdutos(e.target.value)}
          />
        </Campo>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo label="Região atendida">
          <input className={inputClasses} value={regiao} onChange={(e) => setRegiao(e.target.value)} />
        </Campo>
        <Campo label="Ticket médio (R$)">
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputClasses}
            value={ticket}
            onChange={(e) => setTicket(e.target.value)}
          />
        </Campo>
        <Campo label="Objetivo">
          <select
            className={inputClasses}
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
          >
            <option value="">Selecione…</option>
            {OBJETIVOS.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo label="Concorrentes" dica="Separe por vírgula.">
          <input
            className={inputClasses}
            value={concorrentes}
            onChange={(e) => setConcorrentes(e.target.value)}
          />
        </Campo>
        <Campo label="Termos-semente" dica="Separe por vírgula.">
          <input className={inputClasses} value={termos} onChange={(e) => setTermos(e.target.value)} />
        </Campo>
        <Campo label="Site ou rede social">
          <input className={inputClasses} value={site} onChange={(e) => setSite(e.target.value)} />
        </Campo>
      </div>

      <Campo label="Restrições" dica="O que não pode ser dito. Vira limite no prompt da IA.">
        <input
          className={inputClasses}
          value={restricoes}
          onChange={(e) => setRestricoes(e.target.value)}
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
          Salvar briefing
        </button>
      </div>
    </form>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, CircleDollarSign, Loader2, Sparkles } from "lucide-react";
import Modal, { Campo, inputClasses } from "@/components/Modal";
import {
  ApiError,
  createClientFull,
  fetchPlans,
  type BillingMetric,
  type CadastroCompletoResultado,
} from "@/lib/api";
import { brl } from "@/lib/format";

/** "Padaria do Zé" → "padaria-do-ze" */
function slugify(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function emUmaSemana() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

/** "padaria, confeitaria , doces" → ["padaria","confeitaria","doces"] */
function listaDeTexto(texto: string): string[] | undefined {
  const itens = texto
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return itens.length ? itens : undefined;
}

/**
 * Cadastro do cliente em duas colunas: dados à esquerda, condições
 * comerciais à direita.
 *
 * O plano apenas SUGERE os valores — tudo é editável, porque negociar é
 * a regra. O que ficar aqui é gravado na assinatura daquele cliente, sem
 * alterar o plano nem exigir criar um plano novo a cada negociação.
 */
export default function CadastroCliente({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  // --- coluna esquerda: cliente ---
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditado, setSlugEditado] = useState(false);
  const [documento, setDocumento] = useState("");
  const [contato, setContato] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [segmento, setSegmento] = useState("");
  const [modeloConta, setModeloConta] = useState<"agency_owned" | "client_owned">("agency_owned");
  const [observacoes, setObservacoes] = useState("");

  // --- briefing: contexto que a IA usa para sugerir palavras-chave e criativos ---
  const [descricao, setDescricao] = useState("");
  const [publico, setPublico] = useState("");
  const [diferenciais, setDiferenciais] = useState("");
  const [produtos, setProdutos] = useState("");
  const [regiao, setRegiao] = useState("");
  const [ticket, setTicket] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [concorrentes, setConcorrentes] = useState("");
  const [termos, setTermos] = useState("");
  const [restricoes, setRestricoes] = useState("");
  const [site, setSite] = useState("");

  // --- coluna direita: contrato ---
  const [comContrato, setComContrato] = useState(true);
  const [planoId, setPlanoId] = useState("");
  const [mensalidade, setMensalidade] = useState("");
  const [implantacao, setImplantacao] = useState("");
  const [vencimento, setVencimento] = useState(emUmaSemana);
  const [comVariavel, setComVariavel] = useState(true);
  const [metrica, setMetrica] = useState<BillingMetric>("ad_spend");
  const [pct, setPct] = useState("");
  const [limite, setLimite] = useState("");
  const [carencia, setCarencia] = useState("");
  const [notasContrato, setNotasContrato] = useState("");

  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CadastroCompletoResultado | null>(null);

  const planos = useQuery({ queryKey: ["plans"], queryFn: fetchPlans, enabled: aberto });
  const plano = planos.data?.find((p) => p.id === planoId);

  // Ao escolher o plano, preenche os campos como SUGESTÃO — e o usuário
  // ajusta o que foi negociado.
  useEffect(() => {
    if (!plano) return;
    setMensalidade(String(plano.amount));
    setComVariavel(Boolean(plano.variable_pct));
    if (plano.variable_metric) setMetrica(plano.variable_metric);
    setPct(plano.variable_pct != null ? String(plano.variable_pct) : "");
    setLimite(plano.variable_threshold != null ? String(plano.variable_threshold) : "");
    setCarencia(String(plano.variable_grace_months ?? 3));
  }, [plano]);

  const mutation = useMutation({
    mutationFn: createClientFull,
    onSuccess: (r) => {
      setResultado(r);
      aoCriar();
    },
    onError: (err) =>
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o cadastro"),
  });

  function fechar() {
    setNome("");
    setSlug("");
    setSlugEditado(false);
    setDocumento("");
    setContato("");
    setEmail("");
    setTelefone("");
    setSegmento("");
    setObservacoes("");
    setPlanoId("");
    setMensalidade("");
    setImplantacao("");
    setNotasContrato("");
    setErro(null);
    setResultado(null);
    aoFechar();
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    mutation.mutate({
      cliente: {
        name: nome.trim(),
        slug: slug.trim(),
        document: documento.trim() || undefined,
        contact_name: contato.trim() || undefined,
        contact_email: email.trim() || undefined,
        contact_phone: telefone.trim() || undefined,
        segment: segmento.trim() || undefined,
        notes: observacoes.trim() || undefined,
        ad_account_model: modeloConta,
        business_description: descricao.trim() || undefined,
        target_audience: publico.trim() || undefined,
        value_proposition: diferenciais.trim() || undefined,
        main_products: produtos.trim() || undefined,
        service_area: regiao.trim() || undefined,
        avg_ticket: ticket ? Number(ticket) : undefined,
        campaign_goal: objetivo.trim() || undefined,
        competitors: listaDeTexto(concorrentes),
        seed_keywords: listaDeTexto(termos),
        restrictions: restricoes.trim() || undefined,
        website: site.trim() || undefined,
      },
      contrato:
        comContrato && planoId
          ? {
              plan_id: planoId,
              amount: Number(mensalidade) || 0,
              setup_fee: implantacao ? Number(implantacao) : undefined,
              next_due_date: vencimento,
              cycle: "monthly",
              ...(comVariavel
                ? {
                    variable_metric: metrica,
                    variable_pct: Number(pct) || 0,
                    variable_threshold: Number(limite) || 0,
                    variable_grace_months: Number(carencia) || 0,
                  }
                : { variable_pct: 0 }),
              notes: notasContrato.trim() || undefined,
            }
          : undefined,
    });
  }

  if (resultado) {
    return (
      <Modal aberto={aberto} aoFechar={fechar} titulo="Cliente cadastrado">
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            <strong>{resultado.cliente.name}</strong> foi cadastrado
            {resultado.contrato ? " com o contrato ativo." : "."}
          </p>

          {resultado.aviso && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
              {resultado.aviso}
            </p>
          )}

          {resultado.contrato && (
            <dl className="space-y-1 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Mensalidade</dt>
                <dd className="font-medium">{brl(resultado.contrato.amount)}</dd>
              </div>
              {resultado.contrato.setup_fee ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Implantação</dt>
                  <dd className="font-medium">{brl(resultado.contrato.setup_fee)}</dd>
                </div>
              ) : null}
            </dl>
          )}

          <button
            type="button"
            onClick={fechar}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Concluir
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      largo
      titulo="Novo cliente"
      descricao="Os valores do plano são apenas sugestão — ajuste conforme o que foi negociado."
    >
      <form onSubmit={enviar}>
        <div className="grid gap-6 md:grid-cols-2">
          {/* ---------- Coluna: dados do cliente ---------- */}
          <section className="space-y-4">
            <h4 className="flex items-center gap-2 border-b border-border pb-2 text-sm font-semibold text-foreground">
              <Building2 className="h-4 w-4 text-primary" />
              Dados do cliente
            </h4>

            <Campo label="Nome ou razão social">
              <input
                className={inputClasses}
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  if (!slugEditado) setSlug(slugify(e.target.value));
                }}
                placeholder="Padaria do Zé"
                required
                minLength={2}
                autoFocus
              />
            </Campo>

            <Campo label="Identificador" dica="Usado em endereços e relatórios.">
              <input
                className={inputClasses}
                value={slug}
                onChange={(e) => {
                  setSlugEditado(true);
                  setSlug(slugify(e.target.value));
                }}
                required
                minLength={2}
              />
            </Campo>

            <Campo label="CPF ou CNPJ" dica="Necessário para emitir a cobrança.">
              <input
                className={inputClasses}
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="00.000.000/0001-00"
              />
            </Campo>

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Contato">
                <input
                  className={inputClasses}
                  value={contato}
                  onChange={(e) => setContato(e.target.value)}
                  placeholder="José Silva"
                />
              </Campo>
              <Campo label="Telefone">
                <input
                  className={inputClasses}
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(11) 90000-0000"
                />
              </Campo>
            </div>

            <Campo label="E-mail" dica="Para onde vão as cobranças.">
              <input
                type="email"
                className={inputClasses}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="financeiro@empresa.com.br"
              />
            </Campo>

            <Campo label="Segmento" dica="Alimenta o radar de mercado no futuro.">
              <input
                className={inputClasses}
                value={segmento}
                onChange={(e) => setSegmento(e.target.value)}
                placeholder="Alimentação, moda, saúde…"
              />
            </Campo>

            <Campo label="Conta de anúncios">
              <select
                className={inputClasses}
                value={modeloConta}
                onChange={(e) => setModeloConta(e.target.value as typeof modeloConta)}
              >
                <option value="agency_owned">A 4Him cria a conta (cliente pequeno)</option>
                <option value="client_owned">O cliente já tem conta própria</option>
              </select>
            </Campo>

            <Campo label="Observações">
              <textarea
                className={`${inputClasses} min-h-[64px]`}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Contexto do negócio, particularidades…"
              />
            </Campo>
          </section>

          {/* ---------- Coluna: condições comerciais ---------- */}
          <section className="space-y-4">
            <h4 className="flex items-center gap-2 border-b border-border pb-2 text-sm font-semibold text-foreground">
              <CircleDollarSign className="h-4 w-4 text-primary" />
              Condições comerciais
            </h4>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={comContrato}
                onChange={(e) => setComContrato(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Já fechar contrato agora
            </label>

            {!comContrato ? (
              <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                O cliente será cadastrado sem cobrança. Você pode assinar depois pela tela de
                Cobrança.
              </p>
            ) : (
              <>
                <Campo label="Plano de referência" dica="Preenche os campos abaixo como sugestão.">
                  <select
                    className={inputClasses}
                    value={planoId}
                    onChange={(e) => setPlanoId(e.target.value)}
                    required={comContrato}
                  >
                    <option value="">Selecione…</option>
                    {planos.data?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {brl(p.amount)}
                      </option>
                    ))}
                  </select>
                </Campo>

                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Mensalidade (R$)" dica="Valor negociado.">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={inputClasses}
                      value={mensalidade}
                      onChange={(e) => setMensalidade(e.target.value)}
                      required={comContrato}
                    />
                  </Campo>
                  <Campo label="Implantação (R$)" dica="Cobrança única. Vazio = sem.">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={inputClasses}
                      value={implantacao}
                      onChange={(e) => setImplantacao(e.target.value)}
                      placeholder="1500"
                    />
                  </Campo>
                </div>

                <Campo label="Primeiro vencimento">
                  <input
                    type="date"
                    className={inputClasses}
                    value={vencimento}
                    onChange={(e) => setVencimento(e.target.value)}
                    required={comContrato}
                  />
                </Campo>

                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={comVariavel}
                    onChange={(e) => setComVariavel(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  Cobrar percentual ao atingir meta
                </label>

                {comVariavel && (
                  <div className="space-y-3 rounded-lg border border-border bg-background p-3">
                    <Campo label="Meta baseada em">
                      <select
                        className={inputClasses}
                        value={metrica}
                        onChange={(e) => setMetrica(e.target.value as BillingMetric)}
                      >
                        <option value="ad_spend">Verba investida</option>
                        <option value="revenue">Receita gerada (exige CRM)</option>
                        <option value="conversions">Conversões</option>
                        <option value="leads">Leads</option>
                      </select>
                    </Campo>

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

                    <p className="text-xs text-muted-foreground">
                      Carência em meses: o percentual só passa a valer depois desse período de
                      maturação.
                    </p>
                  </div>
                )}

                <Campo label="Anotações do contrato">
                  <textarea
                    className={`${inputClasses} min-h-[64px]`}
                    value={notasContrato}
                    onChange={(e) => setNotasContrato(e.target.value)}
                    placeholder="Desconto concedido, condições especiais…"
                  />
                </Campo>
              </>
            )}
          </section>
        </div>

        {/* ---------- Briefing: contexto que alimenta a IA ---------- */}
        <section className="mt-6 border-t border-border pt-5">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Briefing do negócio
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            É o contexto que a IA usa para sugerir palavras-chave, públicos e ângulos de
            criativo. Quanto mais específico, menos genérica é a sugestão.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Campo label="O que a empresa faz" dica="Em uma ou duas frases, como você explicaria a um estranho.">
              <textarea
                className={`${inputClasses} min-h-[72px]`}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Padaria de bairro com produção artesanal, forte em pães de fermentação natural e encomendas de bolo para festas."
              />
            </Campo>

            <Campo label="Público-alvo" dica="Quem realmente compra.">
              <textarea
                className={`${inputClasses} min-h-[72px]`}
                value={publico}
                onChange={(e) => setPublico(e.target.value)}
                placeholder="Famílias do bairro, 30-55 anos, e escritórios da região que encomendam café da manhã."
              />
            </Campo>

            <Campo label="Diferenciais" dica="Por que compram dela e não do concorrente.">
              <textarea
                className={`${inputClasses} min-h-[64px]`}
                value={diferenciais}
                onChange={(e) => setDiferenciais(e.target.value)}
                placeholder="Fermentação natural de 24h, entrega em 40 minutos, receita da família há 30 anos."
              />
            </Campo>

            <Campo label="Principais produtos ou serviços">
              <textarea
                className={`${inputClasses} min-h-[64px]`}
                value={produtos}
                onChange={(e) => setProdutos(e.target.value)}
                placeholder="Pão de fermentação natural, bolos de festa, salgados para eventos."
              />
            </Campo>

            <Campo label="Região atendida" dica="Define o alcance geográfico das campanhas.">
              <input
                className={inputClasses}
                value={regiao}
                onChange={(e) => setRegiao(e.target.value)}
                placeholder="Raio de 5 km — Pinheiros e Vila Madalena, São Paulo"
              />
            </Campo>

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Ticket médio (R$)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClasses}
                  value={ticket}
                  onChange={(e) => setTicket(e.target.value)}
                  placeholder="85"
                />
              </Campo>
              <Campo label="Objetivo">
                <select
                  className={inputClasses}
                  value={objetivo}
                  onChange={(e) => setObjetivo(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  <option value="vendas">Vendas</option>
                  <option value="leads">Gerar leads</option>
                  <option value="agendamento">Agendamentos</option>
                  <option value="visita_loja">Visitas à loja</option>
                  <option value="reconhecimento">Reconhecimento de marca</option>
                </select>
              </Campo>
            </div>

            <Campo label="Concorrentes" dica="Separe por vírgula.">
              <input
                className={inputClasses}
                value={concorrentes}
                onChange={(e) => setConcorrentes(e.target.value)}
                placeholder="Padaria Central, Pão Nosso"
              />
            </Campo>

            <Campo label="Termos que já usam" dica="Sementes para expandir as palavras-chave.">
              <input
                className={inputClasses}
                value={termos}
                onChange={(e) => setTermos(e.target.value)}
                placeholder="pão artesanal, bolo de aniversário"
              />
            </Campo>

            <Campo label="Site ou rede social">
              <input
                className={inputClasses}
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="https://instagram.com/padariadoze"
              />
            </Campo>

            <Campo
              label="Restrições"
              dica="O que não pode ser dito. Vira limite no prompt da IA."
            >
              <input
                className={inputClasses}
                value={restricoes}
                onChange={(e) => setRestricoes(e.target.value)}
                placeholder="Não usar 'o melhor da cidade'; não prometer emagrecimento"
              />
            </Campo>
          </div>
        </section>

        {erro && (
          <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
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
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Cadastrar cliente
          </button>
        </div>
      </form>
    </Modal>
  );
}

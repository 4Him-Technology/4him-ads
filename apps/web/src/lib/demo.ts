import type {
  Client,
  Invoice,
  Plan,
  Subscription,
  UserContext,
  VisaoCliente,
  VisaoGerencial,
} from "./api";

/**
 * Dados de exemplo para a publicação no GitHub Pages.
 *
 * O Pages serve apenas arquivos estáticos — não há API nem banco. Este
 * modo existe só para navegar pelas telas e avaliar o visual.
 * Os números são fictícios e a interface exibe um selo avisando disso.
 *
 * Ativado por `vite build --mode pages`.
 */
export const MODO_DEMO = import.meta.env.MODE === "pages";

const hoje = new Date();
const emDias = (n: number) => {
  const d = new Date(hoje);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const demoUser: UserContext = {
  profile: {
    id: "demo-user",
    email: "admin@4him.com.br",
    full_name: "Administrador 4Him",
    avatar_url: null,
    is_agency_staff: true,
  },
  organizations: [
    { org_id: "demo-org", role: "owner", org_name: "4Him Technology", org_slug: "4him" },
  ],
  clients: [
    { id: "c1", name: "Padaria do Zé", slug: "padaria-do-ze", status: "active", currency: "BRL" },
    { id: "c2", name: "Studio Bella Estética", slug: "studio-bella", status: "active", currency: "BRL" },
    { id: "c3", name: "Auto Peças Silva", slug: "auto-pecas-silva", status: "active", currency: "BRL" },
  ],
};

const contratoBase = {
  status: "active" as const,
  cycle: "monthly" as const,
  started_at: emDias(-45),
  next_due_date: emDias(8),
  variable_metric: "ad_spend" as const,
  variable_grace_months: 3,
  notes: null,
};

export const demoClients: Client[] = [
  {
    id: "c1",
    name: "Padaria do Zé",
    slug: "padaria-do-ze",
    status: "active",
    currency: "BRL",
    timezone: "America/Sao_Paulo",
    brand_color: null,
    created_at: emDias(-60),
    document: "12.345.678/0001-90",
    contact_name: "José Almeida",
    contact_email: "contato@padariadoze.com.br",
    contact_phone: "(11) 98765-4321",
    segment: "Alimentação",
    notes: null,
    ad_account_model: "agency_owned",
    meta_business_id: null,
    billing_health: "ok",
    business_description:
      "Padaria de bairro com produção artesanal, forte em pães de fermentação natural e encomendas de bolo para festas.",
    target_audience: "Famílias do bairro, 30-55 anos, e escritórios que encomendam café da manhã.",
    value_proposition: "Fermentação natural de 24h, entrega em 40 minutos, receita de família.",
    main_products: "Pão de fermentação natural, bolos de festa, salgados para eventos",
    service_area: "Raio de 5 km — Pinheiros e Vila Madalena, São Paulo",
    avg_ticket: 85,
    campaign_goal: "vendas",
    competitors: ["Padaria Central", "Pão Nosso"],
    seed_keywords: ["pão artesanal", "bolo de aniversário"],
    restrictions: null,
    website: "https://instagram.com/padariadoze",
    subscriptions: [
      {
        ...contratoBase,
        id: "s1",
        amount: 1200,
        setup_fee: 1500,
        variable_pct: 10,
        variable_threshold: 5000,
        plans: { id: "p1", name: "Essencial" },
      },
    ],
  },
  {
    id: "c2",
    name: "Studio Bella Estética",
    slug: "studio-bella",
    status: "active",
    currency: "BRL",
    timezone: "America/Sao_Paulo",
    brand_color: null,
    created_at: emDias(-30),
    document: "11.222.333/0001-81",
    contact_name: "Bella Souza",
    contact_email: "contato@studiobella.com.br",
    contact_phone: "(11) 98888-7777",
    segment: "Estética e beleza",
    notes: null,
    ad_account_model: "agency_owned",
    meta_business_id: null,
    billing_health: "ok",
    business_description:
      "Clínica de estética avançada com foco em harmonização facial e tratamentos corporais não invasivos.",
    target_audience: "Mulheres 28-50 anos, classe A/B, região dos Jardins em São Paulo.",
    value_proposition: "Equipamentos importados, avaliação gratuita e parcelamento em 12x.",
    main_products: "Harmonização facial, criolipólise, limpeza de pele profunda",
    service_area: "Jardins e Itaim Bibi, São Paulo",
    avg_ticket: 1800,
    campaign_goal: "agendamento",
    competitors: ["Clínica Renova", "Belle Estética"],
    seed_keywords: ["harmonização facial", "criolipólise preço"],
    restrictions: "Não prometer resultado permanente; não usar antes e depois no Meta",
    website: "https://instagram.com/studiobella",
    subscriptions: [
      {
        ...contratoBase,
        id: "s2",
        amount: 950,
        setup_fee: 800,
        variable_pct: 12,
        variable_threshold: 4000,
        started_at: emDias(-20),
        plans: { id: "p1", name: "Essencial" },
      },
    ],
  },
  {
    id: "c3",
    name: "Auto Peças Silva",
    slug: "auto-pecas-silva",
    status: "active",
    currency: "BRL",
    timezone: "America/Sao_Paulo",
    brand_color: null,
    created_at: emDias(-15),
    document: null,
    contact_name: "Roberto Silva",
    contact_email: "roberto@autopecassilva.com.br",
    contact_phone: null,
    segment: "Automotivo",
    notes: null,
    ad_account_model: "client_owned",
    meta_business_id: null,
    billing_health: "missing",
    business_description: null,
    target_audience: null,
    value_proposition: null,
    main_products: null,
    service_area: null,
    avg_ticket: null,
    campaign_goal: null,
    competitors: null,
    seed_keywords: null,
    restrictions: null,
    website: null,
    subscriptions: [],
  },
];

export const demoPlans: Plan[] = [
  {
    id: "p1",
    name: "Essencial",
    description: "Gestão de tráfego pago com painel e portal do cliente.",
    amount: 1200,
    cycle: "monthly",
    variable_metric: "ad_spend",
    variable_threshold: 5000,
    variable_pct: 10,
    variable_cap: null,
    variable_grace_months: 3,
    features: [
      "Gestão de campanhas no Meta Ads",
      "Painel com resultados em tempo real",
      "Portal do cliente com aprovação de criativos",
      "Relatório mensal automático",
      "Alertas de verba e desempenho",
    ],
    is_active: true,
  },
  {
    id: "p2",
    name: "Implantação",
    description: "Configuração inicial. Cobrança única, no início do contrato.",
    amount: 1500,
    cycle: "monthly",
    variable_metric: null,
    variable_threshold: null,
    variable_pct: null,
    variable_cap: null,
    variable_grace_months: 3,
    features: [
      "Configuração de Business Manager e conta de anúncios",
      "Instalação e validação de pixel e conversões",
      "Pesquisa de público e concorrência",
      "Primeiros criativos e estrutura de campanhas",
    ],
    is_active: true,
  },
];

export const demoSubscriptions: Subscription[] = demoClients
  .filter((c) => c.subscriptions.length > 0)
  .map((c) => ({
    id: c.subscriptions[0]!.id,
    client_id: c.id,
    plan_id: "p1",
    status: c.subscriptions[0]!.status,
    amount: c.subscriptions[0]!.amount,
    cycle: "monthly",
    started_at: c.subscriptions[0]!.started_at,
    next_due_date: c.subscriptions[0]!.next_due_date,
    asaas_subscription_id: "sub_demo",
    clients: { id: c.id, name: c.name },
    plans: { id: "p1", name: "Essencial" },
  }));

export const demoInvoices: Invoice[] = [
  {
    id: "i1",
    client_id: "c1",
    description: "Mensalidade — Padaria do Zé",
    amount: 1200,
    due_date: emDias(-5),
    paid_at: emDias(-5),
    status: "paid",
    method: "pix",
    invoice_url: null,
    clients: { id: "c1", name: "Padaria do Zé" },
  },
  {
    id: "i2",
    client_id: "c2",
    description: "Implantação — Studio Bella",
    amount: 800,
    due_date: emDias(3),
    paid_at: null,
    status: "pending",
    method: null,
    invoice_url: null,
    clients: { id: "c2", name: "Studio Bella Estética" },
  },
  {
    id: "i3",
    client_id: "c1",
    description: "Mensalidade — Padaria do Zé",
    amount: 1200,
    due_date: emDias(-35),
    paid_at: emDias(-34),
    status: "paid",
    method: "boleto",
    invoice_url: null,
    clients: { id: "c1", name: "Padaria do Zé" },
  },
];

export const demoVisaoGerencial: VisaoGerencial = {
  periodo: { inicio: emDias(-29), fim: emDias(0) },
  verba: 18420,
  receita: 71380,
  conversoes: 214,
  cliques: 9840,
  impressoes: 412500,
  roas: 3.87,
  cpa: 86.07,
  clientes_ativos: 3,
  clientes_total: 3,
  mrr: 2150,
  recebido_periodo: 2400,
  a_receber: 800,
  inadimplentes: 0,
  clientes: [
    { id: "c1", name: "Padaria do Zé", status: "active", verba: 9200, receita: 41400, conversoes: 128 },
    { id: "c2", name: "Studio Bella Estética", status: "active", verba: 7100, receita: 26270, conversoes: 62 },
    { id: "c3", name: "Auto Peças Silva", status: "active", verba: 2120, receita: 3710, conversoes: 24 },
  ],
};

export function demoVisaoCliente(id: string): VisaoCliente {
  const base = demoVisaoGerencial.clientes.find((c) => c.id === id);
  const verba = base?.verba ?? 0;
  const receita = base?.receita ?? 0;
  const conversoes = base?.conversoes ?? 0;

  return {
    verba,
    receita,
    conversoes,
    cliques: Math.round(verba * 0.53),
    impressoes: Math.round(verba * 22),
    roas: verba > 0 ? Number((receita / verba).toFixed(2)) : 0,
    cpa: conversoes > 0 ? Number((verba / conversoes).toFixed(2)) : 0,
    ctr: 2.39,
    serie: [],
    campanhas:
      verba > 0
        ? [
            { id: "k1", name: "Conversão — Institucional", status: "active", platform: "meta", daily_budget: 120 },
            { id: "k2", name: "Remarketing — 30 dias", status: "active", platform: "meta", daily_budget: 60 },
            { id: "k3", name: "Alcance — Bairro", status: "paused", platform: "meta", daily_budget: 40 },
          ]
        : [],
    criativos_total: verba > 0 ? 14 : 0,
    faturas: demoInvoices
      .filter((i) => i.client_id === id)
      .map((i) => ({
        id: i.id,
        amount: i.amount,
        due_date: i.due_date,
        status: i.status,
        invoice_url: null,
      })),
  };
}

#!/usr/bin/env node
/**
 * Cadastra os planos comerciais da 4Him e testa a conexão com o Asaas.
 *
 * Uso: npm run seed:plans
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const root = fileURLToPath(new URL("..", import.meta.url));
loadEnv({ path: path.join(root, ".env") });

const { SUPABASE_DB_URL, ASAAS_API_KEY, ASAAS_ENV } = process.env;

const sql = postgres(SUPABASE_DB_URL, {
  ssl: "require",
  max: 1,
  connect_timeout: 30,
  onnotice: () => {},
});

/**
 * Estrutura comercial definida em 2026-07-26.
 * A parte variável já nasce no contrato: o cliente pequeno não sente,
 * e quando ele cresce a cobrança acompanha sem renegociação.
 */
const PLANOS = [
  {
    name: "Essencial",
    description: "Gestão de tráfego pago com painel e portal do cliente.",
    amount: 1200,
    cycle: "monthly",
    variable_metric: "ad_spend",
    variable_threshold: 5000,
    variable_pct: 10,
    features: [
      "Gestão de campanhas no Meta Ads",
      "Painel com resultados em tempo real",
      "Portal do cliente com aprovação de criativos",
      "Relatório mensal automático",
      "Alertas de verba e desempenho",
    ],
  },
  {
    name: "Implantação",
    description: "Configuração inicial. Cobrança única, no início do contrato.",
    amount: 1500,
    cycle: "monthly", // avulsa: não gera assinatura recorrente
    features: [
      "Configuração de Business Manager e conta de anúncios",
      "Instalação e validação de pixel e conversões",
      "Pesquisa de público e concorrência",
      "Primeiros criativos e estrutura de campanhas",
    ],
  },
];

async function testarAsaas() {
  if (!ASAAS_API_KEY) return { ok: false, motivo: "ASAAS_API_KEY vazia" };

  const base =
    ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";

  try {
    const res = await fetch(`${base}/customers?limit=1`, {
      headers: { access_token: ASAAS_API_KEY, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return { ok: false, motivo: `HTTP ${res.status} — ${JSON.stringify(b).slice(0, 160)}` };
    }
    const body = await res.json();
    return { ok: true, ambiente: ASAAS_ENV, clientes: body.totalCount ?? 0 };
  } catch (err) {
    return { ok: false, motivo: err.message };
  }
}

try {
  const [org] = await sql`select id, name from organizations order by created_at limit 1`;
  if (!org) throw new Error("Nenhuma organização. Rode `npm run bootstrap` antes.");

  console.log(`\n🏢 ${org.name}\n`);

  for (const p of PLANOS) {
    const [existente] = await sql`
      select id from plans where org_id = ${org.id} and name = ${p.name} limit 1
    `;

    const dados = {
      org_id: org.id,
      name: p.name,
      description: p.description,
      amount: p.amount,
      cycle: p.cycle,
      variable_metric: p.variable_metric ?? null,
      variable_threshold: p.variable_threshold ?? null,
      variable_pct: p.variable_pct ?? null,
      features: JSON.stringify(p.features),
    };

    if (existente) {
      await sql`update plans set ${sql(dados)} where id = ${existente.id}`;
      console.log(`   ↻ ${p.name} atualizado`);
    } else {
      await sql`insert into plans ${sql(dados)}`;
      console.log(`   + ${p.name} criado`);
    }

    const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    console.log(`     ${brl(p.amount)}${p.variable_pct ? ` + ${p.variable_pct}% acima de ${brl(p.variable_threshold)}` : " (avulso)"}`);
  }

  console.log("\n🔌 Testando conexão com o Asaas...");
  const asaas = await testarAsaas();
  if (asaas.ok) {
    console.log(`   ✅ conectado — ambiente: ${asaas.ambiente} · ${asaas.clientes} cliente(s) lá`);
  } else {
    console.log(`   ⚠️  não conectou: ${asaas.motivo}`);
  }

  console.log("");
} catch (err) {
  console.error("\n❌", err.message, "\n");
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

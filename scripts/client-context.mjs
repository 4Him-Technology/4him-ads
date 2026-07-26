#!/usr/bin/env node
/**
 * Mostra o briefing de um cliente exatamente como a IA vai recebê-lo.
 *
 * Útil para conferir se o contexto está bom antes de culpar o modelo por
 * uma sugestão ruim — quase sempre o problema é briefing vazio.
 *
 * Uso: npm run client:context -- --slug padaria-do-ze
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const root = fileURLToPath(new URL("..", import.meta.url));
loadEnv({ path: path.join(root, ".env") });

const i = process.argv.indexOf("--slug");
const slug = i !== -1 ? process.argv[i + 1] : null;

const sql = postgres(process.env.SUPABASE_DB_URL, {
  ssl: "require",
  max: 1,
  connect_timeout: 30,
  onnotice: () => {},
});

try {
  const clientes = slug
    ? await sql`select id, name, slug from clients where slug = ${slug}`
    : await sql`select id, name, slug from clients order by name`;

  if (clientes.length === 0) {
    console.log("\nNenhum cliente encontrado.\n");
  }

  for (const c of clientes) {
    const [ctx] = await sql`select contexto_ia(${c.id}) as briefing`;
    const [contrato] = await sql`
      select s.amount, s.setup_fee, s.variable_pct, s.variable_threshold,
             s.variable_grace_months, p.name as plano, p.amount as plano_amount,
             p.variable_pct as plano_pct
      from subscriptions s
      left join plans p on p.id = s.plan_id
      where s.client_id = ${c.id} and s.status <> 'cancelled'
      limit 1
    `;

    console.log(`\n${"═".repeat(60)}`);
    console.log(`${c.name}  (${c.slug})`);
    console.log("═".repeat(60));

    const b = ctx.briefing ?? {};
    const campos = Object.keys(b).filter((k) => k !== "nome");
    if (campos.length === 0) {
      console.log("\n⚠️  Briefing VAZIO — a IA só conseguiria dar sugestão genérica.\n");
    } else {
      console.log("\n📋 Briefing enviado à IA:");
      console.log(JSON.stringify(b, null, 2));
    }

    if (contrato) {
      const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      console.log("\n💰 Contrato (negociado) × Plano (modelo):");
      console.log(`   mensalidade : ${brl(contrato.amount)}   (plano: ${brl(contrato.plano_amount)})`);
      if (contrato.setup_fee) console.log(`   implantação : ${brl(contrato.setup_fee)}`);
      console.log(
        `   percentual  : ${contrato.variable_pct ?? "—"}%   (plano: ${contrato.plano_pct ?? "—"}%)` +
          `  acima de ${brl(contrato.variable_threshold)}, carência ${contrato.variable_grace_months ?? 0} mês(es)`,
      );
    } else {
      console.log("\n💰 Sem contrato ativo.");
    }
  }
  console.log("");
} catch (err) {
  console.error("\n❌", err.message, "\n");
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

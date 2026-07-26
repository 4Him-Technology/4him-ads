#!/usr/bin/env node
/**
 * Diagnóstico do banco do 4him Ads.
 *
 * Mostra tabelas, se o RLS está ligado, quantas políticas cada uma tem e
 * quais migrations já rodaram. Somente leitura — não altera nada.
 *
 * Uso: npm run db:check
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const root = fileURLToPath(new URL("..", import.meta.url));
loadEnv({ path: path.join(root, ".env") });

if (!process.env.SUPABASE_DB_URL) {
  console.error("❌ SUPABASE_DB_URL não definida no .env");
  process.exit(1);
}

const sql = postgres(process.env.SUPABASE_DB_URL, {
  ssl: "require",
  max: 1,
  connect_timeout: 30,
  onnotice: () => {}, // silencia NOTICEs do Postgres
});

try {
  const tables = await sql`
    select
      c.relname                                     as tabela,
      c.relrowsecurity                              as rls,
      (select count(*) from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname) as politicas
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `;

  const enums = await sql`
    select t.typname as nome, count(e.enumlabel) as valores
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    group by t.typname
    order by t.typname
  `;

  const migrations = await sql`select name, applied_at from schema_migrations order by name`;

  console.log("\n📋 TABELAS\n");
  console.log("   " + "tabela".padEnd(24) + "RLS    políticas");
  console.log("   " + "-".repeat(45));
  let semRls = 0;
  for (const t of tables) {
    if (t.tabela === "schema_migrations") continue;
    if (!t.rls) semRls++;
    console.log(
      "   " +
        t.tabela.padEnd(24) +
        (t.rls ? "on " : "OFF").padEnd(7) +
        String(t.politicas).padStart(5),
    );
  }

  console.log(`\n🏷️  ENUMS: ${enums.map((e) => `${e.nome}(${e.valores})`).join(", ")}`);

  console.log("\n🗂️  MIGRATIONS APLICADAS\n");
  for (const m of migrations) {
    console.log(`   ✓ ${m.name}  —  ${new Date(m.applied_at).toLocaleString("pt-BR")}`);
  }

  const total = tables.filter((t) => t.tabela !== "schema_migrations").length;
  const politicas = tables.reduce((sum, t) => sum + Number(t.politicas), 0);
  console.log(
    `\n📊 ${total} tabelas · ${politicas} políticas de RLS · ` +
      (semRls === 0 ? "todas protegidas ✅" : `⚠️  ${semRls} SEM RLS`) +
      "\n",
  );
} catch (err) {
  console.error("❌", err.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

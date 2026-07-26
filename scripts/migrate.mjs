#!/usr/bin/env node
/**
 * Migration runner do 4him Ads.
 *
 * Aplica os arquivos de `supabase/migrations/*.sql` em ordem, uma única vez
 * cada, registrando o que já rodou na tabela `schema_migrations`.
 *
 * Conecta usando SUPABASE_DB_URL do `.env` da raiz — credencial exclusiva
 * do projeto 4him, sem qualquer relação com outros projetos/contas.
 *
 * Uso:
 *   npm run db:migrate           aplica as pendentes
 *   npm run db:migrate -- --dry  só mostra o que faria
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const root = fileURLToPath(new URL("..", import.meta.url));
loadEnv({ path: path.join(root, ".env") });

const dryRun = process.argv.includes("--dry");
const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error(
    "\n❌ SUPABASE_DB_URL não definida no .env\n" +
      "   Pegue em: Supabase → seu projeto → Connect → Session pooler (URI)\n",
  );
  process.exit(1);
}

const migrationsDir = path.join(root, "supabase", "migrations");

const sql = postgres(dbUrl, {
  ssl: "require",
  max: 1,
  // Migrations podem demorar; não derruba no meio.
  idle_timeout: 0,
  connect_timeout: 30,
});

async function main() {
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  if (files.length === 0) {
    console.log("Nenhuma migration encontrada em supabase/migrations/");
    return;
  }

  await sql`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const applied = await sql`select name from schema_migrations`;
  const done = new Set(applied.map((row) => row.name));
  const pending = files.filter((f) => !done.has(f));

  console.log(`\n📦 ${files.length} migration(s) no total · ${done.size} já aplicada(s)\n`);

  if (pending.length === 0) {
    console.log("✅ Banco já está em dia — nada a fazer.\n");
    return;
  }

  for (const file of pending) {
    const content = await readFile(path.join(migrationsDir, file), "utf8");

    if (dryRun) {
      console.log(`   [dry] aplicaria ${file} (${content.length} bytes)`);
      continue;
    }

    process.stdout.write(`   ▸ ${file} ... `);
    try {
      // Simple protocol: várias instruções num só comando, que o Postgres
      // executa como uma transação implícita (falhou → desfaz tudo do arquivo).
      await sql.unsafe(content).simple();
      await sql`insert into schema_migrations ${sql({ name: file })}`;
      console.log("ok");
    } catch (err) {
      console.log("FALHOU");
      console.error(`\n❌ Erro em ${file}:\n${err.message}\n`);
      throw err;
    }
  }

  if (!dryRun) console.log(`\n✅ ${pending.length} migration(s) aplicada(s).\n`);
}

try {
  await main();
} catch {
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

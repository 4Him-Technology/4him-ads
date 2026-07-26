#!/usr/bin/env node
/**
 * Libera uma conta bloqueada por excesso de tentativas de login.
 *
 * Uso: npm run unlock -- --email pessoa@empresa.com
 *      npm run unlock -- --email pessoa@empresa.com --ver   (só consulta)
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const root = fileURLToPath(new URL("..", import.meta.url));
loadEnv({ path: path.join(root, ".env") });

const i = process.argv.indexOf("--email");
const email = i !== -1 ? process.argv[i + 1] : null;
const apenasVer = process.argv.includes("--ver");

if (!email) {
  console.error("\n❌ Informe o e-mail:  npm run unlock -- --email pessoa@empresa.com\n");
  process.exit(1);
}

const sql = postgres(process.env.SUPABASE_DB_URL, {
  ssl: "require",
  max: 1,
  connect_timeout: 30,
  onnotice: () => {},
});

try {
  const [status] = await sql`select * from login_block_status(${email}::citext, null)`;
  const recentes = await sql`
    select success, created_at, ip
    from auth_attempts
    where email = ${email}::citext and created_at > now() - interval '15 minutes'
    order by created_at desc
  `;

  console.log(`\n📧 ${email}`);
  console.log(
    `   Situação: ${status.blocked ? `🔒 BLOQUEADA (libera em ${status.retry_after_seconds}s)` : "🔓 liberada"}`,
  );
  console.log(`   Tentativas nos últimos 15 min: ${recentes.length}`);
  for (const t of recentes.slice(0, 8)) {
    console.log(
      `      ${t.success ? "✅" : "❌"} ${new Date(t.created_at).toLocaleTimeString("pt-BR")}  ${t.ip ?? ""}`,
    );
  }

  if (apenasVer) {
    console.log("\n(modo consulta — nada foi alterado)\n");
  } else {
    const apagados = await sql`
      delete from auth_attempts
      where email = ${email}::citext and not success
      returning id
    `;
    console.log(`\n✅ Conta liberada (${apagados.length} tentativa(s) falha(s) removida(s)).\n`);
  }
} catch (err) {
  console.error("\n❌", err.message, "\n");
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

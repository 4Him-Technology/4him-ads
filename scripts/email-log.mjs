#!/usr/bin/env node
/**
 * Consulta a trilha de e-mails enviados.
 *
 * Responde "o cliente recebeu?" sem depender do painel do provedor.
 * Enquanto não houver provedor configurado, os envios ficam com status
 * `skipped` — o sistema não quebra, apenas não envia.
 *
 * Uso: npm run email:log
 *      npm run email:log -- --email pessoa@empresa.com
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const root = fileURLToPath(new URL("..", import.meta.url));
loadEnv({ path: path.join(root, ".env") });

const i = process.argv.indexOf("--email");
const filtro = i !== -1 ? process.argv[i + 1] : null;

const sql = postgres(process.env.SUPABASE_DB_URL, {
  ssl: "require",
  max: 1,
  connect_timeout: 30,
  onnotice: () => {},
});

const ICONE = { sent: "✅", failed: "❌", skipped: "⚪", queued: "⏳" };

try {
  const envios = filtro
    ? await sql`
        select to_email, template, status, subject, error, created_at
        from email_log where to_email = ${filtro}::citext
        order by created_at desc limit 30`
    : await sql`
        select to_email, template, status, subject, error, created_at
        from email_log order by created_at desc limit 30`;

  if (envios.length === 0) {
    console.log("\nNenhum e-mail registrado ainda.\n");
  } else {
    console.log(`\n📧 Últimos ${envios.length} envio(s)\n`);
    for (const e of envios) {
      const quando = new Date(e.created_at).toLocaleString("pt-BR");
      console.log(
        `  ${ICONE[e.status] ?? "?"} ${quando}  ${e.template.padEnd(18)} ${e.to_email}`,
      );
      if (e.error) console.log(`     erro: ${e.error}`);
    }
  }

  const [resumo] = await sql`
    select
      count(*) filter (where status = 'sent')    as enviados,
      count(*) filter (where status = 'skipped') as pulados,
      count(*) filter (where status = 'failed')  as falharam
    from email_log
  `;
  console.log(
    `\n  total: ${resumo.enviados} enviado(s) · ${resumo.pulados} pulado(s) · ${resumo.falharam} falha(s)`,
  );

  if (Number(resumo.pulados) > 0 && !process.env.RESEND_API_KEY) {
    console.log(
      "\n  ⚪ 'pulado' = provedor de e-mail não configurado.\n" +
        "     Defina RESEND_API_KEY e EMAIL_FROM no .env para enviar de verdade.",
    );
  }

  const [tokens] = await sql`
    select count(*)::int as ativos
    from password_reset_tokens
    where used_at is null and expires_at > now()
  `;
  console.log(`  tokens de recuperação ativos: ${tokens.ativos}\n`);
} catch (err) {
  console.error("\n❌", err.message, "\n");
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

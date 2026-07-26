#!/usr/bin/env node
/**
 * Cria a organização da agência e o primeiro usuário administrador.
 *
 * Idempotente: rodar de novo não duplica nada.
 *
 * Uso:
 *   npm run bootstrap
 *   npm run bootstrap -- --email outro@dominio.com --senha "MinhaSenha123"
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const root = fileURLToPath(new URL("..", import.meta.url));
loadEnv({ path: path.join(root, ".env") });

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ORG_NAME = arg("org", "4Him Technology");
const ORG_SLUG = arg("slug", "4him");
const EMAIL = arg("email", "admin@4him.com.br");
const NOME = arg("nome", "Administrador 4Him");

/** Senha forte, sem caracteres ambíguos, se não vier por parâmetro. */
function gerarSenha() {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(
    crypto.randomFillSync(new Uint32Array(20)),
    (n) => alfabeto[n % alfabeto.length],
  ).join("");
}

const senhaInformada = arg("senha", null);
const SENHA = senhaInformada ?? gerarSenha();

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_DB_URL) {
  console.error("❌ Faltam SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_DB_URL no .env");
  process.exit(1);
}

const sql = postgres(SUPABASE_DB_URL, {
  ssl: "require",
  max: 1,
  connect_timeout: 30,
  onnotice: () => {},
});

/** Chamada à Admin API do Supabase Auth (exige service_role). */
async function authAdmin(rota, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/${rota}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.msg || body.error_description || JSON.stringify(body));
  return body;
}

async function main() {
  // 1) Organização
  const [org] = await sql`
    insert into organizations ${sql({ name: ORG_NAME, slug: ORG_SLUG })}
    on conflict (slug) do update set name = excluded.name
    returning id, name, slug
  `;
  console.log(`🏢 Organização: ${org.name} (${org.slug})`);

  // 2) Usuário no Auth (reaproveita se já existir)
  let userId;
  let senhaNova = true;

  const existentes = await sql`select id from auth.users where email = ${EMAIL} limit 1`;
  if (existentes.length > 0) {
    userId = existentes[0].id;
    senhaNova = false;
    console.log(`👤 Usuário já existia: ${EMAIL}`);
  } else {
    const criado = await authAdmin("users", {
      method: "POST",
      body: JSON.stringify({
        email: EMAIL,
        password: SENHA,
        email_confirm: true, // já entra confirmado; não depende de e-mail
        user_metadata: { full_name: NOME },
      }),
    });
    userId = criado.id;
    console.log(`👤 Usuário criado: ${EMAIL}`);
  }

  // 3) Profile (o trigger cria; garantimos o nome e a marcação de staff)
  await sql`
    insert into profiles ${sql({ id: userId, email: EMAIL, full_name: NOME, is_agency_staff: true })}
    on conflict (id) do update set
      full_name = excluded.full_name,
      is_agency_staff = true
  `;

  // 4) Membership de dono
  await sql`
    insert into memberships ${sql({ org_id: org.id, user_id: userId, role: "owner" })}
    on conflict (org_id, user_id) do update set role = 'owner'
  `;
  console.log(`🔑 Papel: owner`);

  console.log("\n" + "=".repeat(56));
  console.log("✅ PRONTO — dados de acesso");
  console.log("=".repeat(56));
  console.log(`   E-mail: ${EMAIL}`);
  if (senhaNova) {
    console.log(`   Senha : ${SENHA}`);
    console.log("\n   ⚠️  Esta senha aparece UMA vez. Guarde agora.");
  } else {
    console.log("   Senha : (mantida — usuário já existia)");
  }
  console.log("=".repeat(56) + "\n");
}

try {
  await main();
} catch (err) {
  console.error("\n❌", err.message, "\n");
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

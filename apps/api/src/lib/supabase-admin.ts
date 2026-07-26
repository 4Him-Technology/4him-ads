import crypto from "node:crypto";
import { env } from "../env.js";

/**
 * Acesso à Admin API do Supabase Auth.
 *
 * ⚠️ Usa a service_role. Toda rota que chamar isto precisa ter verificado
 * ANTES, no banco, que quem pediu tem papel de administrador.
 */

function adminHeaders() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase não configurado");
  }
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

export interface CreatedUser {
  id: string;
  email: string;
  jaExistia: boolean;
}

/** Senha temporária forte, sem caracteres ambíguos (0/O, 1/l). */
export function gerarSenhaTemporaria(tamanho = 16): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(
    crypto.randomFillSync(new Uint32Array(tamanho)),
    (n) => alfabeto[n % alfabeto.length],
  ).join("");
}

/**
 * Cria o usuário no Auth. Se o e-mail já existir, devolve o id existente
 * em vez de falhar — permite dar acesso a alguém que já usa o sistema.
 */
export async function criarOuObterUsuario(params: {
  email: string;
  senha: string;
  nome?: string;
}): Promise<CreatedUser> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      email: params.email,
      password: params.senha,
      email_confirm: true, // não depende de e-mail para o primeiro acesso
      user_metadata: params.nome ? { full_name: params.nome } : {},
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    msg?: string;
    error_code?: string;
    code?: number;
  };

  if (res.ok && body.id) {
    return { id: body.id, email: params.email, jaExistia: false };
  }

  // E-mail já cadastrado → localiza o usuário existente.
  const jaExiste =
    body.error_code === "email_exists" ||
    (body.msg ?? "").toLowerCase().includes("already been registered");

  if (jaExiste) {
    const existente = await buscarUsuarioPorEmail(params.email);
    if (existente) return { id: existente, email: params.email, jaExistia: true };
  }

  throw new Error(body.msg ?? "falha ao criar usuário");
}

/** Procura um usuário pelo e-mail na Admin API. */
async function buscarUsuarioPorEmail(email: string): Promise<string | null> {
  const url = new URL(`${env.SUPABASE_URL}/auth/v1/admin/users`);
  url.searchParams.set("filter", email);
  url.searchParams.set("per_page", "50");

  const res = await fetch(url, { headers: adminHeaders() });
  if (!res.ok) return null;

  const body = (await res.json()) as { users?: { id: string; email: string }[] };
  const achado = body.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return achado?.id ?? null;
}

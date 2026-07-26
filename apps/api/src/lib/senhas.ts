import crypto from "node:crypto";
import { env } from "../env.js";
import { getServiceClient } from "../supabase.js";

/**
 * Tokens de redefinição de senha.
 *
 * O token vai para o e-mail em texto; no banco guardamos apenas o hash.
 * Se o banco vazar, os tokens em trânsito continuam inúteis.
 */

const VALIDADE_MINUTOS = 60;

export function gerarToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function criarTokenDeRecuperacao(userId: string, ip: string | null) {
  const { token, hash } = gerarToken();
  const expira = new Date(Date.now() + VALIDADE_MINUTOS * 60_000);

  const service = getServiceClient();

  // Invalida pedidos anteriores: só o último link vale.
  await service
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("used_at", null);

  const { error } = await service.from("password_reset_tokens").insert({
    user_id: userId,
    token_hash: hash,
    expires_at: expira.toISOString(),
    requested_ip: ip,
  });

  if (error) throw new Error(error.message);

  return { token, expira };
}

export interface TokenValido {
  id: string;
  user_id: string;
}

/** Valida o token: existe, não expirou e não foi usado. */
export async function validarToken(token: string): Promise<TokenValido | null> {
  const service = getServiceClient();

  const { data } = await service
    .from("password_reset_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!data || data.used_at) return null;
  if (new Date(data.expires_at) < new Date()) return null;

  return { id: data.id, user_id: data.user_id };
}

export async function marcarTokenUsado(id: string) {
  await getServiceClient()
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", id);
}

/** Troca a senha do usuário via Admin API do Supabase Auth. */
export async function definirSenha(userId: string, novaSenha: string): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY as string,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY as string}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: novaSenha }),
  });

  if (!res.ok) {
    const corpo = (await res.json().catch(() => ({}))) as { msg?: string };
    throw new Error(corpo.msg ?? "não foi possível alterar a senha");
  }
}

/**
 * Regras mínimas de senha.
 * Sem exigir símbolo: comprimento pesa mais que complexidade, e regra
 * rebuscada leva as pessoas a anotarem a senha num papel.
 */
export function validarForcaDaSenha(senha: string): string | null {
  if (senha.length < 8) return "A senha precisa ter ao menos 8 caracteres.";
  if (senha.length > 200) return "Senha muito longa.";
  if (!/[a-zA-Z]/.test(senha)) return "A senha precisa ter ao menos uma letra.";
  if (!/[0-9]/.test(senha)) return "A senha precisa ter ao menos um número.";
  return null;
}

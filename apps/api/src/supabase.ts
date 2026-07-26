import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "./env.js";

const noPersist = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

function assertConfigured(): { url: string; anon: string } {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error("Supabase não configurado: defina SUPABASE_URL e SUPABASE_ANON_KEY no .env");
  }
  return { url: env.SUPABASE_URL, anon: env.SUPABASE_ANON_KEY };
}

let serviceClient: SupabaseClient | null = null;

/**
 * Client com SERVICE ROLE — ⚠️ IGNORA TODO O RLS.
 *
 * Usar somente em operações administrativas conscientes (criar usuário,
 * jobs de sincronização). Nunca para atender requisição de usuário:
 * para isso existe o `createUserClient`.
 */
export function getServiceClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env",
    );
  }
  if (!serviceClient) {
    serviceClient = createClient(
      env.SUPABASE_URL as string,
      env.SUPABASE_SERVICE_ROLE_KEY as string,
      noPersist,
    );
  }
  return serviceClient;
}

/**
 * Client anônimo — usado apenas para login/refresh.
 * Não enxerga nada além do que o RLS permite ao papel `anon`.
 */
export function getAuthClient(): SupabaseClient {
  const { url, anon } = assertConfigured();
  return createClient(url, anon, noPersist);
}

/**
 * Client no contexto de UM usuário: toda query roda como ele.
 *
 * É o que faz o RLS valer de verdade — o Postgres resolve `auth.uid()`
 * a partir deste token, então um usuário-cliente não consegue ler dados
 * de outro cliente nem que a aplicação tenha um bug.
 */
export function createUserClient(accessToken: string): SupabaseClient {
  const { url, anon } = assertConfigured();
  return createClient(url, anon, {
    ...noPersist,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

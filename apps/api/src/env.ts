import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

/**
 * Carrega o `.env` da RAIZ do monorepo.
 *
 * O Turbo executa cada app na sua própria pasta, então `dotenv/config`
 * procuraria em `apps/api/.env`. Apontamos explicitamente para a raiz para
 * manter um único arquivo de credenciais no projeto.
 */
const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
loadEnv({ path: rootEnv });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(3333),
  // o web roda na 5174 (a 5173 fica ocupada por outro projeto desta máquina)
  WEB_ORIGIN: z.string().default("http://localhost:5174"),

  // --- Supabase (só no servidor; nunca exposto ao browser) ---
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // --- Segredos da aplicação (usados a partir da fase de autenticação) ---
  SESSION_SECRET: z.string().optional(),
  /** Chave AES para cifrar tokens de plataforma antes de gravar no banco. */
  ENCRYPTION_KEY: z.string().optional(),

  // --- Asaas (cobrança recorrente do serviço) ---
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  /** Segredo combinado com o Asaas para autenticar os webhooks recebidos. */
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),

  // --- Meta Marketing API ---
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_API_VERSION: z.string().default("v21.0"),
  META_REDIRECT_URI: z.string().default("http://localhost:3333/connect/meta/callback"),
  /** Escrita no Meta exige App Review aprovado — manter `false` até lá. */
  META_WRITE_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export const env = schema.parse(process.env);

export const isSupabaseConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

export const isMetaConfigured = Boolean(env.META_APP_ID && env.META_APP_SECRET);

import crypto from "node:crypto";
import { env } from "../env.js";

/**
 * Sessão do usuário guardada em cookie.
 *
 * O conteúdo é cifrado com AES-256-GCM: além de ilegível, qualquer
 * alteração de um único byte invalida a sessão (a tag de autenticação
 * não bate). Isso impede tanto leitura quanto forja do cookie.
 *
 * O cookie é httpOnly — o JavaScript da página não consegue lê-lo,
 * então um XSS não rouba o token.
 */

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

export const SESSION_COOKIE = "4him_session";

export interface SessionData {
  userId: string;
  accessToken: string;
  refreshToken: string;
  /** epoch em segundos */
  expiresAt: number;
}

function encryptionKey(): Buffer {
  if (!env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY não configurada no .env");
  }
  const key = Buffer.from(env.ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY deve ser 32 bytes em base64 (256 bits)");
  }
  return key;
}

/** Cifra a sessão para virar valor de cookie. */
export function sealSession(data: SessionData): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((b) => b.toString("base64url")).join(".");
}

/** Decifra o cookie. Retorna null se ausente, adulterado ou com chave trocada. */
export function openSession(value: string | undefined): SessionData | null {
  if (!value) return null;

  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [ivPart, tagPart, dataPart] = parts as [string, string, string];

  try {
    const decipher = crypto.createDecipheriv(
      ALGO,
      encryptionKey(),
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]);
    const parsed: unknown = JSON.parse(decrypted.toString("utf8"));

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as SessionData).accessToken !== "string" ||
      typeof (parsed as SessionData).userId !== "string"
    ) {
      return null;
    }
    return parsed as SessionData;
  } catch {
    // Falha de autenticação do GCM = cookie mexido. Trata como não-logado.
    return null;
  }
}

/**
 * Opções do cookie de sessão.
 * - httpOnly: JavaScript não lê (protege contra XSS)
 * - sameSite strict: o navegador não envia em requisições de outros sites (CSRF)
 * - secure em produção: só trafega por HTTPS
 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 dias
  };
}

/** Considera expirado 60s antes, para não usar token que morre no meio da chamada. */
export function isExpired(session: SessionData): boolean {
  return session.expiresAt * 1000 <= Date.now() + 60_000;
}

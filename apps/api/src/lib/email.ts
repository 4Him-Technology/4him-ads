import { env } from "../env.js";
import { getServiceClient } from "../supabase.js";

/**
 * Envio de e-mail.
 *
 * Sem provedor configurado, o sistema NÃO quebra: registra o envio como
 * `skipped` e imprime no log do servidor. Assim dá para desenvolver e
 * testar todo o fluxo antes de contratar um serviço de e-mail — e o
 * link de recuperação aparece no terminal para conferência.
 *
 * Todo envio fica em `email_log`, para responder "o cliente recebeu?"
 * sem depender do painel do provedor.
 */

export type Template =
  | "convite_equipe"
  | "convite_cliente"
  | "recuperar_senha"
  | "senha_alterada"
  | "fatura_gerada"
  | "fatura_vencida";

interface EnvioParams {
  para: string;
  assunto: string;
  template: Template;
  html: string;
  texto: string;
  orgId?: string | null;
  metadata?: Record<string, unknown>;
}

export const isEmailConfigured = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);

export async function enviarEmail(params: EnvioParams): Promise<{ enviado: boolean }> {
  const service = getServiceClient();

  const registro = {
    org_id: params.orgId ?? null,
    to_email: params.para,
    template: params.template,
    subject: params.assunto,
    metadata: params.metadata ?? {},
  };

  // --- Sem provedor: não perde o e-mail, apenas não envia ---
  if (!isEmailConfigured) {
    await service.from("email_log").insert({ ...registro, status: "skipped" });
    console.warn(
      `\n📧 [e-mail não enviado — provedor não configurado]\n` +
        `   para: ${params.para}\n   assunto: ${params.assunto}\n` +
        `   ${params.texto.split("\n").join("\n   ")}\n`,
    );
    return { enviado: false };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [params.para],
        subject: params.assunto,
        html: params.html,
        text: params.texto,
      }),
    });

    const corpo = (await res.json().catch(() => ({}))) as { id?: string; message?: string };

    if (!res.ok) {
      await service
        .from("email_log")
        .insert({ ...registro, status: "failed", error: corpo.message ?? `HTTP ${res.status}` });
      return { enviado: false };
    }

    await service
      .from("email_log")
      .insert({ ...registro, status: "sent", provider_id: corpo.id ?? null });
    return { enviado: true };
  } catch (err) {
    await service
      .from("email_log")
      .insert({ ...registro, status: "failed", error: (err as Error).message });
    return { enviado: false };
  }
}

// ============================================================
// Templates
// ============================================================

/** Moldura visual comum, na identidade da 4Him. */
function moldura(titulo: string, conteudo: string, rodape?: string) {
  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#f5f0e8;font-family:Inter,Arial,sans-serif;color:#141414">
  <table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5ddd0">
    <tr><td style="background:#000;padding:20px 24px">
      <span style="color:#c49a3c;font-size:18px;font-weight:800;letter-spacing:-.5px">4Him</span>
      <span style="color:#f5f0e8;font-size:18px;font-weight:600"> Ads</span>
    </td></tr>
    <tr><td style="padding:28px 24px">
      <h1 style="margin:0 0 16px;font-size:19px;font-weight:700;color:#141414">${titulo}</h1>
      ${conteudo}
    </td></tr>
    <tr><td style="padding:16px 24px;background:#faf7f2;border-top:1px solid #e5ddd0;font-size:12px;color:#8a8378">
      ${rodape ?? "4Him Technology · gestão de tráfego pago"}
    </td></tr>
  </table>
</body></html>`;
}

function botao(texto: string, url: string) {
  return `<a href="${url}" style="display:inline-block;background:#96682c;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px">${texto}</a>`;
}

const p = (texto: string) =>
  `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#3d3a35">${texto}</p>`;

export function templateRecuperarSenha(nome: string, url: string) {
  return {
    assunto: "Redefinir sua senha — 4Him Ads",
    html: moldura(
      "Redefinir senha",
      p(`Olá, ${nome}.`) +
        p("Recebemos um pedido para redefinir a sua senha. O link vale por 1 hora.") +
        `<p style="margin:0 0 18px">${botao("Criar nova senha", url)}</p>` +
        p(
          `<span style="color:#8a8378;font-size:13px">Se não foi você quem pediu, ignore este e-mail — sua senha continua a mesma.</span>`,
        ),
    ),
    texto: `Olá, ${nome}.\n\nRecebemos um pedido para redefinir a sua senha.\nAbra o link abaixo (vale por 1 hora):\n\n${url}\n\nSe não foi você, ignore este e-mail.`,
  };
}

export function templateSenhaAlterada(nome: string) {
  return {
    assunto: "Sua senha foi alterada — 4Him Ads",
    html: moldura(
      "Senha alterada",
      p(`Olá, ${nome}.`) +
        p("A senha da sua conta acabou de ser alterada.") +
        p(
          `<strong>Não foi você?</strong> Entre em contato com a equipe da 4Him imediatamente.`,
        ),
    ),
    texto: `Olá, ${nome}.\n\nA senha da sua conta acabou de ser alterada.\n\nNão foi você? Entre em contato com a equipe da 4Him imediatamente.`,
  };
}

export function templateConvite(params: {
  nome: string;
  email: string;
  senha: string;
  url: string;
  cliente?: string;
}) {
  const contexto = params.cliente
    ? `Você foi convidado para acompanhar os resultados de <strong>${params.cliente}</strong> na plataforma da 4Him.`
    : "Você foi convidado para a equipe da 4Him Ads.";

  return {
    assunto: "Seu acesso à plataforma — 4Him Ads",
    html: moldura(
      "Bem-vindo",
      p(`Olá, ${params.nome}.`) +
        p(contexto) +
        `<div style="margin:0 0 16px;padding:14px;background:#faf7f2;border:1px solid #e5ddd0;border-radius:8px;font-size:14px">
           <div style="color:#8a8378;font-size:12px">E-mail</div>
           <div style="font-weight:600;margin-bottom:8px">${params.email}</div>
           <div style="color:#8a8378;font-size:12px">Senha temporária</div>
           <div style="font-weight:600;font-family:monospace">${params.senha}</div>
         </div>` +
        `<p style="margin:0 0 18px">${botao("Entrar na plataforma", params.url)}</p>` +
        p(
          `<span style="color:#8a8378;font-size:13px">Troque a senha no primeiro acesso, pelo menu do seu nome.</span>`,
        ),
    ),
    texto: `Olá, ${params.nome}.\n\n${params.cliente ? `Você foi convidado para acompanhar os resultados de ${params.cliente}.` : "Você foi convidado para a equipe da 4Him Ads."}\n\nE-mail: ${params.email}\nSenha temporária: ${params.senha}\n\nAcesse: ${params.url}\n\nTroque a senha no primeiro acesso.`,
  };
}

export function templateFatura(params: {
  nome: string;
  valor: string;
  vencimento: string;
  url: string;
  vencida?: boolean;
}) {
  const titulo = params.vencida ? "Fatura vencida" : "Nova fatura disponível";
  return {
    assunto: `${titulo} — 4Him Ads`,
    html: moldura(
      titulo,
      p(`Olá, ${params.nome}.`) +
        p(
          params.vencida
            ? `A fatura de <strong>${params.valor}</strong>, com vencimento em ${params.vencimento}, está em aberto.`
            : `Sua fatura de <strong>${params.valor}</strong> vence em ${params.vencimento}.`,
        ) +
        `<p style="margin:0 0 18px">${botao("Ver fatura", params.url)}</p>`,
    ),
    texto: `Olá, ${params.nome}.\n\n${params.vencida ? `A fatura de ${params.valor} (venceu em ${params.vencimento}) está em aberto.` : `Sua fatura de ${params.valor} vence em ${params.vencimento}.`}\n\nAcesse: ${params.url}`,
  };
}

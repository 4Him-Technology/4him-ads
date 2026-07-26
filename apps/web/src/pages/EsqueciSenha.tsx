import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { forgotPassword } from "@/lib/api";
import MolduraAuth from "@/components/MolduraAuth";

export default function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);

  const mutation = useMutation({
    mutationFn: () => forgotPassword(email.trim()),
    // A API responde 200 mesmo para e-mail inexistente — de propósito.
    // Mostramos a mesma tela nos dois casos, para não revelar quem tem conta.
    onSettled: () => setEnviado(true),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  if (enviado) {
    return (
      <MolduraAuth titulo="Verifique seu e-mail">
        <div className="space-y-4">
          <p className="flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-800">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Se houver uma conta para <strong>{email}</strong>, enviamos um link para
              redefinir a senha. Ele vale por 1 hora.
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Não chegou? Confira a caixa de spam ou tente novamente em alguns minutos.
          </p>
          <Link
            to="/login"
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para o login
          </Link>
        </div>
      </MolduraAuth>
    );
  }

  return (
    <MolduraAuth
      titulo="Esqueci minha senha"
      descricao="Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha."
    >
      <form onSubmit={enviar} className="space-y-4">
        <label className="block">
          <span className="block text-sm font-medium text-foreground">E-mail</span>
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com.br"
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Enviar link
        </button>

        <Link
          to="/login"
          className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Voltar para o login
        </Link>
      </form>
    </MolduraAuth>
  );
}

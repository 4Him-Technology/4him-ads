import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import MolduraAuth from "@/components/MolduraAuth";
import { ApiError, resetPassword } from "@/lib/api";

function problemaNaSenha(s: string): string | null {
  if (s.length < 8) return "Use ao menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(s)) return "Inclua ao menos uma letra.";
  if (!/[0-9]/.test(s)) return "Inclua ao menos um número.";
  return null;
}

export default function RedefinirSenha() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  const mutation = useMutation({
    mutationFn: () => resetPassword(token, nova),
    onSuccess: () => setPronto(true),
    onError: (err) =>
      setErro(err instanceof ApiError ? err.message : "Não foi possível redefinir a senha"),
  });

  if (!token) {
    return (
      <MolduraAuth titulo="Link inválido">
        <div className="space-y-4">
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            Este link não contém um código válido. Peça um novo link de redefinição.
          </p>
          <Link
            to="/esqueci-senha"
            className="block rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Pedir novo link
          </Link>
        </div>
      </MolduraAuth>
    );
  }

  if (pronto) {
    return (
      <MolduraAuth titulo="Senha redefinida">
        <div className="space-y-4">
          <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-800">
            <Check className="h-4 w-4 shrink-0" />
            Pronto! Já pode entrar com a nova senha.
          </p>
          <Link
            to="/login"
            className="block rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Ir para o login
          </Link>
        </div>
      </MolduraAuth>
    );
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    const problema = problemaNaSenha(nova);
    if (problema) return setErro(problema);
    if (nova !== confirma) return setErro("As senhas não conferem.");

    mutation.mutate();
  }

  return (
    <MolduraAuth titulo="Criar nova senha" descricao="Escolha uma senha que você vai lembrar.">
      <form onSubmit={enviar} className="space-y-4">
        <label className="block">
          <span className="block text-sm font-medium text-foreground">Nova senha</span>
          <input
            type="password"
            required
            autoFocus
            autoComplete="new-password"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Mínimo de 8 caracteres, com letras e números.
          </span>
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-foreground">Repita a senha</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirma}
            onChange={(e) => setConfirma(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        {erro && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </div>
        )}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar nova senha
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

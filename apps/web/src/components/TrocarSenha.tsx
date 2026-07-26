import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import Modal, { Campo, inputClasses } from "@/components/Modal";
import { ApiError, changePassword } from "@/lib/api";

/** Requisitos mínimos — comprimento pesa mais que complexidade. */
function problemaNaSenha(s: string): string | null {
  if (s.length < 8) return "Use ao menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(s)) return "Inclua ao menos uma letra.";
  if (!/[0-9]/.test(s)) return "Inclua ao menos um número.";
  return null;
}

export default function TrocarSenha({
  aberto,
  aoFechar,
}: {
  aberto: boolean;
  aoFechar: () => void;
}) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  const mutation = useMutation({
    mutationFn: () => changePassword(atual, nova),
    onSuccess: () => setPronto(true),
    onError: (err) =>
      setErro(err instanceof ApiError ? err.message : "Não foi possível alterar a senha"),
  });

  function fechar() {
    setAtual("");
    setNova("");
    setConfirma("");
    setErro(null);
    setPronto(false);
    aoFechar();
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    const problema = problemaNaSenha(nova);
    if (problema) return setErro(problema);
    if (nova !== confirma) return setErro("As senhas não conferem.");
    if (nova === atual) return setErro("A nova senha precisa ser diferente da atual.");

    mutation.mutate();
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      titulo={pronto ? "Senha alterada" : "Alterar senha"}
      descricao={pronto ? undefined : "Informe a senha atual para confirmar que é você."}
    >
      {pronto ? (
        <div className="space-y-4">
          <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-800">
            <Check className="h-4 w-4 shrink-0" />
            Pronto. Use a nova senha no próximo acesso.
          </p>
          <button
            type="button"
            onClick={fechar}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Fechar
          </button>
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <Campo label="Senha atual">
            <input
              type="password"
              autoComplete="current-password"
              className={inputClasses}
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
              required
              autoFocus
            />
          </Campo>

          <Campo label="Nova senha" dica="Mínimo de 8 caracteres, com letras e números.">
            <input
              type="password"
              autoComplete="new-password"
              className={inputClasses}
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              required
            />
          </Campo>

          <Campo label="Repita a nova senha">
            <input
              type="password"
              autoComplete="new-password"
              className={inputClasses}
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
              required
            />
          </Campo>

          {erro && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {erro}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={fechar}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Alterar senha
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

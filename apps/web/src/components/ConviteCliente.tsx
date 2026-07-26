import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import Modal, { Campo, inputClasses } from "@/components/Modal";
import { ApiError, inviteClientUser, type Client, type ConviteResultado } from "@/lib/api";

/** Libera o acesso de uma pessoa ao portal de UM cliente. */
export default function ConviteCliente({
  cliente,
  aoFechar,
}: {
  cliente: Client | null;
  aoFechar: () => void;
}) {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ConviteResultado | null>(null);

  const mutation = useMutation({
    mutationFn: (dados: { email: string; nome: string }) => inviteClientUser(cliente!.id, dados),
    onSuccess: setResultado,
    onError: (err) =>
      setErro(err instanceof ApiError ? err.message : "Não foi possível criar o acesso"),
  });

  function fechar() {
    setEmail("");
    setNome("");
    setErro(null);
    setResultado(null);
    aoFechar();
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    mutation.mutate({ email: email.trim(), nome: nome.trim() });
  }

  return (
    <Modal
      aberto={cliente !== null}
      aoFechar={fechar}
      titulo={resultado ? "Acesso criado" : "Dar acesso ao cliente"}
      descricao={resultado ? undefined : `A pessoa verá apenas os dados de ${cliente?.name ?? ""}.`}
    >
      {resultado ? (
        <CredenciaisCriadas resultado={resultado} aoFechar={fechar} />
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <Campo label="Nome da pessoa">
            <input
              className={inputClasses}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Maria Silva"
              required
              minLength={2}
              autoFocus
            />
          </Campo>

          <Campo label="E-mail">
            <input
              type="email"
              className={inputClasses}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@empresa.com.br"
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
              Criar acesso
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Mostra a senha temporária UMA vez. */
function CredenciaisCriadas({
  resultado,
  aoFechar,
}: {
  resultado: ConviteResultado;
  aoFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const texto = `E-mail: ${resultado.email}\nSenha: ${resultado.senhaTemporaria ?? ""}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* o navegador pode bloquear; a pessoa copia manualmente */
    }
  }

  return (
    <div className="space-y-4">
      {resultado.jaExistia ? (
        <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">
          Esta pessoa já tinha conta no sistema. O acesso foi liberado e ela deve entrar com a
          senha que já usa.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
              <KeyRound className="h-3 w-3" />
              Senha temporária
            </p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-muted-foreground">E-mail</dt>
                <dd className="min-w-0 break-all font-medium text-foreground">{resultado.email}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-muted-foreground">Senha</dt>
                <dd className="min-w-0 break-all font-mono font-medium text-foreground">
                  {resultado.senhaTemporaria}
                </dd>
              </div>
            </dl>
          </div>

          <p className="text-xs text-muted-foreground">
            ⚠️ Esta senha aparece <strong>uma única vez</strong>. Copie e envie por um canal
            seguro.
          </p>

          <button
            type="button"
            onClick={() => void copiar()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-muted"
          >
            <Copy className="h-3.5 w-3.5" />
            {copiado ? "Copiado!" : "Copiar dados de acesso"}
          </button>
        </>
      )}

      <button
        type="button"
        onClick={aoFechar}
        className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
      >
        Concluir
      </button>
    </div>
  );
}

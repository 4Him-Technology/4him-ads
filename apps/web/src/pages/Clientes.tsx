import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Copy, KeyRound, Loader2, Plus, UserPlus } from "lucide-react";
import Modal, { Campo, inputClasses } from "@/components/Modal";
import {
  ApiError,
  createClient,
  fetchClients,
  inviteClientUser,
  type Client,
  type ConviteResultado,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/** Gera um identificador a partir do nome: "Padaria do Zé" → "padaria-do-ze". */
function slugify(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const STATUS_LABEL: Record<Client["status"], string> = {
  active: "Ativo",
  paused: "Pausado",
  archived: "Arquivado",
};

export default function Clientes() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [modalNovo, setModalNovo] = useState(false);
  const [clienteConvite, setClienteConvite] = useState<Client | null>(null);

  const { data: clientes, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: fetchClients,
  });

  const recarregar = () => {
    void queryClient.invalidateQueries({ queryKey: ["clients"] });
    void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Clientes</h2>
            <p className="text-sm text-muted-foreground">
              As marcas atendidas pela 4Him e quem pode acompanhá-las
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setModalNovo(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Novo cliente
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !clientes || clientes.length === 0 ? (
        <EstadoVazio aoCriar={() => setModalNovo(true)} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clientes.map((cliente) => (
            <CardCliente
              key={cliente.id}
              cliente={cliente}
              podeConvidar={isAdmin}
              aoConvidar={() => setClienteConvite(cliente)}
            />
          ))}
        </div>
      )}

      <ModalNovoCliente aberto={modalNovo} aoFechar={() => setModalNovo(false)} aoCriar={recarregar} />
      <ModalConvite cliente={clienteConvite} aoFechar={() => setClienteConvite(null)} />
    </div>
  );
}

function EstadoVazio({ aoCriar }: { aoCriar: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <Building2 className="mx-auto h-8 w-8 text-muted-foreground/40" />
      <h3 className="mt-3 font-semibold text-foreground">Nenhum cliente cadastrado</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Cadastre a primeira marca atendida. Depois você conecta as contas de anúncio e
        libera o acesso para o cliente acompanhar.
      </p>
      <button
        type="button"
        onClick={aoCriar}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        Cadastrar cliente
      </button>
    </div>
  );
}

function CardCliente({
  cliente,
  podeConvidar,
  aoConvidar,
}: {
  cliente: Client;
  podeConvidar: boolean;
  aoConvidar: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-foreground">{cliente.name}</h3>
          <p className="truncate text-xs text-muted-foreground">{cliente.slug}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            cliente.status === "active"
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-muted text-muted-foreground",
          )}
        >
          {STATUS_LABEL[cliente.status]}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{cliente.currency}</span>
        <span>·</span>
        <span className="truncate">{cliente.timezone}</span>
      </div>

      {podeConvidar && (
        <button
          type="button"
          onClick={aoConvidar}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Dar acesso ao cliente
        </button>
      )}
    </div>
  );
}

function ModalNovoCliente({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditado, setSlugEditado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createClient,
    onSuccess: () => {
      aoCriar();
      fechar();
    },
    onError: (err) => {
      setErro(err instanceof ApiError ? err.message : "Não foi possível criar o cliente");
    },
  });

  function fechar() {
    setNome("");
    setSlug("");
    setSlugEditado(false);
    setErro(null);
    aoFechar();
  }

  function aoMudarNome(valor: string) {
    setNome(valor);
    if (!slugEditado) setSlug(slugify(valor));
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    mutation.mutate({ name: nome.trim(), slug: slug.trim() });
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      titulo="Novo cliente"
      descricao="A marca que a 4Him vai atender."
    >
      <form onSubmit={enviar} className="space-y-4">
        <Campo label="Nome">
          <input
            className={inputClasses}
            value={nome}
            onChange={(e) => aoMudarNome(e.target.value)}
            placeholder="Padaria do Zé"
            required
            minLength={2}
            autoFocus
          />
        </Campo>

        <Campo
          label="Identificador"
          dica="Usado em endereços e relatórios. Só letras, números e hífens."
        >
          <input
            className={inputClasses}
            value={slug}
            onChange={(e) => {
              setSlugEditado(true);
              setSlug(slugify(e.target.value));
            }}
            placeholder="padaria-do-ze"
            required
            minLength={2}
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
            Criar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalConvite({ cliente, aoFechar }: { cliente: Client | null; aoFechar: () => void }) {
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
      descricao={
        resultado ? undefined : `A pessoa verá apenas os dados de ${cliente?.name ?? ""}.`
      }
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
export function CredenciaisCriadas({
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
            seguro. Se perder, será preciso gerar outra.
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

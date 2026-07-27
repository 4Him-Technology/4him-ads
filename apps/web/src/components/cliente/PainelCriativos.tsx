import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Images,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Modal, { Campo, inputClasses } from "@/components/Modal";
import {
  ApiError,
  createCreative,
  deleteCreative,
  fetchCreatives,
  fetchModelosIa,
  generateCreative,
  updateCreative,
  uploadArquivo,
  type Creative,
  type CreativeFormat,
  type CreativeStatus,
  type ModeloIa,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS: Record<CreativeStatus, { label: string; cor: string }> = {
  draft: { label: "Rascunho", cor: "bg-muted text-muted-foreground" },
  review: { label: "Em aprovação", cor: "bg-amber-500/10 text-amber-700" },
  approved: { label: "Aprovado", cor: "bg-emerald-500/10 text-emerald-700" },
  rejected: { label: "Ajustar", cor: "bg-red-500/10 text-red-700" },
  archived: { label: "Arquivado", cor: "bg-muted text-muted-foreground" },
};

const FORMATOS: { valor: CreativeFormat; rotulo: string }[] = [
  { valor: "feed_quadrado", rotulo: "Feed quadrado (1:1)" },
  { valor: "feed_vertical", rotulo: "Feed vertical (4:5)" },
  { valor: "story", rotulo: "Story / Reels (9:16)" },
  { valor: "paisagem", rotulo: "Paisagem (16:9)" },
  { valor: "outro", rotulo: "Outro" },
];

/** Biblioteca de criativos do cliente: enviar, gerar por IA e aprovar. */
export default function PainelCriativos({ clienteId }: { clienteId: string }) {
  const queryClient = useQueryClient();
  const [modalEnvio, setModalEnvio] = useState(false);
  const [modalIa, setModalIa] = useState(false);

  const { data: criativos, isLoading } = useQuery({
    queryKey: ["creatives", clienteId],
    queryFn: () => fetchCreatives(clienteId),
  });

  const recarregar = () => void queryClient.invalidateQueries({ queryKey: ["creatives", clienteId] });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {criativos?.length ?? 0} peça(s) na biblioteca
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setModalIa(true)}
            className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/10"
          >
            <Sparkles className="h-4 w-4" />
            Gerar com IA
          </button>
          <button
            type="button"
            onClick={() => setModalEnvio(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <Upload className="h-4 w-4" />
            Enviar arquivo
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : !criativos?.length ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <Images className="mx-auto h-7 w-7 text-muted-foreground/40" />
          <h4 className="mt-3 font-semibold text-foreground">Biblioteca vazia</h4>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Envie as peças que vocês produziram ou gere uma com IA a partir do briefing
            deste cliente.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {criativos.map((c) => (
            <CardCriativo key={c.id} criativo={c} aoMudar={recarregar} />
          ))}
        </div>
      )}

      <ModalEnvio
        aberto={modalEnvio}
        clienteId={clienteId}
        aoFechar={() => setModalEnvio(false)}
        aoEnviar={recarregar}
      />
      <ModalIa
        aberto={modalIa}
        clienteId={clienteId}
        aoFechar={() => setModalIa(false)}
        aoGerar={recarregar}
      />
    </div>
  );
}

function CardCriativo({ criativo, aoMudar }: { criativo: Creative; aoMudar: () => void }) {
  const s = STATUS[criativo.status];
  const ehVideo = criativo.type === "video";

  const mudarStatus = useMutation({
    mutationFn: (status: CreativeStatus) => updateCreative(criativo.id, { status }),
    onSuccess: aoMudar,
  });

  const remover = useMutation({
    mutationFn: () => deleteCreative(criativo.id),
    onSuccess: aoMudar,
  });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-square bg-muted">
        {criativo.asset_url ? (
          ehVideo ? (
            <video src={criativo.asset_url} controls className="h-full w-full object-cover" />
          ) : (
            <img
              src={criativo.asset_url}
              alt={criativo.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center">
            <Images className="h-6 w-6 text-muted-foreground/40" />
          </div>
        )}

        {criativo.source === "ai" && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <Sparkles className="h-2.5 w-2.5" />
            IA
          </span>
        )}
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {criativo.name}
          </h4>
          <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase", s.cor)}>
            {s.label}
          </span>
        </div>

        {criativo.headline && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{criativo.headline}</p>
        )}

        <div className="mt-3 flex items-center gap-1.5">
          {criativo.status === "draft" && (
            <button
              type="button"
              onClick={() => mudarStatus.mutate("review")}
              disabled={mudarStatus.isPending}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[11px] font-medium transition hover:bg-muted disabled:opacity-60"
            >
              <Send className="h-3 w-3" />
              Enviar p/ aprovação
            </button>
          )}

          {criativo.status === "review" && (
            <>
              <button
                type="button"
                onClick={() => mudarStatus.mutate("approved")}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-[11px] font-medium text-white transition hover:opacity-90"
              >
                <Check className="h-3 w-3" />
                Aprovar
              </button>
              <button
                type="button"
                onClick={() => mudarStatus.mutate("rejected")}
                className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:bg-muted"
                title="Pedir ajuste"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          )}

          {criativo.status === "approved" && (
            <span className="flex-1 text-center text-[11px] text-emerald-700">
              Pronto para veicular
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              if (confirm(`Excluir "${criativo.name}"?`)) remover.mutate();
            }}
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            title="Excluir"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalEnvio({
  aberto,
  clienteId,
  aoFechar,
  aoEnviar,
}: {
  aberto: boolean;
  clienteId: string;
  aoFechar: () => void;
  aoEnviar: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [nome, setNome] = useState("");
  const [formato, setFormato] = useState<CreativeFormat>("feed_quadrado");
  const [headline, setHeadline] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!arquivo) throw new ApiError(400, "Escolha um arquivo");
      const { uploadUrl } = await createCreative({
        client_id: clienteId,
        name: nome.trim() || arquivo.name,
        type: arquivo.type.startsWith("video") ? "video" : "image",
        format: formato,
        headline: headline.trim() || undefined,
        file_name: arquivo.name,
        mime_type: arquivo.type,
      });
      if (uploadUrl) await uploadArquivo(uploadUrl, arquivo);
    },
    onSuccess: () => {
      aoEnviar();
      fechar();
    },
    onError: (err) => setErro(err instanceof ApiError ? err.message : "Falha ao enviar"),
  });

  function fechar() {
    setArquivo(null);
    setNome("");
    setHeadline("");
    setErro(null);
    aoFechar();
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    mutation.mutate();
  }

  return (
    <Modal aberto={aberto} aoFechar={fechar} titulo="Enviar criativo">
      <form onSubmit={enviar} className="space-y-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-4 py-8 transition hover:border-primary/50"
        >
          <Upload className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-foreground">
            {arquivo ? arquivo.name : "Escolher imagem ou vídeo"}
          </span>
          {arquivo && (
            <span className="text-xs text-muted-foreground">
              {(arquivo.size / 1024 / 1024).toFixed(1)} MB
            </span>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setArquivo(f);
              if (!nome) setNome(f.name.replace(/\.[^.]+$/, ""));
            }
          }}
        />

        <Campo label="Nome da peça">
          <input
            className={inputClasses}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Promoção de dezembro"
            required
          />
        </Campo>

        <Campo label="Formato">
          <select
            className={inputClasses}
            value={formato}
            onChange={(e) => setFormato(e.target.value as CreativeFormat)}
          >
            {FORMATOS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </select>
        </Campo>

        <Campo label="Título do anúncio" dica="Opcional — o texto que aparece na peça.">
          <input
            className={inputClasses}
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
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
            disabled={mutation.isPending || !arquivo}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalIa({
  aberto,
  clienteId,
  aoFechar,
  aoGerar,
}: {
  aberto: boolean;
  clienteId: string;
  aoFechar: () => void;
  aoGerar: () => void;
}) {
  const [pedido, setPedido] = useState("");
  const [modelo, setModelo] = useState<ModeloIa>("imagem_rapida");
  const [formato, setFormato] = useState<CreativeFormat>("feed_quadrado");
  const [erro, setErro] = useState<string | null>(null);

  const modelos = useQuery({ queryKey: ["modelos-ia"], queryFn: fetchModelosIa, enabled: aberto });

  const mutation = useMutation({
    mutationFn: () =>
      generateCreative({ client_id: clienteId, pedido: pedido.trim(), modelo, formato }),
    onSuccess: () => {
      aoGerar();
      fechar();
    },
    onError: (err) => setErro(err instanceof ApiError ? err.message : "Falha na geração"),
  });

  function fechar() {
    setPedido("");
    setErro(null);
    aoFechar();
  }

  const escolhido = modelos.data?.modelos.find((m) => m.chave === modelo);
  const configurado = modelos.data?.configurado ?? true;

  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      titulo="Gerar criativo com IA"
      descricao="O briefing do cliente entra automaticamente no pedido — inclusive as restrições dele."
    >
      {!configurado ? (
        <div className="space-y-4">
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-800">
            A geração por IA ainda não está configurada. Crie uma conta em <strong>fal.ai</strong>,
            gere uma chave e defina <code>FAL_KEY</code> no arquivo <code>.env</code>.
          </p>
          <button
            type="button"
            onClick={fechar}
            className="w-full rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted"
          >
            Fechar
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <Campo label="O que você quer na peça" dica="Descreva a cena, não o texto do anúncio.">
            <textarea
              className={`${inputClasses} min-h-[90px]`}
              value={pedido}
              onChange={(e) => setPedido(e.target.value)}
              placeholder="Pão artesanal recém-saído do forno sobre tábua de madeira, luz da manhã entrando pela janela"
              required
              minLength={5}
              autoFocus
            />
          </Campo>

          <Campo label="Modelo">
            <select
              className={inputClasses}
              value={modelo}
              onChange={(e) => setModelo(e.target.value as ModeloIa)}
            >
              {modelos.data?.modelos.map((m) => (
                <option key={m.chave} value={m.chave}>
                  {m.rotulo}
                </option>
              ))}
            </select>
          </Campo>

          {escolhido && (
            <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              {escolhido.descricao}
              <span className="mt-1 block">
                Custo estimado: <strong className="text-foreground">
                  US$ {escolhido.custoAprox.toFixed(3)}
                </strong> por geração
              </span>
            </p>
          )}

          <Campo label="Formato">
            <select
              className={inputClasses}
              value={formato}
              onChange={(e) => setFormato(e.target.value as CreativeFormat)}
            >
              {FORMATOS.filter((f) => f.valor !== "outro").map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </select>
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
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Gerar
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

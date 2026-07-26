import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth";
import { asset } from "@/lib/utils";

export default function Login() {
  const { user, carregando, entrar } = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (carregando) return <TelaCarregando />;
  if (user) {
    const destino = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={destino} replace />;
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const min = Math.ceil((err.retryAfterSeconds ?? 900) / 60);
        setErro(`Muitas tentativas. Aguarde ${min} minuto(s) e tente de novo.`);
      } else if (err instanceof ApiError) {
        setErro(err.message);
      } else {
        setErro("Não foi possível conectar. Verifique sua internet.");
      }
      setSenha("");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Painel da marca */}
      <div
        className="hidden lg:flex flex-col justify-between p-10 relative overflow-hidden"
        style={{ backgroundColor: "#000000" }}
      >
        <img
          src={asset("images/logo-full.png")}
          alt="4Him Technology"
          className="h-14 w-auto object-contain"
        />

        <div className="relative z-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#c49a3c]/70">
            Ads · Tráfego Pago
          </p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight text-[#f5f0e8]">
            Todo o seu tráfego
            <br />
            em um só lugar.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[#f5f0e8]/50">
            Campanhas, verba, criativos e resultados de todas as plataformas —
            reunidos, acompanhados e aprovados sem sair do sistema.
          </p>
        </div>

        <p className="text-[10px] text-white/25">
          © {new Date().getFullYear()} 4Him Technology
        </p>

        {/* brilho dourado ao fundo */}
        <div
          className="pointer-events-none absolute -bottom-40 -left-20 h-96 w-96 rounded-full blur-3xl"
          style={{ backgroundColor: "rgba(150,104,44,0.18)" }}
        />
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm">
          <img
            src={asset("images/logo-icon.png")}
            alt=""
            className="lg:hidden mb-6 h-12 w-12 object-contain"
          />

          <h2 className="text-2xl font-bold text-foreground">Entrar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Acesse o painel de tráfego pago da 4Him.
          </p>

          <form onSubmit={aoEnviar} className="mt-8 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="voce@empresa.com.br"
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="senha" className="block text-sm font-medium text-foreground">
                  Senha
                </label>
                <Link
                  to="/esqueci-senha"
                  className="text-xs text-muted-foreground transition hover:text-primary"
                >
                  Esqueci minha senha
                </Link>
              </div>
              <div className="relative mt-1.5">
                <input
                  id="senha"
                  type={verSenha ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setVerSenha((v) => !v)}
                  aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  {verSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {erro && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {enviando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Entrando…
                </>
              ) : (
                "Entrar"
              )}
            </button>
          </form>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <LockKeyhole className="h-3 w-3" />
            Acesso restrito — contas criadas pela equipe 4Him.
          </p>
        </div>
      </div>
    </div>
  );
}

function TelaCarregando() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

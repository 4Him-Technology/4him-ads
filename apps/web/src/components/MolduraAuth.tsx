import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { asset } from "@/lib/utils";

/** Moldura das telas de acesso (login, recuperação), com a marca 4Him. */
export default function MolduraAuth({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Painel da marca */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex"
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
            Campanhas, verba, criativos e resultados de todas as plataformas — reunidos,
            acompanhados e aprovados sem sair do sistema.
          </p>
        </div>

        <p className="text-[10px] text-white/25">© {new Date().getFullYear()} 4Him Technology</p>

        <div
          className="pointer-events-none absolute -bottom-40 -left-20 h-96 w-96 rounded-full blur-3xl"
          style={{ backgroundColor: "rgba(150,104,44,0.18)" }}
        />
      </div>

      {/* Conteúdo */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <img
            src={asset("images/logo-icon.png")}
            alt=""
            className="mb-6 h-12 w-12 object-contain lg:hidden"
          />

          <h2 className="text-2xl font-bold text-foreground">{titulo}</h2>
          {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}

          <div className="mt-8">{children}</div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <LockKeyhole className="h-3 w-3" />
            Acesso restrito — contas criadas pela equipe 4Him.
          </p>
        </div>
      </div>
    </div>
  );
}

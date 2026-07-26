import { CalendarDays } from "lucide-react";
import type { Periodo } from "@/lib/api";
import { cn } from "@/lib/utils";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Atalhos usados no dia a dia da operação. */
export const PERIODOS = {
  hoje: () => {
    const h = new Date();
    return { inicio: iso(h), fim: iso(h) };
  },
  "7d": () => {
    const f = new Date();
    const i = new Date();
    i.setDate(i.getDate() - 6);
    return { inicio: iso(i), fim: iso(f) };
  },
  "30d": () => {
    const f = new Date();
    const i = new Date();
    i.setDate(i.getDate() - 29);
    return { inicio: iso(i), fim: iso(f) };
  },
  mes: () => {
    const h = new Date();
    return { inicio: iso(new Date(h.getFullYear(), h.getMonth(), 1)), fim: iso(h) };
  },
} as const;

export type ChavePeriodo = keyof typeof PERIODOS;

const ROTULOS: Record<ChavePeriodo, string> = {
  hoje: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
  mes: "Este mês",
};

export default function SeletorPeriodo({
  atual,
  aoMudar,
}: {
  atual: ChavePeriodo;
  aoMudar: (chave: ChavePeriodo, periodo: Periodo) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
      <CalendarDays className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {(Object.keys(PERIODOS) as ChavePeriodo[]).map((chave) => (
        <button
          key={chave}
          type="button"
          onClick={() => aoMudar(chave, PERIODOS[chave]())}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-xs font-medium transition",
            atual === chave
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {ROTULOS[chave]}
        </button>
      ))}
    </div>
  );
}

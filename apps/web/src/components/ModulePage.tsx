import type { LucideIcon } from "lucide-react";

/**
 * Casca padrão de um módulo ainda não implementado.
 * Mantém o layout consistente enquanto os conectores e o banco não estão prontos.
 */
export default function ModulePage({
  icon: Icon,
  title,
  description,
  planned,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  planned: string[];
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground/80">
        🚧 Módulo <strong className="text-primary">em construção</strong>. O layout e o modelo de
        dados já estão prontos — falta plugar os conectores de plataforma e o banco.
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Previsto para este módulo
        </h3>
        <ul className="space-y-2.5">
          {planned.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-foreground/80">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

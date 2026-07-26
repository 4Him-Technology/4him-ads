import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Compass className="h-7 w-7" />
      </span>
      <div>
        <h2 className="text-2xl font-bold text-foreground">Página não encontrada</h2>
        <p className="text-sm text-muted-foreground">
          A rota que você tentou abrir não existe neste painel.
        </p>
      </div>
      <Link
        to="/"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Voltar ao dashboard
      </Link>
    </div>
  );
}

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * Protege as rotas internas.
 *
 * Isto é conveniência de navegação, NÃO é a segurança: quem realmente
 * barra o acesso aos dados é a API (cookie de sessão) e o RLS no banco.
 * Mesmo que alguém force a rota no navegador, não vem dado nenhum.
 */
export default function ProtectedRoute({ somenteStaff = false }: { somenteStaff?: boolean }) {
  const { user, carregando, isStaff } = useAuth();
  const location = useLocation();

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (somenteStaff && !isStaff) {
    return <Navigate to="/portal" replace />;
  }

  return <Outlet />;
}

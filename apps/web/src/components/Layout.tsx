import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Menu, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchHealth } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, navForUser, titleForPath, type NavItem } from "@/lib/nav";

const GOLD = "#96682c";

function NavLink({
  item,
  isActive,
  onClick,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
  collapsed: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const highlight = isActive || hovered;
  const Icon = item.icon;

  return (
    <Link
      to={item.path}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200 px-3 py-2.5",
        collapsed && "justify-center",
      )}
      style={{
        color: highlight ? GOLD : "rgba(255,255,255,0.65)",
        backgroundColor: highlight ? "rgba(150,104,44,0.15)" : "transparent",
        border: isActive ? "1px solid rgba(150,104,44,0.3)" : "1px solid transparent",
      }}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && item.soon && (
        <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/40">
          em breve
        </span>
      )}
    </Link>
  );
}

/**
 * Indicador de conexão. Mostra apenas se o sistema responde —
 * nunca qual tecnologia está por trás.
 */
function ApiStatus() {
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth, retry: false });

  if (health.isSuccess) {
    // Tudo certo: não polui a barra. O aviso aparece só quando há problema.
    return null;
  }

  const carregando = health.isLoading;

  return (
    <span
      title={carregando ? "Verificando conexão" : "Sem conexão com o servidor"}
      className="hidden sm:flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground"
    >
      <span className={cn("h-2 w-2 rounded-full", carregando ? "bg-muted-foreground" : "bg-red-500")} />
      {carregando ? "conectando…" : "sem conexão"}
    </span>
  );
}

/**
 * Identificação do usuário. Clicar abre o menu com a opção de sair.
 */
function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { user, role, sair } = useAuth();
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!aberto) return;

    const aoClicarFora = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };

    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  if (!user) return null;

  const nome = user.profile.full_name || user.profile.email;
  const iniciais =
    nome
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || null;

  const papel = role ? (ROLE_LABELS[role] ?? role) : "Acesso de cliente";

  const avatar = (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
      style={{ backgroundColor: "rgba(150,104,44,0.2)", color: GOLD }}
    >
      {iniciais ?? <User className="h-4 w-4" />}
    </span>
  );

  return (
    <div ref={containerRef} className="relative">
      {/* Menu suspenso — abre para cima, pois fica no rodapé da barra */}
      {aberto && (
        <div
          role="menu"
          className={cn(
            "absolute bottom-full z-50 mb-2 min-w-[13rem] overflow-hidden rounded-lg border border-white/10 shadow-xl",
            collapsed ? "left-0" : "left-0 right-0",
          )}
          style={{ backgroundColor: "#141414" }}
        >
          <div className="border-b border-white/10 px-3 py-2.5">
            <p className="truncate text-xs font-medium text-white/90">{nome}</p>
            <p className="truncate text-[11px] text-white/40">{user.profile.email}</p>
            <span
              className="mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: "rgba(150,104,44,0.2)", color: GOLD }}
            >
              {papel}
            </span>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAberto(false);
              void sair();
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            Sair da conta
          </button>
        </div>
      )}

      {/* Gatilho */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        title={collapsed ? `${nome} — abrir menu` : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg py-2 transition",
          collapsed ? "justify-center px-1" : "px-2",
        )}
        style={{ backgroundColor: aberto ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)" }}
      >
        {avatar}
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-xs font-medium text-white/80">{nome}</span>
              <span className="block truncate text-[10px] text-white/40">{papel}</span>
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-white/40 transition-transform duration-200",
                aberto && "rotate-180",
              )}
            />
          </>
        )}
      </button>
    </div>
  );
}

/** Seletor de cliente — alimentado pelos clientes que o usuário pode ver. */
function ClientSelector() {
  const { user } = useAuth();
  const clientes = user?.clients ?? [];

  if (clientes.length === 0) {
    return (
      <span className="hidden sm:inline text-xs text-muted-foreground">
        nenhum cliente cadastrado
      </span>
    );
  }

  return (
    <select className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground">
      {clientes.length > 1 && <option value="">Todos os clientes</option>}
      {clientes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export default function Layout() {
  const location = useLocation();
  const { isStaff } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const closeMobile = () => setMobileOpen(false);
  const itens = navForUser(isStaff);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Overlay mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={closeMobile} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 flex flex-col transition-all duration-300",
          collapsed ? "w-16" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
        style={{ backgroundColor: "#000000" }}
      >
        <div className="absolute inset-0 bg-black/30 z-0" />

        {/* Toggle colapsar */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 z-20 w-6 h-6 rounded-full flex items-center justify-center shadow-lg border border-white/20 transition-colors hover:opacity-90"
          style={{ backgroundColor: GOLD }}
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3 text-white" />
          ) : (
            <ChevronLeft className="w-3 h-3 text-white" />
          )}
        </button>

        {/* Logo */}
        <div className="relative z-10 flex items-center justify-center px-4 py-5 border-b border-white/10">
          {/* logo-full-white.png tem fundo branco chapado — na sidebar preta usamos
              logo-full.png (fundo #000) e o ícone, que é de fato transparente. */}
          <img
            src={collapsed ? "/images/logo-icon.png" : "/images/logo-full.png"}
            alt="4Him Technology"
            className={cn("object-contain drop-shadow-2xl", collapsed ? "h-10 w-10" : "h-14 w-auto")}
          />
        </div>

        {/* Rótulo do produto */}
        {!collapsed && (
          <div className="relative z-10 px-4 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
              Ads · Tráfego Pago
            </span>
          </div>
        )}

        {/* Navegação */}
        <nav className="relative z-10 flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {itens.map((item) => (
            <NavLink
              key={item.path}
              item={item}
              // Rotas filhas de cliente mantêm "Clientes" destacado.
              isActive={
                item.path === "/clientes"
                  ? location.pathname.startsWith("/clientes")
                  : location.pathname === item.path
              }
              onClick={closeMobile}
              collapsed={collapsed}
            />
          ))}
        </nav>

        {/* Rodapé */}
        <div className="relative z-10 space-y-2 border-t border-white/10 px-3 py-3">
          <UserMenu collapsed={collapsed} />
          {!collapsed && (
            <p className="text-[10px] text-white/30 text-center">4Him Technology · Ads v0.1</p>
          )}
        </div>
      </aside>

      {/* Conteúdo */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card flex items-center px-4 lg:px-6 gap-4 shrink-0">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-muted"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-sm font-semibold text-foreground">
              {titleForPath(location.pathname)}
            </h1>
          </div>
          <ClientSelector />
          <ApiStatus />
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

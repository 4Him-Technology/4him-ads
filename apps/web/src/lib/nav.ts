import {
  BadgeCheck,
  Bell,
  Building2,
  CircleDollarSign,
  Images,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Plug,
  Settings,
  Tags,
  UserCog,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Módulo ainda não implementado — mostra selo "em breve". */
  soon?: boolean;
  /** Só aparece para a equipe da agência. */
  staffOnly?: boolean;
}

/**
 * Menu único e plano.
 *
 * Sem agrupamentos: a operação é pequena e o clique a mais para abrir um
 * grupo custa mais do que a organização economiza. As duas primeiras
 * entradas são as que se usa o dia inteiro.
 */
export const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Visão geral", icon: LayoutDashboard },
  { path: "/clientes", label: "Clientes", icon: Building2 },
  { path: "/campanhas", label: "Campanhas", icon: Megaphone, soon: true, staffOnly: true },
  { path: "/criativos", label: "Criativos", icon: Images, soon: true, staffOnly: true },
  { path: "/tarefas", label: "Tarefas", icon: ListChecks, soon: true, staffOnly: true },
  { path: "/alertas", label: "Alertas", icon: Bell, soon: true, staffOnly: true },
  { path: "/aprovacoes", label: "Aprovações", icon: BadgeCheck, soon: true },
  { path: "/cobranca", label: "Cobrança", icon: CircleDollarSign, staffOnly: true },
  { path: "/planos", label: "Planos", icon: Tags, staffOnly: true },
  { path: "/usuarios", label: "Usuários", icon: UserCog, soon: true, staffOnly: true },
  { path: "/conexoes", label: "Conexões", icon: Plug, soon: true, staffOnly: true },
  { path: "/configuracoes", label: "Configurações", icon: Settings, soon: true, staffOnly: true },
];

/** Título da barra superior para a rota atual. */
export function titleForPath(pathname: string): string {
  // Rota de cliente específico: o título vem do próprio cliente na tela.
  if (pathname.startsWith("/clientes/")) return "Cliente";
  return NAV_ITEMS.find((item) => item.path === pathname)?.label ?? "4Him Ads";
}

/**
 * Menu conforme o perfil. O cliente vê apenas o que lhe diz respeito.
 * (Esconder é usabilidade — quem barra o acesso de fato é a API e o RLS.)
 */
export function navForUser(isStaff: boolean): NavItem[] {
  return isStaff ? NAV_ITEMS : NAV_ITEMS.filter((item) => !item.staffOnly);
}

export const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gestor de tráfego",
  analyst: "Analista",
  client: "Cliente",
};

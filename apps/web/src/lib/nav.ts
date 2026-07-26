import {
  BadgeCheck,
  Bell,
  Building2,
  CircleDollarSign,
  Eye,
  Handshake,
  Images,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Plug,
  Settings,
  Settings2,
  Tags,
  Target,
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

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  /** Grupo inteiro restrito à equipe da agência. */
  staffOnly?: boolean;
}

/**
 * Navegação em grupos (mesmo padrão do CRM, que agrupa por vertical).
 * Aqui os grupos refletem os dois mundos de usuário do produto —
 * a equipe 4Him que opera e o cliente que acompanha/aprova — mais a administração.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operação",
    icon: Target,
    items: [
      { path: "/", label: "Dashboard", icon: LayoutDashboard },
      { path: "/campanhas", label: "Campanhas", icon: Megaphone, soon: true, staffOnly: true },
      { path: "/criativos", label: "Criativos", icon: Images, soon: true, staffOnly: true },
      { path: "/tarefas", label: "Tarefas", icon: ListChecks, soon: true, staffOnly: true },
      { path: "/alertas", label: "Alertas", icon: Bell, soon: true, staffOnly: true },
    ],
  },
  {
    label: "Portal do Cliente",
    icon: Handshake,
    items: [
      { path: "/portal", label: "Visão do Cliente", icon: Eye, soon: true },
      { path: "/aprovacoes", label: "Aprovações", icon: BadgeCheck, soon: true },
    ],
  },
  {
    label: "Financeiro",
    icon: CircleDollarSign,
    staffOnly: true,
    items: [
      { path: "/cobranca", label: "Cobrança", icon: CircleDollarSign },
      { path: "/planos", label: "Planos", icon: Tags },
    ],
  },
  {
    label: "Administração",
    icon: Settings2,
    staffOnly: true,
    items: [
      { path: "/clientes", label: "Clientes", icon: Building2 },
      { path: "/conexoes", label: "Conexões", icon: Plug, soon: true },
      { path: "/usuarios", label: "Usuários", icon: UserCog, soon: true },
      { path: "/configuracoes", label: "Configurações", icon: Settings, soon: true },
    ],
  },
];

/** Título exibido na barra superior para a rota atual. */
export function titleForPath(pathname: string): string {
  for (const group of NAV_GROUPS) {
    const match = group.items.find((item) => item.path === pathname);
    if (match) return match.label;
  }
  return "4Him Ads";
}

/**
 * Menu conforme o perfil de quem entrou.
 * O cliente não vê os módulos de operação nem a administração.
 * (Esconder é usabilidade — quem barra o acesso de fato é a API e o RLS.)
 */
export function navForUser(isStaff: boolean): NavGroup[] {
  if (isStaff) return NAV_GROUPS;

  return NAV_GROUPS.filter((group) => !group.staffOnly)
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.staffOnly) }))
    .filter((group) => group.items.length > 0);
}

/** Rótulo amigável do papel, para exibir no menu do usuário. */
export const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gestor de tráfego",
  analyst: "Analista",
  client: "Cliente",
};

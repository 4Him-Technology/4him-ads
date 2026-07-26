import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  type UserContext as UserContextData,
  type UserOrganization,
} from "./api";

/**
 * Estado de autenticação do app.
 *
 * A verdade sobre "quem sou eu" vem sempre da API (`/auth/me`), nunca de
 * algo guardado no navegador — não há token nem dados de sessão em
 * localStorage. Se o cookie não valer mais, a API responde 401 e o app
 * volta para a tela de login.
 */

interface AuthValue {
  user: UserContextData | null;
  carregando: boolean;
  /** Papel na primeira organização (a agência). */
  role: UserOrganization["role"] | null;
  /** É da equipe da agência (vs. usuário do lado cliente). */
  isStaff: boolean;
  /** Papéis com poder administrativo. */
  isAdmin: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const AUTH_KEY = ["auth", "me"] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<UserContextData | null>({
    queryKey: AUTH_KEY,
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const loginMutation = useMutation({
    mutationFn: ({ email, senha }: { email: string; senha: string }) => apiLogin(email, senha),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTH_KEY });
    },
  });

  const entrar = useCallback(
    async (email: string, senha: string) => {
      await loginMutation.mutateAsync({ email, senha });
    },
    [loginMutation],
  );

  const sair = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      /* mesmo se o servidor falhar, encerramos a sessão local */
    }
    // Zera o usuário na hora — não basta limpar o cache, porque o valor já
    // renderizado continuaria na tela até uma nova busca terminar.
    queryClient.setQueryData(AUTH_KEY, null);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
  }, [queryClient]);

  const value = useMemo<AuthValue>(() => {
    const user = data ?? null;
    const org = user?.organizations?.[0] ?? null;
    const role = org?.role ?? null;
    const isStaff = Boolean(user?.profile.is_agency_staff) || (role !== null && role !== "client");

    return {
      user,
      carregando: isLoading,
      role,
      isStaff,
      isAdmin: role === "owner" || role === "admin",
      entrar,
      sair,
    };
  }, [data, isLoading, entrar, sair]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}

export { ApiError };

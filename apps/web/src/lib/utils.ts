import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Junta classes Tailwind resolvendo conflitos (padrão shadcn/ui). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Caminho de um arquivo da pasta `public`, respeitando o caminho base.
 *
 * Caminho absoluto (`/images/logo.png`) quebra quando o site é publicado
 * numa subpasta — como no GitHub Pages, em `/4him-ads/`. `BASE_URL` já
 * traz a barra final.
 */
export function asset(caminho: string): string {
  return `${import.meta.env.BASE_URL}${caminho.replace(/^\//, "")}`;
}

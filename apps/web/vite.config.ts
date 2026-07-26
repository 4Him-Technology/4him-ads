import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],

  // No GitHub Pages o site fica em /4him-ads/, não na raiz do domínio.
  base: mode === "pages" ? "/4him-ads/" : "/",

  build: {
    // O padrão do Vite exige navegador bem recente. Navegador desatualizado
    // não avisa: simplesmente não executa o script e a tela fica em branco.
    // Este alvo cobre versões bem mais antigas sem custo perceptível.
    target: ["es2019", "chrome79", "edge79", "firefox70", "safari13"],
  },

  resolve: {
    alias: {
      // Mesma convenção do CRM: `@/lib/utils`, `@/components/...`
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // 5173 fica ocupada por outro projeto desta máquina — o ADS roda na 5174.
    port: 5174,
    strictPort: true,
    proxy: {
      // Sem reescrita: a API expõe as rotas sob /api tanto em
      // desenvolvimento quanto em produção. Assim o caminho é idêntico
      // nos dois ambientes e não há surpresa no deploy.
      "/api": { target: "http://localhost:3333", changeOrigin: true },
    },
  },
}));

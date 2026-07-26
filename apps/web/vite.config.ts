import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
});

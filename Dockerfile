# ============================================================
# 4him Ads — imagem única (API + site)
#
# Um serviço só: a API serve o site e as rotas /api. Isso dá uma URL
# única, dispensa CORS e já entrega o endereço público que o webhook do
# Asaas precisa.
#
# Quando o front migrar para o AWS Amplify, basta parar de copiar o
# build do site aqui — a API continua igual.
# ============================================================

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app

# Instala dependências primeiro: aproveita o cache do Docker enquanto
# os manifestos não mudam.
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json      apps/api/
COPY apps/web/package.json      apps/web/
COPY packages/shared/package.json    packages/shared/
COPY packages/connectors/package.json packages/connectors/
RUN npm ci

COPY . .
RUN npm run build

# Descarta as dependências de desenvolvimento antes de copiar adiante.
RUN npm prune --omit=dev

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Não roda como root.
RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/node_modules      ./node_modules
COPY --from=build --chown=app:app /app/package.json      ./package.json
COPY --from=build --chown=app:app /app/apps/api/dist     ./apps/api/dist
COPY --from=build --chown=app:app /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=app:app /app/apps/web/dist     ./apps/web/dist
COPY --from=build --chown=app:app /app/packages          ./packages

USER app
EXPOSE 3333

# A porta vem do ambiente na maioria das hospedagens.
ENV API_PORT=3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:${API_PORT}/api/health || exit 1

CMD ["node", "apps/api/dist/index.js"]

# 4him Ads

Plataforma **SaaS de gestão de tráfego pago** da **4Him Technology**. Unifica relatórios, gestão de campanhas/verba, alertas e biblioteca de criativos em um único sistema conectado ao **Meta Ads** (e, nas próximas fases, Google/TikTok/LinkedIn).

Multi-tenant: a **equipe 4Him** opera e o **cliente** acompanha e aprova.

## Stack

- **Web:** React 18 + Vite 6 + TypeScript + Tailwind + TanStack Query
- **API:** Node + Fastify 5 + TypeScript + Zod
- **Dados/Auth:** Supabase (Postgres + Auth + RLS) — camada isolada para migrar à AWS depois
- **Monorepo:** npm workspaces + Turborepo

## Estrutura

```
apps/
  web/        painel da agência + portal do cliente
  api/        REST + orquestração dos conectores de plataforma
packages/
  shared/     tipos, enums e schemas Zod compartilhados
supabase/
  migrations/ schema do banco (multi-tenant + RLS)
```

## Começando

Pré-requisito: Node 20+.

```bash
npm install
cp .env.example .env   # preencha as chaves (no Windows: copy .env.example .env)
npm run dev            # sobe web (:5173) e api (:3333) em paralelo
```

- Web: http://localhost:5173
- API health: http://localhost:3333/health

## Banco de dados (Supabase)

As migrations ficam em `supabase/migrations/`. Aplicar via Supabase CLI (`supabase db push`) ou colando o SQL no editor do projeto, **na ordem**:

1. `0001_core.sql` — organizações, perfis, memberships, clients, client_access + helpers RLS
2. `0002_ads.sql` — conexões, contas, campanhas → ad sets → ads, criativos, métricas
3. `0003_ops.sql` — tarefas, aprovações, alertas, auditoria
4. `0004_rls.sql` — habilita RLS + políticas

## Roadmap

- **Fase 0 — Fundação (atual):** monorepo, modelo de dados multi-tenant + RLS, shell do painel.
- **Fase 1 — Conector Meta:** OAuth, sync de contas/campanhas/insights (leitura).
- **Fase 2 — Dashboard unificado:** métricas consolidadas, filtros por cliente/período.
- **Fase 3 — Portal do cliente:** acompanhamento + aprovações de criativos.
- **Fase 4 — Gestão de campanhas (escrita Meta):** editar budget, pause/resume (pós App Review).
- **Fase 5 — Alertas & anomalias:** regras + notificações.
- **Fase 6 — Biblioteca de criativos:** organização + performance por criativo.
- **Fase 7 — Novas plataformas:** Google, TikTok, LinkedIn (mesmo contrato de conector).

Documentação viva no Obsidian: `Conciencia_Obisidian/projetos/4him Ads/`.

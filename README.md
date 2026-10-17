# InjetaFlow ERP

ERP para injeção plástica (Wamovale): portal público + ERP com login por e-mail e senha, permissões por módulo, CRUD persistente em todos os módulos, RH/ponto e solicitações do site.

## Rodar no seu computador (Fedora, Ubuntu, macOS) em 5 passos

Pré-requisitos: **Node.js 20 ou mais novo** e **pnpm 10** (no Fedora: `sudo dnf install nodejs git` e depois `corepack enable`). Não precisa de banco de dados nem de variáveis de ambiente.

```bash
git fetch origin
git checkout feat/mvp-funcional
pnpm install
pnpm dev
```

1. Abra **http://localhost:3000** (site público). A área interna fica em **http://localhost:3000/erp**.
2. **Como entrar:** no primeiro `pnpm dev`, o terminal mostra um quadro *“InjetaFlow: administrador inicial”* com o e-mail (`admin@wamovale.local`) e uma **senha gerada, mostrada só nessa vez**. Logo abaixo aparecem os usuários de demonstração (Gestor, Supervisor, Operador, Consulta) e a senha deles. Copie e guarde.
3. Prefere escolher as senhas? Antes do primeiro `pnpm dev`, rode `INJETAFLOW_ADMIN_PASSWORD='sua-senha-forte' INJETAFLOW_DEMO_PASSWORD='outra-senha' pnpm dev` (ou coloque essas linhas num arquivo `.env`, veja `.env.example`).
4. Perdeu a senha? Rode `pnpm erp:reset-senha` (gera outra e mostra no terminal) ou `pnpm erp:reset-senha email@do.usuario`.
5. Os dados ficam em `.data/` (ignorada pelo git). Para recomeçar do zero, pare o servidor e apague essa pasta.

Porta 3000 ocupada? Use `PORT=3001 pnpm dev`. Dados de exemplo aparecem com o selo **DEMO**; para não carregá-los, use `INJETAFLOW_SEED_DEMO=false` no primeiro start.

## Comandos

- `pnpm dev`: servidor de desenvolvimento (Vite + Express + tRPC), porta `PORT` (padrão 3000).
- `pnpm build` / `pnpm start`: build de produção e servidor (`dist/`).
- `pnpm lint` / `pnpm check` / `pnpm test`: ESLint, TypeScript e testes (Vitest).
- `pnpm test:e2e`: testes ponta a ponta (Playwright; sobe o app na porta 3100 com dados descartáveis em `.data-e2e`). Na primeira vez: `pnpm exec playwright install chromium`.
- `pnpm erp:reset-senha [email]`: redefine a senha de um usuário local.

## Arquitetura do MVP

- Catálogo único de módulos em `shared/erp/modules.ts` (campos, colunas, filtros, permissões): gera os formulários do front e a validação Zod do servidor. Regras numéricas em `shared/erp/numbers.ts`.
- Persistência atrás da interface `DataRepository` (`server/erp/repository.ts`): hoje `JsonFileRepository` (arquivo JSON local com escrita atômica) e `MemoryRepository` (testes). Toda consulta é filtrada por `empresaId`. Para migrar para Supabase/Postgres, basta implementar a mesma interface e trocá-la em `server/erp/store.ts`; nenhuma migration foi criada ou aplicada.
- Sessão: senha com scrypt, token aleatório guardado como hash, cookie `httpOnly` + `SameSite=Lax` (Secure em https/produção), validade de 12 h, bloqueio após 5 tentativas erradas em 15 min.
- Permissões por módulo (`ver`/`editar`) checadas no servidor (tRPC) e no front (guarda de rota + 403).

---

React / Express / tRPC / Drizzle starter, adapted from the Sandbox web-db-user template.

## Documentação para desenvolvimento no Cursor

O contexto profissional do produto está em [`docs/00-indice.md`](docs/00-indice.md). Comece por [`AGENTS.md`](AGENTS.md), depois consulte as regras de domínio, segurança, UX, arquitetura e testes antes de implementar módulos. O prompt completo para o Cursor está em [`docs/11-prompt-mestre-cursor.md`](docs/11-prompt-mestre-cursor.md).

O MVP funcional (branch `feat/mvp-funcional`) já tem autenticação real, permissões persistidas e auditoria no backend. Integrações industriais (balanças, IoT, fiscal) e a migração para Supabase são os próximos incrementos.

- `pnpm dev`: development server; honors `PORT` (default 3000).
- `pnpm build` / `pnpm start`: build and serve `dist/index.js` and `dist/public/`.
- `pnpm db:migrate`: apply checked-in migrations. `pnpm db:push`: generate and apply new schema changes.
- `pnpm check` / `pnpm test`: types and application tests.

Start with the Webdev skill's default-template guide. Platform login, storage, payments and service contracts live in its shared references; read the relevant capability before extending its helper.

`server/_core/publicConfig.ts` exposes only named public runtime values. Private keys stay server-side. The platform serves managed `/manus-storage/` assets; the application does not register a second proxy.

Platform configuration is readable and editable through `webdev.config`. Default settings are initial values, not enforced constraints. The agent may modify the files, commands and configuration or follow the flexible guide for another stack.

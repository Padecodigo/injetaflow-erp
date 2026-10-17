# InjetaFlow ERP

ERP para injeção plástica (Wamovale): portal público + ERP com login por e-mail, nome de usuário ou matrícula + senha, permissões por módulo, CRUD persistente em todos os módulos, RH/ponto e solicitações do site.

## Rodar no seu computador (Fedora, Ubuntu, macOS) em 5 passos

Pré-requisitos: **Node.js 20 ou mais novo** e **pnpm 10** (no Fedora: `sudo dnf install nodejs git` e depois `corepack enable`). Não precisa de banco de dados nem de variáveis de ambiente.

```bash
git fetch origin
git checkout main
git pull
pnpm install
pnpm dev
```

1. Abra **http://localhost:3000** (site público). A área interna fica em **http://localhost:3000/erp**.
2. **Como entrar:** no primeiro `pnpm dev`, o terminal mostra um quadro *“InjetaFlow: administrador inicial”* com o usuário `admin` (também vale o e-mail `admin@wamovale.local` ou a matrícula `ADM-0001`) e uma **senha gerada, mostrada só nessa vez**. Logo abaixo aparecem os usuários de demonstração (Gestor, Supervisor, Operador, Consulta) e a senha deles. Copie e guarde.
3. Prefere escolher as senhas? Antes do primeiro `pnpm dev`, rode `INJETAFLOW_ADMIN_PASSWORD='sua-senha-forte' INJETAFLOW_DEMO_PASSWORD='outra-senha' pnpm dev` (ou coloque essas linhas num arquivo `.env`, veja `.env.example`).
4. Perdeu a senha? Pare o `pnpm dev` e rode `pnpm erp:reset-senha` (gera outra e mostra no terminal) ou `pnpm erp:reset-senha <e-mail | usuário | matrícula>`. Veja [Redefinir senha e usuário do admin](#redefinir-senha-e-usuário-do-admin).
5. Os dados ficam em `.data/` (ignorada pelo git). Para recomeçar do zero, pare o servidor e apague essa pasta.

Porta 3000 ocupada? Use `PORT=3001 pnpm dev`. Dados de exemplo aparecem com o selo **DEMO**; para não carregá-los, use `INJETAFLOW_SEED_DEMO=false` no primeiro start.

## Comandos

- `pnpm dev`: servidor de desenvolvimento (Vite + Express + tRPC), porta `PORT` (padrão 3000).
- `pnpm build` / `pnpm start`: build de produção e servidor (`dist/`).
- `pnpm lint` / `pnpm check` / `pnpm test`: ESLint, TypeScript e testes (Vitest).
- `pnpm test:e2e`: testes ponta a ponta (Playwright; sobe o app na porta 3100 com dados descartáveis em `.data-e2e`). Na primeira vez: `pnpm exec playwright install chromium`.
- `pnpm erp:reset-senha [e-mail | usuário | matrícula] [--username novo] [--manter-senha]`: redefine a senha (e opcionalmente o nome de usuário) de um usuário local.
- `pnpm erp:restaurar-usuario [--listar | e-mail | usuário | matrícula | id]`: restaura um usuário excluído logicamente.

## Login, nome de usuário e Meu perfil

- A tela de login tem **um campo só**: *E-mail, usuário ou matrícula*, mais a senha. O servidor descobre o tipo: com `@` é e-mail; sem `@`, procura primeiro o nome de usuário e depois a matrícula. Maiúsculas e minúsculas não importam. A mensagem de erro é sempre genérica.
- **Nome de usuário** (`username`): único por empresa, sem diferenciar maiúsculas, 3 a 40 caracteres (`a-z`, `0-9`, `.`, `_`, `-`) e não pode coincidir com a matrícula de outra pessoa. Na primeira subida desta versão, os dados existentes são migrados automaticamente, sem perda: cada usuário recebe um nome de usuário derivado do e-mail (`maria.silva@...` → `maria.silva`) e o administrador mais antigo de cada empresa recebe `admin`. Uma instalação nova já cria o admin com usuário `admin`.
- **Senha:** mínimo de 6 caracteres (cadastro, troca, redefinição e script).
- **Meu perfil:** cada pessoa troca a própria senha (a senha atual é obrigatória) e o próprio nome de usuário. Matrícula, e-mail, perfil, setor e permissões aparecem só para leitura, e o servidor também recusa essas alterações.
- **Usuários (administrador):** o administrador altera qualquer campo de qualquer usuário: matrícula, usuário, e-mail, perfil, setor, módulos, status e redefinição de senha. Toda alteração é auditada (antes → depois, inclusive quais módulos entraram ou saíram; a senha nunca aparece).
- **Regras contra escalada de privilégio** (valem no servidor, em criar, editar e excluir; a tela só reflete):
  - só o Administrador cria, edita, desativa ou exclui administradores e atribui o perfil Administrador (para os demais, a opção nem aparece e as ações na linha do admin ficam desabilitadas);
  - quem não é administrador e tem "Usuários: editar" não altera matrícula e só concede módulos que ele próprio possui, no mesmo nível ("ver" se ele só vê); módulos que a pessoa já tinha continuam;
  - ninguém altera o próprio perfil, módulos ou status, nem o administrador (peça a outro administrador); ninguém exclui o próprio usuário;
  - a empresa nunca fica sem administrador ativo: o último não pode ser excluído, desativado nem rebaixado.
- Na auditoria, ações sem sessão aparecem com o autor certo: **Sistema (migração)**, **Sistema (inicialização)** (1º start) e **Linha de comando** (scripts).
- O apontamento rápido da produção por matrícula continua separado e não abre sessão no ERP.

## Redefinir senha e usuário do admin

Pare o `pnpm dev` antes (o servidor mantém os dados em memória e sobrescreveria a mudança). Para escolher a senha sem gravá-la em arquivo nem no histórico do shell:

```bash
read -rsp 'Nova senha do admin: ' INJETAFLOW_ADMIN_PASSWORD; echo
export INJETAFLOW_ADMIN_PASSWORD
INJETAFLOW_ADMIN_USERNAME=admin pnpm erp:reset-senha ADM-0001
unset INJETAFLOW_ADMIN_PASSWORD
```

- O identificador pode ser e-mail, nome de usuário ou matrícula. Sem ele, o script usa o administrador mais antigo (ou `INJETAFLOW_RESET_USER`).
- `--username novo` (ou `INJETAFLOW_ADMIN_USERNAME`) define o nome de usuário. `--manter-senha` troca só o nome de usuário.
- A senha vinda de `INJETAFLOW_ADMIN_PASSWORD` **nunca** é impressa. Sem essa variável, o script gera uma senha forte e mostra uma única vez.
- O script também reativa a conta e registra a ação na auditoria (autor "Linha de comando").

## Restaurar um usuário excluído

A exclusão é lógica (nada é apagado). Para trazer de volta alguém excluído por engano, inclusive um administrador, pare o `pnpm dev` e rode:

```bash
pnpm erp:restaurar-usuario --listar          # mostra os excluídos (id, e-mail, usuário, matrícula, quando e por quem)
pnpm erp:restaurar-usuario ADM-0001          # restaura por e-mail, nome de usuário, matrícula ou id
```

Ele recusa a restauração se o e-mail ou a matrícula já estiverem com outra pessoa ativa. Se o nome de usuário antigo foi reaproveitado, gera outro livre. A senha e o status anteriores são mantidos; para trocar a senha depois, use `pnpm erp:reset-senha <identificador>`. A restauração vai para a auditoria com o autor "Linha de comando".

## Arquitetura do MVP

- Catálogo único de módulos em `shared/erp/modules.ts` (campos, colunas, filtros, permissões): gera os formulários do front e a validação Zod do servidor. Regras numéricas em `shared/erp/numbers.ts`.
- Persistência atrás da interface `DataRepository` (`server/erp/repository.ts`): hoje `JsonFileRepository` (arquivo JSON local com escrita atômica) e `MemoryRepository` (testes). Toda consulta é filtrada por `empresaId`. Para migrar para Supabase/Postgres, basta implementar a mesma interface e trocá-la em `server/erp/store.ts`; nenhuma migration foi criada ou aplicada.
- Sessão: senha com scrypt, token aleatório guardado como hash, cookie `httpOnly` + `SameSite=Lax` (Secure em https/produção), validade de 12 h, bloqueio após 5 tentativas erradas em 15 min (por IP + identificador normalizado, além de limites por identificador e por conta, sem importar se a pessoa digitou e-mail, usuário ou matrícula). Senha mínima: 6 caracteres.
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

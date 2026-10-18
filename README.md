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

Porta 3000 ocupada? Use `PORT=3001 pnpm dev`. Dados de exemplo aparecem com o selo **DEMO**; para não carregá-los, use `INJETAFLOW_SEED_DEMO=false` no primeiro start. As marcações de ponto de demonstração (origem "Demonstração") só são criadas com `NODE_ENV=development` ou `test` (o `pnpm dev` já define development); com `NODE_ENV` ausente ou `production` não são criadas. Para ligá-las explicitamente, use `INJETAFLOW_SEED_DEMO_PONTO=1` (e `=0` para desligar). O ERP não registra ponto: a origem oficial das marcações é o relógio (REP).

## Comandos

- `pnpm dev`: servidor de desenvolvimento (Vite + Express + tRPC), porta `PORT` (padrão 3000).
- `pnpm build` / `pnpm start`: build de produção e servidor (`dist/`).
- `pnpm lint` / `pnpm check` / `pnpm test`: ESLint, TypeScript e testes (Vitest).
- `pnpm test:e2e`: testes ponta a ponta (Playwright; sobe o app na porta 3100 com dados descartáveis em `.data-e2e`). Na primeira vez: `pnpm exec playwright install chromium`.
- `pnpm erp:reset-senha [e-mail | usuário | matrícula] [--username novo] [--manter-senha]`: redefine a senha (e opcionalmente o nome de usuário) de um usuário local.
- `pnpm erp:restaurar-usuario [--listar | e-mail | usuário | matrícula | id]`: restaura um usuário excluído logicamente.

## Login, nome de usuário e Meu perfil

- A tela de login tem **um campo só**: *E-mail, usuário ou matrícula*, mais a senha. O servidor descobre o tipo: com `@` é e-mail; sem `@`, procura primeiro o nome de usuário e depois a matrícula. Maiúsculas e minúsculas não importam. A mensagem de erro é sempre genérica.
- **Escopo de empresa (B-08):** nome de usuário e matrícula são únicos só dentro da empresa, então cada tentativa é conferida em **uma** empresa: a informada em `/erp?empresa=<id>` (ou `/login?empresa=<id>`); sem ela, a única empresa que tem o identificador ou, se houver mais de uma, a empresa padrão da instalação (`INJETAFLOW_PUBLIC_EMPRESA`, padrão `wamovale`). A senha nunca é testada em várias empresas. O e-mail é único no sistema todo; ao cadastrar um e-mail já usado (nesta ou em outra empresa), a mensagem é neutra ("Este e-mail não pode ser usado").
- **Nome de usuário** (`username`): único por empresa, sem diferenciar maiúsculas, 3 a 40 caracteres (`a-z`, `0-9`, `.`, `_`, `-`) e não pode coincidir com a matrícula de outra pessoa. Na primeira subida desta versão, os dados existentes são migrados automaticamente, sem perda: cada usuário recebe um nome de usuário derivado do e-mail (`maria.silva@...` → `maria.silva`) e o administrador mais antigo de cada empresa recebe `admin`. Uma instalação nova já cria o admin com usuário `admin`.
- **Senha:** mínimo de 6 caracteres (cadastro, troca, redefinição e script).
- **Meu perfil:** cada pessoa troca a própria senha (a senha atual é obrigatória) e o próprio nome de usuário. Matrícula, e-mail, perfil, setor e permissões aparecem só para leitura, e o servidor também recusa essas alterações.
- **Usuários (administrador):** o administrador altera qualquer campo de qualquer usuário: matrícula (inclusive a própria), usuário, e-mail, perfil, setor, módulos, status e redefinição de senha. Trocar a **própria** senha, e-mail ou nome de usuário pela tela de Usuários exige a senha atual, como em Meu perfil (B-02); 5 senhas atuais erradas em 15 minutos bloqueiam por 15 minutos (B-12). A troca de matrícula aparece destacada na auditoria, e a aprovação de ocorrências usa o ID do usuário: trocar a própria matrícula não libera analisar a própria ocorrência (B-03). Toda alteração é auditada (antes → depois, inclusive quais módulos entraram ou saíram; a senha nunca aparece).
- **Regras contra escalada de privilégio** (valem no servidor, em criar, editar e excluir; a tela só reflete):
  - só o Administrador cria, edita, desativa ou exclui administradores e atribui o perfil Administrador (para os demais, a opção nem aparece e as ações na linha do admin ficam desabilitadas);
  - quem não é administrador e tem "Usuários: editar" não altera matrícula e só concede módulos que ele próprio possui, no mesmo nível ("ver" se ele só vê); módulos que a pessoa já tinha continuam;
  - quem não é administrador só altera (qualquer campo: módulos, perfil, nome, setor, senha, e-mail, usuário, status) ou exclui quem tem acesso **estritamente menor** que o dele (B-01). Quem tem acesso maior **ou igual** fica com o administrador: na tela o formulário fica travado e o servidor recusa e registra a tentativa na auditoria. Isso fecha o caminho "rebaixar e depois trocar a senha";
  - ninguém altera o próprio perfil, módulos ou status, nem o administrador (peça a outro administrador); ninguém exclui o próprio usuário;
  - a empresa nunca fica sem administrador ativo: o último não pode ser excluído, desativado nem rebaixado.
- Na auditoria, ações sem sessão aparecem com o autor certo: **Sistema (migração)**, **Sistema (inicialização)** (1º start) e **Linha de comando** (scripts).
- O apontamento rápido da produção por matrícula continua separado e não abre sessão no ERP.
- **Auditoria (B-07):** edições de registros guardam o antes → depois de cada campo (sem senha); exportações CSV (usuários, módulos, relatório de ponto) registram quem, o quê, filtros e quantidade; falhas de login, logins negados e bloqueios ficam registrados com o identificador e o IP (nunca a senha). A coleção de auditoria é só de inclusão: o repositório recusa editar, excluir ou purgar.
- **Cabeçalhos HTTP (B-06):** `Content-Security-Policy` (em desenvolvimento libera o inline e o WebSocket do Vite), `frame-ancestors 'none'` + `X-Frame-Options: DENY`, HSTS só com `NODE_ENV=production`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` e `Cache-Control: no-store` na API. Lotes do tRPC acima de 50 procedimentos por requisição são recusados.
- **Estáticos do build:** saem com brotli ou gzip (conforme o `Accept-Encoding`, arquivos de texto acima de 1 KB, comprimidos uma vez e guardados em memória), `ETag`/304 e cache: `/assets/*` (nome com hash) `max-age=1 ano, immutable`; `index.html` e o fallback da SPA `no-cache`; demais arquivos 1 hora. Sem dependência nova (`server/_core/static.ts`).
- **Logs de depuração do modo dev:** o coletor do navegador (`.manus-logs/`, fora do git) mascara `senha`, `password`, `token`, `authorization`, `cookie`, `secret` e similares antes de gravar, no navegador e de novo no servidor (`server/_core/redact.ts`).

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
pnpm erp:restaurar-usuario --listar          # mostra os excluídos (id, e-mail, usuário, matrícula, quando, em horário de Brasília, e por quem)
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

# Manual completo para iniciante — Fedora + Cursor + Grok + GitHub

Este manual parte do zero. Você não precisa saber programar para seguir a instalação, organizar o projeto e enviar o prompt inicial para os agentes. Faça os passos na ordem. Quando aparecer um bloco de comando, copie o bloco inteiro para o Terminal e pressione Enter.

## O que vamos fazer

Ao final, você terá o Cursor instalado, o Git configurado, uma pasta do InjetaFlow aberta, o código enviado para um repositório privado no GitHub, GitHub Actions preparado e uma rotina para dividir o trabalho entre agentes Grok/Cursor por módulo.

O projeto real usará Next.js, TypeScript, Tailwind CSS e Supabase/PostgreSQL. O ZIP inclui a documentação, prompts, regras, migration inicial e templates de GitHub.

## Regra importante antes de começar

Não envie senhas, tokens, chaves do Supabase, `service_role key`, dados reais de funcionários ou documentos da empresa para chats. Nunca coloque segredos no GitHub.

O pacote que você baixará nesta conversa é:

`injetaflow-cursor-grok-professional.zip`

Baixe-o para a pasta **Downloads** do Fedora. Não extraia ainda.

---

## Parte 1 — Abrir o Terminal

No Fedora, pressione:

```text
Ctrl + Alt + T
```

Se esse atalho não abrir, pressione a tecla **Super** — normalmente tem o símbolo do Windows — e procure por **Terminal**.

Você verá uma janela preta ou escura. É nela que os comandos serão executados.

---

## Parte 2 — Atualizar o Fedora

Copie e cole:

```bash
sudo dnf upgrade --refresh -y
```

O Fedora pode pedir sua senha. Digite a senha mesmo que nada apareça na tela e pressione Enter.

Depois instale os programas básicos:

```bash
sudo dnf install -y git curl unzip tar gcc-c++ make
```

Confirme as versões:

```bash
git --version
curl --version | head -1
unzip -v | head -1
```

Se aparecer uma versão para cada comando, essa parte está funcionando.

---

## Parte 3 — Instalar o Cursor no Fedora

A página oficial do Cursor oferece pacote RPM para Fedora/RHEL e informa que o pacote do sistema fornece atalho, atualização automática e ferramentas de linha de comando. Use o repositório oficial abaixo, não um instalador aleatório.[1] [2]

No Terminal, copie tudo:

```bash
sudo tee /etc/yum.repos.d/cursor.repo << 'EOF'
[cursor]
name=Cursor
baseurl=https://downloads.cursor.com/yumrepo
enabled=1
gpgcheck=1
gpgkey=https://downloads.cursor.com/keys/anysphere.asc
EOF

sudo dnf install -y cursor
```

Depois abra o Cursor pelo menu do Fedora. Procure por **Cursor**.

Na primeira abertura:

1. Crie ou use sua conta do Cursor.
2. Faça login.
3. Aceite as configurações padrão.
4. Se o Cursor perguntar sobre tema, escolha o que preferir.

Se o comando acima der erro, use o caminho oficial alternativo:

1. Abra https://cursor.com/download.
2. Na área Linux, baixe **Linux RPM x64** se seu computador for Intel/AMD comum.
3. Se seu computador for ARM, baixe **Linux RPM ARM64**.
4. Abra a pasta Downloads pelo gerenciador de arquivos.
5. Clique duas vezes no arquivo `.rpm`.
6. Instale pelo aplicativo de software do Fedora.

Para conferir a arquitetura do computador:

```bash
uname -m
```

`x86_64` significa Intel/AMD. `aarch64` significa ARM64.

---

## Parte 4 — Instalar Node.js e pnpm

O projeto usa JavaScript/TypeScript. Node.js executa o projeto; pnpm instala as dependências. O pnpm atual recomenda Node.js 22.13 ou superior quando instalado por npm.[3]

Primeiro tente o caminho simples do Fedora:

```bash
sudo dnf install -y nodejs npm
node --version
npm --version
```

Se o Node aparecer como versão 22 ou superior, instale o pnpm:

```bash
sudo npm install --global pnpm
pnpm --version
```

Se o Fedora instalar uma versão antiga de Node.js, use o instalador do nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 22
nvm alias default 22
node --version
npm --version
npm install --global pnpm
pnpm --version
```

Se o comando `nvm` não for reconhecido depois da instalação, feche o Terminal, abra outro e rode:

```bash
nvm install 22
nvm alias default 22
```

O resultado esperado é Node 22.x e pnpm funcionando.

---

## Parte 5 — Preparar a pasta do projeto

Crie uma pasta chamada `Projetos` dentro da sua pasta pessoal:

```bash
mkdir -p ~/Projetos/injetaflow-erp
```

Agora copie o ZIP baixado para essa pasta. O comando abaixo funciona se o arquivo estiver na pasta Downloads:

```bash
cp ~/Downloads/injetaflow-cursor-grok-professional.zip ~/Projetos/injetaflow-erp/
```

Entre na pasta e extraia:

```bash
cd ~/Projetos/injetaflow-erp
unzip -o injetaflow-cursor-grok-professional.zip
```

Confira se os arquivos principais existem:

```bash
ls -la
ls -la docs
ls -la .github
```

Você deve ver arquivos como:

```text
AGENTS.md
CONTEXT.md
CONTRIBUTING.md
PROGRESS.md
.cursorrules
.cursor/
.github/
docs/
supabase/
```

Se o ZIP criou uma subpasta dentro de outra, descubra com:

```bash
find ~/Projetos/injetaflow-erp -maxdepth 2 -type f -name AGENTS.md -print
```

A pasta correta é aquela que contém `AGENTS.md`, `docs/` e `.github/` diretamente.

---

## Parte 6 — Abrir a pasta no Cursor

Pelo Terminal, já dentro da pasta correta, rode:

```bash
cd ~/Projetos/injetaflow-erp
cursor .
```

Se `cursor .` não funcionar, abra o Cursor pelo menu e escolha:

```text
File → Open Folder → Projetos → injetaflow-erp
```

No lado esquerdo do Cursor, confirme que você consegue ver `AGENTS.md`, `docs`, `.cursor`, `.github` e `supabase`.

Não abra somente a pasta `docs`. Abra a pasta raiz do projeto.

---

## Parte 7 — Configurar o Git pela primeira vez

O Git registra o histórico das alterações. No Terminal do Cursor, abra **Terminal → New Terminal** e rode:

```bash
git config --global user.name "SEU NOME"
git config --global user.email "SEU EMAIL DO GITHUB"
git config --global init.defaultBranch main
```

Substitua `SEU NOME` e `SEU EMAIL DO GITHUB` pelos seus dados. Exemplo:

```bash
git config --global user.name "João da Silva"
git config --global user.email "joao@email.com"
```

Confira:

```bash
git config --global --list
```

Não use o e-mail de outra pessoa.

---

## Parte 8 — Criar o repositório no GitHub

Abra https://github.com no navegador e faça login.

1. Clique no botão **+** no canto superior direito.
2. Escolha **New repository**.
3. Nome sugerido: `injetaflow-erp`.
4. Escolha **Private**.
5. Não marque README.
6. Não adicione `.gitignore` pelo site.
7. Não adicione licença agora.
8. Clique em **Create repository**.

A documentação do GitHub recomenda criar o repositório vazio quando você já possui os arquivos localmente.[4]

---

## Parte 9 — Enviar os arquivos para o GitHub

Volte ao Terminal do Cursor e confirme que está na pasta do projeto:

```bash
cd ~/Projetos/injetaflow-erp
pwd
```

O resultado deve terminar com:

```text
/Projetos/injetaflow-erp
```

Inicialize o Git:

```bash
git init -b main
git add .
git commit -m "chore: iniciar documentacao do injetaFlow"
```

Agora conecte ao GitHub. Troque `SEU_USUARIO` pelo seu nome de usuário do GitHub:

```bash
git remote add origin https://github.com/SEU_USUARIO/injetaflow-erp.git
git remote -v
git push -u origin main
```

O GitHub pode abrir uma janela de login ou pedir autenticação. Não coloque tokens em arquivos do projeto.

Se aparecer erro dizendo que `origin` já existe, use:

```bash
git remote set-url origin https://github.com/SEU_USUARIO/injetaflow-erp.git
git push -u origin main
```

Depois atualize a página do GitHub. Os arquivos devem aparecer no repositório.

---

## Parte 10 — Fazer a primeira leitura no Cursor

No Cursor, abra o Agent. A documentação oficial recomenda começar pedindo ao Cursor para explicar a base antes de fazer alterações.[2]

Cole esta mensagem primeiro:

```text
Leia AGENTS.md, CONTEXT.md e docs/00-indice.md. Não altere nenhum arquivo ainda. Explique em português simples o que é o InjetaFlow ERP, qual é a stack oficial, como funciona o sistema Lego de módulos ativos por empresa, quais são os módulos existentes na documentação e quais são os próximos passos recomendados. Ao final, diga qual documento devo ler antes de iniciar o primeiro módulo.
```

Leia a resposta. Se o Cursor tentar programar sem você pedir, diga:

```text
Não implemente ainda. Apenas faça análise e aguarde minha autorização.
```

---

## Parte 11 — Copiar e colar o prompt START

Depois da primeira leitura, abra no Cursor:

```text
docs/22-prompt-start-grok-cursor.md
```

Copie o conteúdo dentro do bloco de código e cole no Agent. O prompt começa com:

```text
Você está entrando no projeto InjetaFlow ERP. Antes de responder ou alterar qualquer arquivo:
```

O agente deverá responder apenas com entendimento, stack, estrutura, riscos, plano e arquivos que pretende alterar. Ele não deve implementar ainda.

Essa pausa é importante. Você primeiro revisa o plano. Se estiver correto, responda:

```text
Plano aprovado. Agora implemente somente a fundação de empresas, usuários, módulos ativos e auditoria, seguindo a migration Supabase existente. Antes de codificar, confirme os arquivos que serão criados e os testes que serão escritos.
```

---

## Parte 12 — Como trabalhar com os bots por módulo

Não peça para vários bots editarem a mesma branch ao mesmo tempo. Cada bot deve trabalhar em uma branch própria e em um módulo definido.

A divisão inicial recomendada é:

```text
plataforma       Next.js, Supabase, Auth, RLS e CI/CD
empresas         tenants, unidades e módulos ativos
usuarios         perfis, permissões e auditoria
rh               colaboradores, ponto, GPS e jornadas
producao         OP, ciclos, setup, refugo e OEE
qualidade        inspeção, BPF/GMP, CoA, CEP e RNC
estoque          lotes, WMS, pesagem e inventário
manutencao       ativos, moldes, OS e calibração
financeiro       contas, caixa, custos e margem
fiscal-contabil  fiscal, contábil, SPED e Bloco K
compliance       SST, meio ambiente, licenças e documentos
qa               testes, segurança, integração e E2E
```

Para cada bot, crie uma branch antes do trabalho:

```bash
git checkout main
git pull origin main
git checkout -b feat/nome-do-modulo
```

No prompt do bot, abra:

```text
docs/23-prompt-agente-modulo.md
```

Copie o conteúdo e substitua os campos `[NOME_DO_MODULO]`, `[DIRETÓRIOS_PERMITIDOS]`, `[DESCRIÇÃO DA FEATURE]` e os demais campos.

Exemplo para o agente de RH:

```text
Você é o agente responsável pelo módulo rh do InjetaFlow ERP.

ESCOPO
Você pode alterar somente: src/modules/rh/, src/app/(app)/rh/, supabase/migrations/ e testes diretamente relacionados ao RH.

TAREFA
Implemente o cadastro inicial de funcionários e o registro de ponto pelo celular. O registro deve armazenar usuário, data/hora UTC, unidade, status, dispositivo e evidência configurada. Não implemente GPS contínuo. Documente a política de privacidade como pendência de validação.

SEGURANÇA
Use tenant e unidade derivados da sessão. Exija permissão. Toda alteração exige número de registro e auditoria. Dados de saúde e localização são restritos.

VALIDAÇÃO
Crie teste unitário, teste de integração e teste E2E da jornada de ponto. Teste usuário sem permissão, módulo RH desligado, registro inválido e tenant incorreto.
```

O agente deve devolver código em uma branch, não editar `main` diretamente.

---

## Parte 13 — Regra obrigatória para bugs e mudanças

Você deve exigir esta regra em toda conversa com qualquer bot:

```text
Regra obrigatória: toda mudança deve criar ou atualizar teste unitário e teste de integração. Toda mudança que alterar a jornada do usuário também deve ter teste E2E. Todo bug deve ser reproduzido primeiro por um teste de regressão que falhe; depois da correção, esse teste deve passar e permanecer no projeto. Não considere a tarefa concluída sem executar typecheck, testes e build.
```

Para um bug, o processo é:

1. Reproduzir o problema.
2. Criar teste de regressão.
3. Confirmar que o teste falha.
4. Corrigir a causa.
5. Confirmar que o teste passa.
6. Criar ou atualizar teste de integração.
7. Rodar a suíte relevante.
8. Abrir Pull Request.

---

## Parte 14 — Commit e Pull Request

Quando um bot terminar:

```bash
git status
git diff --check
pnpm check
pnpm test
pnpm build
git add .
git commit -m "feat(rh): adicionar fundacao do ponto"
git push -u origin feat/nome-do-modulo
```

Depois abra o GitHub, escolha a branch e clique em **Compare & pull request**.

No Pull Request:

- Explique o que foi feito.
- Informe o módulo.
- Liste migrations.
- Liste permissões e auditoria.
- Informe os testes unitários e de integração.
- Informe o teste de regressão quando houver bug.
- Coloque screenshots se houve mudança visual.
- Descreva riscos e rollback.

O GitHub Actions deve executar a pipeline. Só faça merge se o CI estiver verde.

---

## Parte 15 — Entender o GitHub Actions

O arquivo principal é:

```text
.github/workflows/ci.yml
```

Ele foi preparado para executar instalação, typecheck, testes e build. Depois que o novo app Next.js estiver criado, confirme que o `package.json` possui scripts compatíveis:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "check": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Se os nomes forem diferentes, ajuste o workflow ou os scripts, mas não desative o CI para esconder erros.

---

## Parte 16 — O que não fazer

Não usar a mesma branch para todos os bots. Não deixar dois bots editarem a mesma migration sem coordenação. Não aceitar código sem testes. Não colocar chaves secretas no projeto. Não usar dados reais de funcionários nos testes. Não liberar um módulo apenas escondendo o menu. Não aceitar regra fiscal, sanitária ou trabalhista inventada pela IA sem validação profissional.

---

## Prompt final de início

Depois de abrir o projeto no Cursor, fazer login, enviar os arquivos ao GitHub e ler a documentação, copie e cole exatamente:

```text
Você está entrando no projeto InjetaFlow ERP.

Leia AGENTS.md, CONTEXT.md, docs/00-indice.md, docs/15-stack-tecnologica.md, docs/16-catalogo-modulos.md, docs/19-desenvolvimento-profissional-github.md, docs/20-multiagentes-grok-cursor.md, docs/21-github-actions-e-cicd.md e docs/23-prompt-agente-modulo.md.

Não altere nenhum arquivo ainda. Faça uma análise inicial em português simples e responda apenas com:

1. O que é o produto.
2. Qual é a stack oficial.
3. Como funciona o sistema Lego de módulos ativos por empresa.
4. Quais são os módulos e agentes recomendados.
5. Qual é a estrutura de pastas recomendada.
6. Quais riscos técnicos, de segurança, LGPD, RH, GPS, fiscal e BPF/GMP devem ser considerados.
7. Qual seria a primeira fundação técnica.
8. Quais arquivos pretende criar ou alterar.

Regra obrigatória de qualidade: toda mudança deve criar ou atualizar teste unitário e teste de integração. Toda mudança de jornada deve ter teste E2E. Todo bug deve começar com um teste de regressão que reproduza o problema antes da correção. Não implemente nada até eu aprovar o plano.
```

Quando o agente terminar essa análise, você poderá enviar a tarefa da fundação ou entregar o módulo a um bot específico.

## Referências oficiais

[1]: https://cursor.com/download "Download oficial do Cursor"
[2]: https://cursor.com/docs/get-started/quickstart "Cursor Quickstart oficial"
[3]: https://pnpm.io/installation "Instalação oficial do pnpm"
[4]: https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github "GitHub: adicionar projeto local"
[5]: https://cli.github.com/manual/gh_auth_login "GitHub CLI: autenticação"

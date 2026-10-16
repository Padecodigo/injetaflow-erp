# Plano de implementação — InjetaFlow ERP

## Escopo
Criar um protótipo web gerenciado e navegável de um ERP SaaS para indústria de injeção plástica, com telas de operação e gestão baseadas nas funcionalidades do CSV fornecido pelo usuário. O primeiro incremento é visual e interativo, usando dados demonstrativos realistas; integrações, persistência e autenticação ficam fora deste incremento.

## Abordagem de implementação
- Usar o starter React + TypeScript + Vite já provisionado.
- Criar uma shell de aplicação com sidebar fixa, topbar contextual, busca global, notificações e perfil.
- Mapear rotas do MVP para Dashboard, Produção, Qualidade, Estoque, Manutenção, Ordens, Financeiro e Configurações; todas compartilham a mesma shell.
- Usar dados locais tipados para demonstrar KPIs, alertas, ordens de produção, lotes, moldes e atividades.
- Usar Lucide React para ícones consistentes e CSS próprio em `client/src/index.css` para o acabamento visual.
- Manter o protótipo responsivo: sidebar recolhe em telas menores, cartões se reorganizam e tabelas permitem rolagem horizontal.
- Incluir `public/manus-routes.json` com o conjunto de rotas navegáveis.

## Direção visual escolhida
### Opções consideradas
- **Industrial neo-utility (0,06):** dashboard claro, sidebar marinho, teal elétrico e sinais de status em coral/lima.
- **Control room dark (0,04):** interface predominantemente escura com neon e visual de sala de controle.
- **Soft modular (0,08):** tons pastel, cartões arredondados e foco em colaboração.

Escolha: **Industrial neo-utility**.

- **Movimento de design:** neo-brutalismo utilitário refinado, inspirado em painéis industriais e produtos SaaS contemporâneos.
- **Princípios:** hierarquia por contraste; informação acionável primeiro; densidade confortável; microinterações que confirmam estado.
- **Filosofia de cor:** marinho quase-preto cria confiança e foco; superfície fria reduz ruído; teal elétrico marca ações e performance; coral e âmbar reservam urgência para eventos que pedem atenção.
- **Paradigma de layout:** navegação vertical persistente + canvas modular assimétrico, com um bloco de visão geral, uma coluna de alertas e listas operacionais abaixo.
- **Elementos assinatura:** marca “IF” em monograma hexagonal; badges de status em cápsula; barras de progresso com “tick” de meta.
- **Interação:** cada item navegável comunica claramente estado hover/ativo; filtros e busca são rápidos e reversíveis; ações primárias aparecem no contexto da tela.
- **Animação:** entrada suave dos módulos, hover de 150ms, progresso e contadores sem exagero; evitar animações que atrapalhem leitura no chão de fábrica.
- **Tipografia:** Inter para interface e números; títulos com peso 750, labels compactos em caixa alta e letter-spacing controlado.
- **Essência de marca:** “o cockpit enxuto para transformar cada ciclo em margem”; ágil, claro, industrial.
- **Voz:** direta, confiante e prática. Exemplos: “A fábrica está no ritmo.” / “Resolva o gargalo antes do próximo ciclo.”
- **Marca/logotipo:** monograma IF com duas barras diagonais dentro de um hexágono aberto, sugerindo fluxo de material e ciclo contínuo.
- **Cor proprietária:** teal elétrico `#11C7B1`.

## Estrutura
- `client/src/App.tsx`: composição do router e providers.
- `client/src/pages/Home.tsx`: shell, dados demonstrativos, dashboard e páginas de módulo.
- `client/src/index.css`: tokens, layout, componentes visuais e breakpoints.
- `client/public/manus-routes.json`: manifesto das páginas.
- `app.config.ts`: identidade visual do projeto para o checkpoint.

## Fluxo de build e entrega
- Rodar `pnpm check` e `pnpm build:static`.
- Iniciar `pnpm dev:static` na porta configurada para o Preview.
- Verificar HTTP do Preview e o manifesto `/manus-routes.json`.
- Criar checkpoint com os arquivos do incremento; publicação fica separada e não será acionada automaticamente.

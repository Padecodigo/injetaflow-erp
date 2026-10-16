# Política de acesso e direção visual — Wamovale

## 1. Separação público x privado

### Área pública

A área pública deve funcionar como o novo site institucional da Wamovale, sem expor informações operacionais, dados de clientes ou indicadores reais da fábrica.

Rotas públicas previstas:

- Página inicial institucional;
- Quem somos;
- Produtos e aplicações;
- Injeção plástica;
- Moldes e ferramentaria;
- Materiais e pigmentos;
- Qualidade institucional, em formato comercial e não operacional;
- Cotação/orçamento;
- Contato;
- Trabalhe conosco;
- Entrada da Área do colaborador.

A página pública pode apresentar uma **visão geral comercial** da capacidade da empresa, mas não deve exibir o dashboard real, OEE, ordens, estoque, lotes, produção em tempo real, nomes de colaboradores ou alertas internos.

### Área privada

A Área do colaborador exige login e autorização por perfil. Todos os módulos operacionais ficam protegidos:

- Dashboard operacional;
- Produção e linhas de injeção;
- Ordens de produção;
- Moldes e ferramentaria;
- Matéria-prima;
- Pigmentos e cores;
- Qualidade operacional, inspeções, não conformidades e quarentena;
- Estoque e rastreabilidade;
- Manutenção;
- RH e ponto;
- Financeiro;
- Usuários e acessos;
- Configurações;
- Meu perfil e histórico pessoal.

O número de registro funcional identifica apontamentos rápidos. Ele não substitui login, senha, autorização de módulo ou sessão autenticada.

## 2. Regra de segurança

Mesmo que exista uma rota operacional conhecida, o acesso direto pela URL deve redirecionar para a entrada protegida quando não houver sessão válida. A autorização final deverá ser aplicada no backend/Supabase por tenant, usuário, perfil e permissão; esconder um botão no frontend nunca será considerado controle de segurança.

## 3. Direção visual sem alterar a marca

A revisão visual deve preservar integralmente:

- Logo oficial da Wamovale;
- Cores institucionais existentes;
- Proporções e legibilidade da marca;
- Tom industrial, técnico e confiável.

Não utilizar fotografias genéricas de banco de imagens.

### Linguagem visual recomendada

- Ilustrações vetoriais e diagramas de processo;
- Formas abstratas inspiradas em moldes, cavidades, gotas de resina e fluxo de material;
- Silhuetas técnicas de tampas, frascos, moldes e componentes;
- Gráficos e microanimações discretas para explicar processo e capacidade;
- Texturas geométricas, linhas de engenharia e padrões de repetição;
- Imagens reais somente quando forem fornecidas ou aprovadas pela Wamovale, como fotos próprias de máquinas, produtos ou equipe.

A página atual usa principalmente composição CSS, cartões e formas abstratas; essa direção deve ser mantida e refinada, sem substituir a identidade por fotos ou imagens de outra empresa.

## 4. Critério de revisão

Toda alteração visual deve responder a pelo menos uma destas perguntas:

1. Ajuda um cliente a entender a capacidade da Wamovale?
2. Reforça precisão, qualidade, engenharia ou confiança?
3. Mantém logo e cores reconhecíveis?
4. Evita parecer um template genérico de indústria?
5. Continua legível, rápida e funcional em celular?

# Varredura funcional do preview e checklist dos bots

## Escopo percorrido

Foi percorrido o portal institucional, os CTAs principais, o formulário de cotação, a rota pública de Qualidade, a entrada da Área do colaborador e as telas privadas de Produção, Moldes e ferramentaria, Matéria-prima, Pigmentos e cores, Qualidade, Estoque, Manutenção, RH e ponto, Ordens, Financeiro, Usuários e acessos, Configurações e Meu perfil.

Também foi testado o acesso direto sem sessão a `/producao` e `/qualidade`. Ambos apresentam a entrada protegida do ERP em vez de expor dados operacionais.

## Resultados confirmados

O CTA da seção humana abre `/contato`. O botão de cotação abre `/cotacao` e apresenta campos para necessidade, estágio do projeto, empresa, e-mail, volume, material e anexo. A rota `/qualidade-institucional` permanece pública e comercial, enquanto `/qualidade` permanece operacional e privada. A entrada por e-mail e senha continua separada do registro usado para apontamentos rápidos.

Os módulos privados abriram corretamente no preview e exibiram conteúdo demonstrativo coerente com seus domínios. Usuários e acessos exibiu cadastro, perfil, registro e seleção granular de módulos. RH e ponto exibiu presença, ausências, intervalos, origem GPS/rede local, relatório de ponto e histórico operacional.

## Limitações encontradas no protótipo

As telas ainda utilizam dados demonstrativos locais. Exportação, busca, filtros, paginação, nova ordem, cadastro de usuário, integração e edição de regras precisam ser ligados a serviços reais antes de produção. O formulário de cotação atualmente confirma a interação visual, mas ainda precisa persistir o lead e o anexo com segurança.

A autenticação ainda é demonstrativa no frontend. A senha administrativa não pode permanecer embutida no código ou no repositório. A autorização real precisa ocorrer no backend/Supabase por empresa, usuário, perfil e permissão. A migration inicial de Supabase também precisa de revisão de RLS antes de uso real.

## Pedido enviado ao bot orquestrador

Foi solicitado ao Grok Orquestrador que delegue a revisão aos bots especializados, sem tocar diretamente na `main`, criando branches e PRs somente quando autorizado. O checklist exige varredura de todos os links, botões, ícones acionáveis, rotas, formulários e módulos; testes unitários e de integração para cada alteração; teste de regressão para cada bug; validação de typecheck, lint, build, testes e CI; preservação do logo e das cores; nenhuma foto genérica; nenhum segredo, deploy ou migration aplicada sem aprovação.

## Direção visual aplicada

A home recebeu uma seção humana com imagem institucional pública da própria Wamovale, texto de proximidade e CTA de conversa. O objetivo é equilibrar competência técnica com afinidade pessoal, mantendo linguagem brasileira, acolhedora e direta.

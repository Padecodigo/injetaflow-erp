# UX/UI — InjetaFlow

## Direção visual
Industrial neo-utility: sidebar marinho, canvas claro, teal elétrico como cor proprietária, coral/âmbar para atenção e verde-lima para desempenho. A estética deve ser jovem sem parecer um brinquedo; técnica sem parecer um sistema legado.

## Layout
Desktop com sidebar persistente e topbar com busca, data, estado de acesso, notificações e usuário. Mobile com sidebar em drawer. Dashboard usa blocos assimétricos: KPIs, gráfico de ritmo, status de fábrica, ordens e alertas.

## Componentes essenciais
`AppShell`, `Sidebar`, `Topbar`, `GlobalSearch`, `AccessBadge`, `MetricCard`, `StatusPill`, `DataTable`, `FilterBar`, `ProgressBar`, `AlertRow`, `AuditBadge`, `RegistrationModal`, `PermissionGate`, `EmptyState`, `ErrorState`, `LoadingSkeleton`, `ConfirmationDialog`.

## Estados
Toda tela deve prever carregando, vazio, erro recuperável, sem permissão, bloqueado por qualidade, bloqueado por estoque, sucesso e operação pendente.

## Microcopy
Usar frases como: “A fábrica está no ritmo.”, “Resolva o gargalo antes do próximo ciclo.”, “Ação registrada por REG-00482.”, “Este lote permanece em quarentena até a liberação de qualidade.” Evitar “Clique aqui”, termos vagos e mensagens técnicas.

## Formulários
Agrupar por tarefa; destacar campos obrigatórios; mostrar unidade; preservar rascunho; validar inline; impedir duplo envio; pedir motivo para correção/estorno; exibir quem está operando.

## Tabelas
Cabeçalho fixo quando útil; filtros persistentes; ordenação; paginação; exportação autorizada; colunas essenciais primeiro; tooltip para códigos; rolagem horizontal no mobile.

## Acessibilidade
Contraste WCAG AA; foco visível; navegação por teclado; labels; erro associado ao campo; tamanho de toque adequado; não depender só de cor; suporte a leitor de tela.

## Responsividade
Terminais de chão de fábrica devem priorizar botões grandes, status e leitura rápida. Em telas pequenas, esconder colunas secundárias ou permitir expansão da linha, sem perder lote, OP, status e operador.

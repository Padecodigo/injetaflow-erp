# PROGRESS.md — Memória de desenvolvimento

## Última atualização
2026-10-16

## Entregue
- Protótipo visual InjetaFlow com dashboard público e módulos operacionais.
- Saudação pública `Bom dia, equipe`.
- Login demonstrativo com nome e número de registro.
- Módulos Financeiro e Configurações com bloqueio visual para visitantes.
- Confirmação de número de registro antes de ações operacionais.
- Documentação profissional inicial para Cursor, incluindo regras, domínio, arquitetura, segurança, UX e testes.
- Stack oficial definida para o produto real: Next.js App Router, TypeScript, Tailwind CSS e Supabase/PostgreSQL.
- Visão ampliada registrada: plataforma modular única para operação industrial, RH, ponto, financeiro, contábil, fiscal, SST, meio ambiente, licenças, documentos e BPF/GMP.
- Migração SQL inicial criada para `empresas`, `modulos_ativos`, `usuarios`, trigger de atualização, função de contexto e RLS.

## Em andamento
- Migrar autenticação demonstrativa para autenticação real.
- Persistir usuários, perfis, permissões, registros de operador e auditoria.
- Criar banco de dados de negócio e endpoints reais.
- Criar novo app Next.js + Supabase ou migrar o protótipo visual para a arquitetura-alvo sem misturar stacks.

## Próximos passos recomendados
1. Definir estratégia de autenticação e provisionamento de tenants.
2. Implementar identidade, autorização e auditoria no backend.
3. Implementar cadastros industriais.
4. Implementar OP e apontamento real.
5. Implementar estoque por lote e rastreabilidade.
6. Implementar qualidade e manutenção.

## Pendências de decisão
- Provedor de autenticação.
- Banco e estratégia de hospedagem final.
- Regras fiscais com contador.
- Requisitos sanitários e retenção documental.
- Equipamentos e protocolos de balança/IoT/EDI.
- Política de privacidade, retenção e consentimento para GPS, ponto, saúde ocupacional e documentos pessoais.

# Regras de testes e dados

- Teste regras de negócio sem depender de rede ou relógio real.
- Em qualquer mutação, teste usuário sem permissão, registro ausente, registro inválido, estado incompatível e tenant incorreto.
- Use factories/builders para dados de teste e deixe claro quando o dado é sintético.
- Não usar produção, dados pessoais reais ou credenciais reais em testes.
- Testes de estoque devem validar saldo, unidade, lote, origem/destino, idempotência e estorno.
- Testes de qualidade devem validar quarentena, laudo, bloqueio, liberação, RNC e auditoria.
- Testes de produção devem validar ciclos, cavidades, setup, refugo, consumo e fechamento da OP.
- Testes E2E devem validar a jornada pública e a jornada autenticada.
- Toda falha intermitente deve virar investigação registrada, nunca ser simplesmente ignorada.

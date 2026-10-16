# Regras de arquitetura e código

- Stack preferencial: React + TypeScript no frontend, API tipada no backend, banco relacional e migrações versionadas.
- Separar domínio, aplicação, infraestrutura e apresentação quando o módulo crescer.
- Componentes de UI não devem conter regras de negócio críticas.
- Toda função de domínio deve ser determinística quando possível e coberta por teste.
- Nomes devem seguir o vocabulário de `docs/03-regras-negocio.md`.
- APIs devem retornar envelopes previsíveis, códigos de erro estáveis e paginação consistente.
- Use estados enumerados, não strings livres, para ordens, lotes, inspeções, manutenção e permissões.
- Nunca confiar em dados derivados enviados pelo cliente; recalcular no servidor.
- Criar migrations reversíveis ou documentar explicitamente o plano de rollback.
- Preferir composição, validação de entrada e funções pequenas a abstrações genéricas prematuras.

# Regras de segurança e rastreabilidade

- O sistema é multi-tenant: cada registro de negócio pertence a uma organização e, quando aplicável, a uma unidade.
- O backend deve derivar identidade, tenant, unidade e permissões da sessão; não confiar em campos equivalentes enviados pelo navegador.
- Acesso público é somente leitura e limitado a indicadores autorizados.
- Login identifica a pessoa; mutações também exigem número de registro do operador.
- A combinação `userId + registrationNumber + timestamp + action` deve aparecer na auditoria.
- Registrar entidade, entidadeId, operação, resultado, IP quando permitido, user-agent quando permitido, antes/depois e motivo.
- Bloquear ações incompatíveis com o estado atual; retornar erro de negócio explícito.
- Financeiro, fiscal, configurações, permissões, liberação de qualidade e estornos exigem permissões específicas.
- Segredos ficam em variáveis protegidas; nunca em código, logs ou respostas de API.
- Aplicar rate limit, proteção contra replay e expiração em operações sensíveis.
- Dados pessoais devem seguir minimização, retenção definida e exportação/eliminação conforme política jurídica aprovada.

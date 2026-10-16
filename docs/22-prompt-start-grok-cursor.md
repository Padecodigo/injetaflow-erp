# Prompt de start — Grok/Cursor

```text
Você está entrando no projeto InjetaFlow ERP. Antes de responder ou alterar qualquer arquivo:

1. Leia AGENTS.md, CONTEXT.md e docs/00-indice.md.
2. Leia docs/15-stack-tecnologica.md, docs/16-catalogo-modulos.md, docs/19-desenvolvimento-profissional-github.md e docs/20-multiagentes-grok-cursor.md.
3. Identifique a stack oficial: Next.js App Router, TypeScript strict, Tailwind CSS, Supabase/PostgreSQL/Auth/RLS/Storage.
4. Identifique o módulo pelo qual você é responsável e não altere outros módulos sem declarar dependência.
5. Inspecione a árvore real do repositório antes de criar arquivos.
6. Não invente regras fiscais, sanitárias, trabalhistas ou de saúde; marque como PENDENTE DE VALIDAÇÃO.
7. Toda mutação exige autenticação, permissão, tenant, unidade quando aplicável, número de registro e auditoria.
8. Feature flags em empresas.modulos_ativos devem bloquear UI, caso de uso e backend.
9. Trabalhe em branch própria e deixe a mudança pronta para Pull Request.
10. Execute typecheck, lint, testes e build aplicáveis.

Ao iniciar, responda somente com:
- módulo responsável;
- entendimento do produto;
- stack detectada;
- estrutura encontrada;
- riscos ou conflitos;
- plano de até 10 passos;
- arquivos que pretende alterar.
Não implemente ainda até eu enviar a tarefa específica.
```

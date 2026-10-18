# Dependências: vulnerabilidades de produção (`pnpm audit --prod`)

Atualizado em 17/10/2026 (PR `chore/deps-seguranca`, a partir da `main` 312ddd2).

## Antes → depois

| Severidade | Antes | Depois |
|---|---|---|
| crítica | 2 | **0** |
| alta | 23 | **0** |
| moderada | 55 | 24 |
| baixa | 12 | 7 |

## O que foi atualizado (mudança mínima, sem troca de major)

| Pacote | De → para | Corrige |
|---|---|---|
| `express` | 4.21.2 → ^4.22.3 | `path-to-regexp` 0.1.13 (ReDoS) e `proxy-addr` 2.0.8 (IP spoofing, crítica) |
| `@trpc/server`, `@trpc/client`, `@trpc/react-query` | 11.6.0 → ^11.19.0 | poluição de protótipo no tRPC (≥ 11.8.0) |
| `axios` | 1.12.2 → ^1.20.0 | poluição de protótipo e DoS; `form-data` ≥ 4.0.6 |
| `drizzle-orm` | 0.44.6 → ^0.45.4 | SQL injection (≥ 0.45.2) |
| `mysql2` | 3.15.1 → ^3.24.6 | alta (≥ 3.22.0) |
| `nanoid` | 5.1.6 → ^5.1.16 | alta (≥ 5.1.16) |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | 3.693 → ^3.1152.0 | `fast-xml-parser` (crítica e altas): o `xml-builder` atual não depende mais dele |
| override `lodash`, `lodash-es` → ^4.18.1 | via `recharts` e `mermaid` | injeção de código em `_.template` |
| override `proxy-addr` → ^2.0.8 | via `express` | garante a versão corrigida |

Os overrides estão em `pnpm-workspace.yaml`. São todos patches ou minors dentro do mesmo major.

## O que ficou sem correção (só moderadas e baixas)

Tudo vem de `streamdown` (renderização de Markdown do componente de chat do template), pelas dependências `mermaid`, `dompurify`, `katex`, `mdast-util-to-hast` e `uuid`. O ERP não usa esse componente nas telas. Corrigir exige subir o `mermaid` para ≥ 11.16.1 e o `dompurify` para ≥ 3.4.13 por dentro do `streamdown`, um salto que esta PR evita (risco de quebra sem benefício para o ERP). O caminho recomendado é remover os restos do template (B-18), em PR separado.

Restos do template que continuam no `package.json`, com as versões já corrigidas acima: `mysql2`, `drizzle-orm`, `@aws-sdk/*` e `axios`. A remoção (B-18) fica fora deste PR, pela regra de não remover módulos sem decisão.

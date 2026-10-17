# ponto-core

Domínio puro do ponto do InjetaFlow (planos RH/Ponto v2 §4.8 e v3). **Fatia F1:** parser do AFD da
Portaria MTP 671/2021 (leiaute versão "004"), relatório de inconsistências, chaves de idempotência e
decisão do pipeline de importação.

A origem oficial das marcações é o **REP** (relógio). O InjetaFlow é PTRP: lê o AFD que o REP gera,
nunca registra marcação nem "gera AFD fiscal" (FAQ 38).

## Regras do pacote

- Sem I/O, sem banco, sem HTTP, sem relógio do sistema, sem framework. A única importação de runtime é
  `node:crypto` (SHA-256), que é computação pura. Um teste (`pureza.test.ts`) garante isso.
- Nada aqui importa de `server/`, `client/` ou `shared/` (módulo isolado, regra 18 do `AGENTS.md`).
- Local provisório (`packages/ponto-core`). A ADR-0006 confirma o local final. Ainda não é um pacote
  do workspace pnpm (sem `package.json` próprio) para não mexer no lockfile.
- Fixtures **sempre sintéticas** (CPFs e CNPJs de teste gerados), nunca dados reais.

## API

| Função | O que faz |
|---|---|
| `parseAfd(bytes, opcoes?)` | Lê o AFD (latin1, CR LF; LF solto com aviso), linha a linha. Devolve cabeçalho, registros 2–7, trailer, assinatura, linhas inválidas, contagem por tipo, `sha256Arquivo` e `inconsistencias[]`. Nunca lança exceção |
| `decidirImportacao(estado, linhas)` | Dado `{ ultimoNsr, hashesPorNsr }`, decide `inserir`, `duplicadas`, `conflitos`, `lacunas` e `retrocesso` (bloqueia). Determinística |
| `chaveNatural` / `chaveIdempotencia` | `(empresa, REP, NSR)` e `(empresa, REP, NSR, hash da linha)` |
| `identificadorRep(cabecalho, tipoRep)` | Chave do REP: REP-C nº fabricação + CNPJ; REP-P nº INPI + CNPJ; REP-A CNPJ + id configurado |
| `relatorioImportacao` / `inconsistenciasDaImportacao` / `inconsistenciasCsv` | Totais, status e CSV (";", BOM, anti-injeção de fórmula) |
| `crc16KermitHex` | CRC-16/KERMIT ("123456789" → "2189") |

## Pontos [a confirmar]

- **CRC de REP-C:** o leiaute manda CRC-16/KERMIT para REP-A/REP-P; para REP-C segue o INMETRO. Por
  padrão o CRC é **aviso** quando o REP é C ou desconhecido, e **erro** para A/P (opção `crc`).
- **Cadeia de hash do tipo 7:** a concatenação exata não está no leiaute. Implementado: posições 1–73 da
  linha + hash anterior (hex minúsculo), sem separador. Reportado como **aviso** por padrão (opção `cadeiaHash`).
- **Leiaute legado (Portaria 1510):** só é **detectado** (`LEIAUTE_NAO_SUPORTADO`). A leitura depende de
  amostras reais dos relógios do Allan (D11).
- **CPF do responsável (tipo 2, 14 posições):** aceita zeros à esquerda ou alinhado à esquerda com espaços.

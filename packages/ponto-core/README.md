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
| `parseAfd(bytes, opcoes?)` | Lê o AFD (latin1, CR LF; LF solto com aviso), linha a linha. Devolve cabeçalho, registros 2–7 (cada um com `problemas` e `errosGraves`), trailer, assinatura, linhas inválidas, contagem por tipo, `sha256Arquivo`, `inconsistencias[]` e `motivosRejeicao[]`. Nunca lança exceção. Opções: `tipoRep`, `crc`, `cadeiaHash`, `hashAnteriorInicial`, `empregadoresPermitidos` |
| `planejarImportacao(estado, parse)` | **Entrada recomendada para a F2.** Arquivo rejeitado → tudo em quarentena; senão chama `decidirImportacao` |
| `decidirImportacao(estado, linhas, opcoes?)` | Dado `{ ultimoNsr, primeiroNsr, hashesPorNsr }`, decide `inserir`, `duplicadas`, `conflitos`, `quarentena`, `lacunas` e `retrocesso` (bloqueia). Determinística, linear (sem spread/recursão; testado com 500 mil linhas) |
| `chaveNatural` / `chaveIdempotencia` | `(empresa, REP, NSR)` e `(empresa, REP, NSR, hash da linha)` |
| `identificadorRep(cabecalho, tipoRep)` | Chave do REP: REP-C nº fabricação + CNPJ; REP-P nº INPI + CNPJ; REP-A CNPJ + id configurado |
| `relatorioImportacao` / `inconsistenciasDaImportacao` / `inconsistenciasCsv` | Totais, status e CSV (";", BOM, anti-injeção de fórmula) |
| `crc16KermitHex` | CRC-16/KERMIT ("123456789" → "2189") |

## Contrato para a F2 (caso de uso de importação, com banco)

A F2 carrega o estado, chama o core e grava o resultado. O core não acessa banco; ele confia nestas entradas:

1. **Empresa sempre do contexto autenticado**, nunca do arquivo. Passe em `parseAfd(bytes, { empregadoresPermitidos })`
   os CNPJs/CPFs dos estabelecimentos dessa empresa. Cabeçalho de outro empregador → `EMPREGADOR_FORA_DA_EMPRESA`
   (erro), `motivosRejeicao` preenchido e status `REJEITADA`: **o arquivo inteiro não entra**.
2. **`hashesPorNsr` de toda a faixa do arquivo**: o hash da linha de **todo NSR já gravado** para o REP entre o menor
   e o maior NSR do arquivo (não só acima do cursor). Sem isso, NSR já gravado parece novo.
3. **`ultimoNsr`** (maior NSR gravado do REP) e **`primeiroNsr`** (menor NSR gravado). NSR ausente entre os dois
   preenche lacuna (re-coleta) e é inserido; abaixo de `primeiroNsr` (ou sem essa informação) vai para quarentena
   como `NSR_ABAIXO_DO_CURSOR` (possível reset/troca do relógio).
4. **Último hash do tipo 7 armazenado**: para REP-P, passe em `hashAnteriorInicial` o hash (campo 8) do tipo 7
   gravado com o maior NSR **anterior** ao primeiro tipo 7 do arquivo. Sem ele, num arquivo que não começa no NSR 1,
   o primeiro elo vira `CADEIA_NAO_VERIFICAVEL` (aviso), não inválido.
5. **Gravação**: só `decisao.inserir` vira marcação/evento (chave única `(empresa, REP, NSR)` + hash da linha).
   `duplicadas` não grava nada. `conflitos` registra a inconsistência e **nunca sobrescreve** o original.
6. **Quarentena** (`decisao.quarentena`, com `motivos`): registro com erro grave (CRC inválido em REP-A/P, data e
   hora inválida, CPF ilegível, cadeia de hash inválida com `cadeiaHash: "erro"`, NSR fora de ordem, NSR 0, evento
   incompatível com o tipo de REP, empregador do tipo 2 fora da empresa), NSR repetido no arquivo com conteúdos
   diferentes (as duas linhas) e NSR abaixo do cursor. **Nunca vira marcação válida e nunca é descartado**: gravar
   como pendência (linha bruta, NSR, motivos) para o RH tratar. `motivosRejeicao` faz tudo ir para a quarentena.
7. **Bloqueio** (`bloqueada`): retrocesso real de NSR (conflito no início, nenhuma linha coincide com o já gravado)
   ou arquivo rejeitado. Nada é inserido; `retidasPorBloqueio` guarda o que entraria.
8. **Relatório**: `relatorioImportacao(parse, decisao)` e `inconsistenciasDaImportacao` (tela e CSV, sem CPF).

## Pontos [a confirmar]

- **CRC de REP-C:** o leiaute manda CRC-16/KERMIT para REP-A/REP-P; para REP-C segue o INMETRO. Por
  padrão o CRC é **aviso** quando o REP é C ou desconhecido, e **erro** para A/P (opção `crc`).
- **Cadeia de hash do tipo 7:** a concatenação exata não está no leiaute. Implementado: posições 1–73 da
  linha + hash anterior (hex minúsculo), sem separador. Reportado como **aviso** por padrão (opção `cadeiaHash`).
- **Leiaute legado (Portaria 1510):** só é **detectado** (`LEIAUTE_NAO_SUPORTADO`). A leitura depende de
  amostras reais dos relógios do Allan (D11).
- **CPF do responsável (tipo 2, 14 posições):** aceita zeros à esquerda ou alinhado à esquerda com espaços.
- **Encoding (P8-09):** BOM UTF-8, CR solto e arquivo re-salvo em UTF-8 são detectados antes do leiaute e
  rejeitam o arquivo com mensagem própria (`BOM_UTF8`, `QUEBRA_CR_SOLTO`, `ENCODING_UTF8`). A detecção de UTF-8 é
  heurística: todo byte ≥ 0x80 forma sequência UTF-8 válida e há ao menos uma.

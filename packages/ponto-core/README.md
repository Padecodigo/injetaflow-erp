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
| `planejarImportacao(estado, parse, opcoes?)` | **Entrada recomendada para a F2.** Arquivo rejeitado → tudo em quarentena; senão chama `decidirImportacao` |
| `decidirImportacao(estado, linhas, opcoes?)` | Dado o estado do REP (ver contrato), decide `inserir`, `lacunasPreenchidas`, `duplicadas`, `conflitos`, `quarentena`, `lacunas`, `retrocesso` (bloqueia) e `novoUltimoNsr`. Opções: `limiteSaltoNsr` (padrão 10.000) e `toleranciaLacunaMs` (padrão 10 min). Determinística, linear (sem spread/recursão; testado com 500 mil linhas) |
| `instanteSequencial(registro)` | Instante (ms UTC) que ordena o registro na sequência do REP. A F2 grava esse valor por NSR (`instantesPorNsr`) |
| `chaveNatural` / `chaveIdempotencia` | `(empresa, REP, NSR)` e `(empresa, REP, NSR, hash da linha)` |
| `identificadorRep(cabecalho, tipoRep)` | Chave do REP: REP-C nº fabricação + CNPJ; REP-P nº INPI + CNPJ; REP-A CNPJ + id configurado |
| `relatorioImportacao` / `inconsistenciasDaImportacao` / `inconsistenciasCsv` | Totais, status e CSV (";", BOM, anti-injeção de fórmula) |
| `crc16KermitHex` | CRC-16/KERMIT ("123456789" → "2189") |

## Contrato para a F2 (caso de uso de importação, com banco)

A F2 carrega o estado, chama o core e grava o resultado. O core não acessa banco; ele confia nestas entradas:

1. **Empresa sempre do contexto autenticado**, nunca do arquivo. Passe em `parseAfd(bytes, { empregadoresPermitidos })`
   os CNPJs/CPFs dos estabelecimentos dessa empresa. Cabeçalho de outro empregador → `EMPREGADOR_FORA_DA_EMPRESA`
   (erro), `motivosRejeicao` preenchido e status `REJEITADA`: **o arquivo inteiro não entra**.
2. **Estado do REP** (`EstadoConhecido`), carregado do banco a cada importação:

   | Campo | O que a F2 passa | Se faltar |
   |---|---|---|
   | `ultimoNsr` | O **cursor persistido**: `decisao.novoUltimoNsr` da importação anterior. **Não** recalcular como "maior NSR da tabela" (registro com CRC inválido ou em quarentena nunca avança o cursor, P8-R2-02) | `null` = primeira importação |
   | `primeiroNsr` | Menor NSR gravado do REP | NSR abaixo do cursor e fora de lacuna declarada vira `NSR_ABAIXO_DO_CURSOR` |
   | `hashesPorNsr` | Hash da linha de **todo NSR gravado** entre o menor e o maior NSR do arquivo, mais os vizinhos de cada lacuna declarada que o arquivo toca (`de − 1` e `ate + 1`) | NSR ≤ `ultimoNsr` sem hash e fora de lacuna declarada → quarentena `ESTADO_INCOMPLETO` (P8-R2-03), inclusive o próprio `ultimoNsr`. Nunca entra em `inserir` |
   | `instantesPorNsr` | `instanteSequencial(registro)` (ms UTC) de cada NSR gravado; no mínimo dos vizinhos `de − 1` e `ate + 1` de cada lacuna declarada que o arquivo toca | Preenchimento dessa lacuna → `ESTADO_INCOMPLETO` |
   | `lacunasConhecidas` | Faixas que faltam: as `decisao.lacunas` das importações anteriores menos os NSRs já preenchidos (persistir por REP) | Nenhum NSR abaixo do cursor pode entrar |

3. **Preenchimento de lacuna** (P8-R2-01): um NSR abaixo do cursor só entra se estiver numa lacuna declarada **e**
   `instante(de − 1) − tolerância ≤ instante(NSR) ≤ instante(ate + 1) + tolerância`, e se não voltar no tempo em
   relação ao preenchimento anterior da mesma lacuna no arquivo. Tolerância padrão `TOLERANCIA_LACUNA_MS_PADRAO`
   (10 min, cobre ajuste fino de relógio entre vizinhos; opção `toleranciaLacunaMs`). Fora disso → quarentena
   `LACUNA_INCOERENTE`. Todo preenchimento aceito vai também para `decisao.lacunasPreenchidas`, gera aviso
   `PREENCHIMENTO_DE_LACUNA` no relatório e o status nunca fica `OK` (no mínimo `COM_AVISOS`).
   Depois de gravar, a F2 tira os NSRs preenchidos de `lacunasConhecidas` e acrescenta as novas `decisao.lacunas`.
   **Salto de NSR** (P8-R2-02): NSR novo mais de `limiteSaltoNsr` (padrão `LIMITE_SALTO_NSR_PADRAO` = 10.000) acima do
   último NSR confiável → quarentena `NSR_SALTO_ANOMALO`. Um NSR corrompido que fica maior que os seguintes é marcado
   `NSR_FORA_DE_ORDEM` nele, não no vizinho legítimo. A análise de lacunas para em 1 milhão de NSRs e informa
   `lacunasTruncadasEm` (aviso no relatório).
4. **Último hash do tipo 7 armazenado**: para REP-P, passe em `hashAnteriorInicial` o hash (campo 8) do tipo 7
   gravado com o maior NSR **anterior** ao primeiro tipo 7 do arquivo. Sem ele, num arquivo que não começa no NSR 1,
   o primeiro elo vira `CADEIA_NAO_VERIFICAVEL` (aviso), não inválido.
5. **Gravação**: só `decisao.inserir` vira marcação/evento (chave única `(empresa, REP, NSR)` + hash da linha), com
   o `instante` de cada registro. Na mesma transação, persistir `decisao.novoUltimoNsr` como cursor do REP.
   `duplicadas` não grava nada. `conflitos` registra a inconsistência e **nunca sobrescreve** o original.
6. **Quarentena** (`decisao.quarentena`, com `motivos`): registro com erro grave (CRC inválido em REP-A/P, data e
   hora inválida, CPF ilegível, cadeia de hash inválida com `cadeiaHash: "erro"`, NSR fora de ordem, NSR 0, evento
   incompatível com o tipo de REP, empregador do tipo 2 fora da empresa, marcação feita depois de um tipo 2 que trocou
   para outro empregador até um tipo 2 desta empresa — `MARCACAO_SOB_OUTRO_EMPREGADOR`, P8-R2-04), NSR repetido no
   arquivo com conteúdos diferentes (as duas linhas), NSR abaixo do cursor, `LACUNA_INCOERENTE`, `NSR_SALTO_ANOMALO`
   e `ESTADO_INCOMPLETO`. **Nunca vira marcação válida e nunca é descartado**: gravar
   como pendência (linha bruta, NSR, motivos) para o RH tratar. `motivosRejeicao` faz tudo ir para a quarentena.
7. **Bloqueio** (`bloqueada`): retrocesso real de NSR (conflito no início, nenhuma linha coincide com o já gravado)
   ou arquivo rejeitado. Nada é inserido; `retidasPorBloqueio` guarda o que entraria.
8. **Relatório**: `relatorioImportacao(parse, decisao)` e `inconsistenciasDaImportacao` (tela e CSV, sem CPF).
9. **Execução em segundo plano** (P8-R2-05): medido em 300 mil linhas, o parse leva ~5 s (REP-C, 15,6 MB) a ~9 s
   (REP-P, 41,7 MB) e retém ~225 MB de heap no REP-C (após o ganho desta rodada: data e hora compartilhada e array vazio
   compartilhado; antes ~310 MB). Projeção: ~0,8 GB para 1 milhão de linhas. A F2 deve rodar a importação em
   **job/worker em segundo plano**, nunca dentro da requisição HTTP, com **limite de tamanho de arquivo** (sugestão:
   50 MB) e um job por REP por vez. Parse em streaming e registros mais enxutos ficam para depois da F2.

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
  heurística: todo byte ≥ 0x80 forma sequência UTF-8 válida e há ao menos uma. **Limitação conhecida (P8-R2-06):** um
  AFD Latin-1 legítimo cujos bytes altos formem, por acaso, só sequências UTF-8 válidas (ex.: "Ã" seguido de "©")
  seria rejeitado como UTF-8. É raro em nomes próprios (exige pares de acentuados específicos em todas as ocorrências);
  se acontecer, o RH vê a mensagem `ENCODING_UTF8` e o arquivo pode ser reavaliado. Alternativas para a F2, se
  surgir caso real: rebaixar para aviso ou exigir proporção mínima de sequências multibyte.
- **CRC de REP-C e cursor (P8-R2-02):** com CRC como aviso (REP-C), o registro com CRC inválido pode entrar, mas
  nunca avança o cursor (`novoUltimoNsr`) nem a conferência de ordem. Se nenhum CRC do arquivo confere (algoritmo
  do fabricante diferente), o CRC deixa de ser critério de ordem; nesse caso configure `crc: "ignorar"` para o REP.

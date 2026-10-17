import { calcularHashTipo7 } from "./cadeia-hash";
import { campo, cnpjValido, cpfValido, lerCpf12, lerCpfResponsavel, lerData, lerDataHora, lerNumero, numericoOpcional, type DataHoraAfd } from "./campos";
import { crc16KermitHex } from "./crc16";
import { sha256Hex } from "./hash";
import { decodificarLatin1 } from "./latin1";
import {
  COLETORES_REP_P, EVENTOS_SENSIVEIS, LITERAL_ASSINATURA_P7S, TAMANHO_ASSINATURA, TAMANHO_CABECALHO, TAMANHO_POR_TIPO, TAMANHO_TRAILER,
  TIPOS_COM_CRC, TIPOS_COM_NSR, VERSAO_LEIAUTE_671,
} from "./leiaute671";
import type {
  Assinatura, Cabecalho, CodigoInconsistencia, Inconsistencia, LinhaInvalida, OpcoesParser, Registro, ResultadoParser, Severidade,
  TipoRegistroComNsr, TipoRep, Trailer,
} from "./tipos";

interface LinhaLida {
  numeroLinha: number;
  texto: string;
}

/** Quebra o texto em linhas. CR LF é o padrão; LF solto é aceito com aviso (plano v2, §3.3, item 1). */
function quebrarLinhas(texto: string, inc: Inconsistencia[]): LinhaLida[] {
  const partes = texto.split("\n");
  const linhas: LinhaLida[] = [];
  let soLf = 0;
  let primeiraSoLf = 0;
  const ultima = partes.length - 1;
  for (let i = 0; i < partes.length; i++) {
    let t = partes[i];
    if (i === ultima) {
      if (t === "") break; // arquivo terminado em quebra de linha
      inc.push({ codigo: "SEM_QUEBRA_FINAL", severidade: "aviso", numeroLinha: i + 1, mensagem: "A última linha não termina com CR LF." });
    } else if (t.endsWith("\r")) {
      t = t.slice(0, -1);
    } else {
      soLf++;
      if (!primeiraSoLf) primeiraSoLf = i + 1;
    }
    linhas.push({ numeroLinha: i + 1, texto: t });
  }
  if (soLf > 0) {
    inc.push({ codigo: "QUEBRA_LF", severidade: "aviso", numeroLinha: primeiraSoLf, mensagem: `${soLf} linha(s) terminam só com LF; o leiaute exige CR LF.` });
  }
  return linhas;
}

function contagemZerada(): Record<TipoRegistroComNsr, number> {
  return { "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0 };
}

function ehCabecalho(t: string) {
  return t.startsWith("000000000") && t[9] === "1";
}

function ehTrailer(t: string) {
  return t.length === TAMANHO_TRAILER && t.startsWith("999999999") && t[63] === "9";
}

/**
 * Parser do AFD da Portaria 671 (leiaute "004"). Função pura: recebe os bytes do arquivo e devolve
 * cabeçalho, registros, trailer, assinatura e a lista de inconsistências. Sem I/O, sem relógio do sistema,
 * e nunca lança exceção para entrada arbitrária (defeitos viram inconsistências).
 */
export function parseAfd(bytes: Uint8Array, opcoes: OpcoesParser = {}): ResultadoParser {
  const inconsistencias: Inconsistencia[] = [];
  const add = (codigo: CodigoInconsistencia, severidade: Severidade, mensagem: string, extra: Partial<Inconsistencia> = {}) => {
    inconsistencias.push({ codigo, severidade, mensagem, ...extra });
  };
  const resultado: ResultadoParser = {
    leiaute: "671-004",
    tipoRep: opcoes.tipoRep ?? null,
    sha256Arquivo: sha256Hex(bytes),
    totalLinhas: 0,
    cabecalho: null,
    registros: [],
    invalidas: [],
    trailer: null,
    assinatura: null,
    contagemPorTipo: contagemZerada(),
    inconsistencias,
    motivosRejeicao: [],
  };
  const rejeitar = (codigo: CodigoInconsistencia) => {
    if (!resultado.motivosRejeicao.includes(codigo)) resultado.motivosRejeicao.push(codigo);
  };

  // P8-09: problemas de encoding e de quebra de linha têm mensagem própria, antes do detector de leiaute,
  // para o RH não procurar o defeito no lugar errado ("leiaute legado").
  const encoding = diagnosticarEncoding(bytes);
  if (encoding) {
    resultado.leiaute = "nao-suportado";
    add(encoding.codigo, "erro", encoding.mensagem, { numeroLinha: encoding.numeroLinha });
    rejeitar(encoding.codigo);
    resultado.totalLinhas = contarLinhas(bytes);
    return resultado;
  }

  const linhas = quebrarLinhas(decodificarLatin1(bytes), inconsistencias);
  resultado.totalLinhas = linhas.length;
  if (linhas.length === 0) {
    resultado.leiaute = "vazio";
    add("ARQUIVO_VAZIO", "erro", "O arquivo está vazio.");
    rejeitar("ARQUIVO_VAZIO");
    return resultado;
  }

  // Detector de leiaute: só o 671 v004 é lido. O leiaute legado (Portaria 1510) é detectado e recusado
  // com inconsistência; os campos dele estão [a confirmar] com amostras reais (plano v2 §3.2, D11).
  const primeira = linhas.find(l => l.texto !== "");
  if (primeira && ehCabecalho(primeira.texto)) {
    const versao = campo(primeira.texto, 251, 253);
    if (primeira.texto.length !== TAMANHO_CABECALHO || versao !== VERSAO_LEIAUTE_671) {
      resultado.leiaute = "nao-suportado";
      add("LEIAUTE_NAO_SUPORTADO", "erro", `Cabeçalho com ${primeira.texto.length} posições e versão "${versao.trim()}". Só o leiaute 671 versão 004 (302 posições) é suportado; leiaute legado (Portaria 1510) ainda não.`, { numeroLinha: primeira.numeroLinha });
      rejeitar("LEIAUTE_NAO_SUPORTADO");
      return resultado;
    }
  }

  // Tipo de REP: cadastro manda; senão, tipo 7 presente indica REP-P.
  const temTipo7 = linhas.some(l => l.texto.length === TAMANHO_POR_TIPO["7"] && l.texto[9] === "7" && /^\d{9}$/.test(l.texto.slice(0, 9)));
  const tipoRep: TipoRep | null = opcoes.tipoRep ?? (temTipo7 ? "P" : null);
  resultado.tipoRep = tipoRep;
  const sevCrc = opcoes.crc ?? (tipoRep === "A" || tipoRep === "P" ? "erro" : "aviso");
  const sevHash = opcoes.cadeiaHash ?? "aviso";

  let posicaoRegistro = 0;
  let nsrAnterior: number | null = null;
  const nsrsVistos = new Set<number>();
  let hashAnterior: string | null = opcoes.hashAnteriorInicial ?? null;
  // P8-05: sem hash anterior informado, o 1º elo só é verificável se o arquivo começa no NSR 1
  let primeiroNsrDoArquivo: number | null = null;
  let tipo7Vistos = 0;
  const permitidos = opcoes.empregadoresPermitidos ? new Set(opcoes.empregadoresPermitidos.map(v => normalizarEmpregador(v)).filter(Boolean)) : null;
  let depoisDoTrailer = 0;

  const invalida = (l: LinhaLida, linhaHash: string, motivo: CodigoInconsistencia, tipo: string | null, nsr: number | null) => {
    const item: LinhaInvalida = { numeroLinha: l.numeroLinha, linhaBruta: l.texto, linhaHash, tipo, nsr, motivo };
    resultado.invalidas.push(item);
  };

  const conferirCrc = (texto: string, numeroLinha: number, nsr: number | undefined, problemas?: CodigoInconsistencia[], errosDoCrc?: CodigoInconsistencia[]) => {
    if (sevCrc === "ignorar") return;
    const gravado = texto.slice(-4).toUpperCase();
    const calculado = crc16KermitHex(texto.slice(0, -4));
    if (gravado !== calculado) {
      add("CRC_INVALIDO", sevCrc, `CRC-16 não confere (gravado ${gravado}, calculado ${calculado}).`, { numeroLinha, nsr, campo: "crc" });
      problemas?.push("CRC_INVALIDO");
      if (sevCrc === "erro") errosDoCrc?.push("CRC_INVALIDO");
    }
  };

  for (const l of linhas) {
    const t = l.texto;
    if (t === "") {
      add("LINHA_EM_BRANCO", "erro", "Linha em branco (o leiaute não permite).", { numeroLinha: l.numeroLinha });
      continue;
    }
    const linhaHash = sha256Hex(t);

    // Linhas depois do trailer: a primeira é a assinatura; qualquer outra é erro.
    if (resultado.trailer) {
      depoisDoTrailer++;
      if (depoisDoTrailer === 1 && t.length === TAMANHO_ASSINATURA && !ehTrailer(t)) {
        const literalP7s = t === LITERAL_ASSINATURA_P7S.padEnd(TAMANHO_ASSINATURA, " ");
        const assinatura: Assinatura = { numeroLinha: l.numeroLinha, linhaBruta: t, linhaHash, literalP7s };
        resultado.assinatura = assinatura;
        if ((tipoRep === "A" || tipoRep === "P") && !literalP7s) {
          add("ASSINATURA_INVALIDA", "erro", `Para REP-A/REP-P a linha de assinatura deve ser "${LITERAL_ASSINATURA_P7S}" completada com espaços até 100 posições.`, { numeroLinha: l.numeroLinha });
        }
        continue;
      }
      if (ehTrailer(t)) {
        add("TRAILER_DUPLICADO", "erro", "Mais de um trailer no arquivo.", { numeroLinha: l.numeroLinha });
      } else {
        add("REGISTRO_APOS_TRAILER", "erro", "Linha depois do trailer e da assinatura.", { numeroLinha: l.numeroLinha });
      }
      invalida(l, linhaHash, "REGISTRO_APOS_TRAILER", null, null);
      continue;
    }

    if (ehCabecalho(t)) {
      if (resultado.cabecalho) {
        add("CABECALHO_DUPLICADO", "erro", "Mais de um cabeçalho no arquivo.", { numeroLinha: l.numeroLinha });
        invalida(l, linhaHash, "CABECALHO_DUPLICADO", "1", null);
        continue;
      }
      if (posicaoRegistro > 0) {
        add("CABECALHO_FORA_DE_POSICAO", "erro", "O cabeçalho deve ser a primeira linha (no Control iD, coletar com headerTop=true).", { numeroLinha: l.numeroLinha });
      }
      if (t.length !== TAMANHO_CABECALHO) {
        add("TAMANHO_INVALIDO", "erro", `Cabeçalho com ${t.length} posições; esperado ${TAMANHO_CABECALHO}.`, { numeroLinha: l.numeroLinha });
        invalida(l, linhaHash, "TAMANHO_INVALIDO", "1", null);
        posicaoRegistro++;
        continue;
      }
      resultado.cabecalho = lerCabecalho(t, l.numeroLinha, linhaHash, add, tipoRep);
      conferirCrc(t, l.numeroLinha, undefined);
      if (permitidos && !permitidos.has(normalizarEmpregador(resultado.cabecalho.idEmpregador, resultado.cabecalho.tpIdEmpregador))) {
        add("EMPREGADOR_FORA_DA_EMPRESA", "erro", "O CNPJ/CPF do empregador no cabeçalho não é de nenhum estabelecimento desta empresa. Arquivo rejeitado: confira se o AFD é do relógio certo.", { numeroLinha: l.numeroLinha, campo: "idEmpregador" });
        rejeitar("EMPREGADOR_FORA_DA_EMPRESA");
      }
      posicaoRegistro++;
      continue;
    }

    if (ehTrailer(t)) {
      resultado.trailer = lerTrailer(t, l.numeroLinha, linhaHash, add);
      posicaoRegistro++;
      continue;
    }

    posicaoRegistro++;
    const tipo = t.length >= 10 ? t[9] : null;
    const nsrTexto = t.slice(0, 9);
    const nsr = lerNumero(nsrTexto.length === 9 ? nsrTexto : "x");
    if (!tipo || !(TIPOS_COM_NSR as string[]).includes(tipo)) {
      add("TIPO_DESCONHECIDO", "erro", `Tipo de registro "${tipo ?? ""}" desconhecido na posição 10.`, { numeroLinha: l.numeroLinha, nsr: nsr ?? undefined });
      invalida(l, linhaHash, "TIPO_DESCONHECIDO", tipo, nsr);
      continue;
    }
    const tipoNsr = tipo as TipoRegistroComNsr;
    resultado.contagemPorTipo[tipoNsr]++;
    if (t.length !== TAMANHO_POR_TIPO[tipoNsr]) {
      add("TAMANHO_INVALIDO", "erro", `Registro tipo ${tipo} com ${t.length} posições; esperado ${TAMANHO_POR_TIPO[tipoNsr]}.`, { numeroLinha: l.numeroLinha, nsr: nsr ?? undefined });
      invalida(l, linhaHash, "TAMANHO_INVALIDO", tipo, nsr);
      continue;
    }
    if (nsr === null) {
      add("CAMPO_INVALIDO", "erro", "NSR (posições 1–9) não numérico.", { numeroLinha: l.numeroLinha, campo: "nsr" });
      invalida(l, linhaHash, "CAMPO_INVALIDO", tipo, null);
      continue;
    }

    const problemas: CodigoInconsistencia[] = [];
    const errosGraves: CodigoInconsistencia[] = [];
    const ctx = { numeroLinha: l.numeroLinha, nsr };
    const prob = (codigo: CodigoInconsistencia, severidade: Severidade, mensagem: string, campoNome?: string) => {
      add(codigo, severidade, mensagem, { ...ctx, campo: campoNome });
      if (!problemas.includes(codigo)) problemas.push(codigo);
      if (severidade === "erro" && !errosGraves.includes(codigo)) errosGraves.push(codigo);
    };
    if (primeiroNsrDoArquivo === null) primeiroNsrDoArquivo = nsr;
    // P8-08: o NSR começa em 1 (FAQ 41; Anexo IX)
    if (nsr === 0) prob("CAMPO_INVALIDO", "erro", "NSR 000000000 em registro: a numeração começa em 1.", "nsr");
    if (nsrsVistos.has(nsr)) {
      prob("NSR_DUPLICADO_NO_ARQUIVO", "erro", `NSR ${nsr} repetido no arquivo.`);
    } else if (nsrAnterior !== null && nsr < nsrAnterior) {
      prob("NSR_FORA_DE_ORDEM", "erro", `NSR ${nsr} depois do ${nsrAnterior}; o arquivo deve estar ordenado por NSR.`);
    }
    nsrsVistos.add(nsr);
    nsrAnterior = nsr;

    const dh = (inicio: number, fim: number, nome: string, obrigatorio = true): DataHoraAfd | null => {
      const v = lerDataHora(campo(t, inicio, fim));
      if (!v) {
        if (obrigatorio) prob("CAMPO_INVALIDO", "erro", `Data e hora inválida no campo "${nome}" (formato AAAA-MM-ddThh:mm:00ZZZZZ).`, nome);
        return null;
      }
      if (v.segundosNaoZero) prob("DH_SEGUNDOS", "aviso", `Campo "${nome}" com segundos diferentes de 00.`, nome);
      return v;
    };
    const cpf12 = (inicio: number, fim: number, nome: string) => {
      const v = lerCpf12(campo(t, inicio, fim));
      if (v === null) {
        prob("CAMPO_INVALIDO", "erro", `CPF do campo "${nome}" fora dos formatos do FAQ 50 ("0" + 11 dígitos ou 11 dígitos + espaço).`, nome);
        return null;
      }
      if (!cpfValido(v)) prob("CPF_INVALIDO", "aviso", `CPF do campo "${nome}" com dígito verificador inválido.`, nome);
      return v;
    };
    const cpfResp = (inicio: number, fim: number, nome: string) => {
      const v = lerCpfResponsavel(campo(t, inicio, fim));
      if (v === null) {
        prob("CAMPO_INVALIDO", "erro", `CPF do campo "${nome}" inválido.`, nome);
        return null;
      }
      if (!cpfValido(v)) prob("CPF_INVALIDO", "aviso", `CPF do campo "${nome}" com dígito verificador inválido.`, nome);
      return v;
    };
    const base = { numeroLinha: l.numeroLinha, linhaBruta: t, linhaHash, nsr, problemas, errosGraves };

    let registro: Registro;
    switch (tipoNsr) {
      case "2": {
        const tpId = campo(t, 49, 49);
        const id = campo(t, 50, 63).trimEnd();
        registro = {
          ...base, tipo: "2", gravadoEm: dh(11, 34, "gravadoEm"), cpfResponsavel: cpfResp(35, 48, "cpfResponsavel"),
          tpIdEmpregador: tpId, idEmpregador: id, cnoCaepf: campo(t, 64, 77).trimEnd(), razaoSocial: campo(t, 78, 227).trimEnd(),
          local: campo(t, 228, 327).trimEnd(), crc: campo(t, 328, 331),
        };
        if (!idEmpregadorValido(tpId, id)) prob("CNPJ_CPF_INVALIDO", "aviso", "CNPJ/CPF do empregador inválido no registro tipo 2.", "idEmpregador");
        if (permitidos && !permitidos.has(normalizarEmpregador(id, tpId))) {
          prob("EMPREGADOR_FORA_DA_EMPRESA", "erro", "Registro tipo 2 (inclusão ou alteração do empregador no REP) com CNPJ/CPF que não é desta empresa.", "idEmpregador");
        }
        if (numericoOpcional(campo(t, 64, 77)) === null) prob("CAMPO_INVALIDO", "erro", 'CNO/CAEPF não numérico.', "cnoCaepf");
        break;
      }
      case "3":
        registro = { ...base, tipo: "3", marcadoEm: dh(11, 34, "marcadoEm"), cpf: cpf12(35, 46, "cpf"), crc: campo(t, 47, 50) };
        break;
      case "4":
        registro = { ...base, tipo: "4", antes: dh(11, 34, "antes"), ajustadoPara: dh(35, 58, "ajustadoPara"), cpfResponsavel: cpfResp(59, 69, "cpfResponsavel"), crc: campo(t, 70, 73) };
        break;
      case "5": {
        const operacao = campo(t, 35, 35);
        if (!["I", "A", "E"].includes(operacao)) prob("CAMPO_INVALIDO", "erro", 'Operação do tipo 5 deve ser "I", "A" ou "E".', "operacao");
        registro = {
          ...base, tipo: "5", gravadoEm: dh(11, 34, "gravadoEm"), operacao, cpf: cpf12(36, 47, "cpf"), nome: campo(t, 48, 99).trimEnd(),
          demaisDados: campo(t, 100, 103).trimEnd(), cpfResponsavel: cpfResp(104, 114, "cpfResponsavel"), crc: campo(t, 115, 118),
        };
        break;
      }
      case "6": {
        const codigoEvento = campo(t, 35, 36);
        if (!EVENTOS_SENSIVEIS[codigoEvento]) prob("CAMPO_INVALIDO", "erro", `Código de evento sensível "${codigoEvento}" desconhecido.`, "codigoEvento");
        else if ((tipoRep === "C" || tipoRep === "P") && !EVENTOS_POR_TIPO_REP[tipoRep].has(codigoEvento)) {
          prob("CAMPO_INVALIDO", "erro", `Evento sensível "${codigoEvento}" não existe para REP-${tipoRep} (leiaute, tipo 6, campo 4).`, "codigoEvento");
        }
        registro = { ...base, tipo: "6", gravadoEm: dh(11, 34, "gravadoEm"), codigoEvento };
        break;
      }
      case "7": {
        const coletor = campo(t, 71, 72);
        const onOff = campo(t, 73, 73);
        const hash = campo(t, 74, 137);
        if (!COLETORES_REP_P[coletor]) prob("CAMPO_INVALIDO", "erro", `Coletor "${coletor}" desconhecido.`, "coletor");
        if (onOff !== "0" && onOff !== "1") prob("CAMPO_INVALIDO", "erro", 'On/off-line deve ser "0" ou "1".', "offline");
        registro = {
          ...base, tipo: "7", marcadoEm: dh(11, 34, "marcadoEm"), cpf: cpf12(35, 46, "cpf"), gravadoEm: dh(47, 70, "gravadoEm"),
          coletor, offline: onOff === "1" ? true : onOff === "0" ? false : null, hash,
        };
        tipo7Vistos++;
        if (sevHash !== "ignorar") {
          const primeiroElo = tipo7Vistos === 1 && opcoes.hashAnteriorInicial === undefined;
          if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
            prob("HASH_CADEIA_INVALIDA", sevHash, "Hash do registro tipo 7 não tem 64 caracteres hexadecimais.", "hash");
          } else if (primeiroElo && primeiroNsrDoArquivo !== 1) {
            // P8-05: arquivo parcial sem o hash do tipo 7 anterior; o elo não pode ser verificado (não é inválido)
            prob("CADEIA_NAO_VERIFICAVEL", "aviso", "Primeiro registro tipo 7 de um arquivo parcial: sem o hash do registro anterior (hashAnteriorInicial), a cadeia não pode ser verificada neste elo.", "hash");
          } else if (hash.toLowerCase() !== calcularHashTipo7(t.slice(0, 73), hashAnterior)) {
            prob("HASH_CADEIA_INVALIDA", sevHash, "Hash SHA-256 do registro tipo 7 não confere com a cadeia (concatenação oficial a confirmar).", "hash");
          }
        }
        hashAnterior = hash.toLowerCase();
        break;
      }
    }
    if (TIPOS_COM_CRC.has(tipoNsr)) conferirCrc(t, l.numeroLinha, nsr, problemas, errosGraves);
    resultado.registros.push(registro);
  }

  // Estrutura do arquivo
  if (!resultado.cabecalho && !resultado.invalidas.some(i => i.tipo === "1")) add("CABECALHO_AUSENTE", "erro", "Arquivo sem cabeçalho (registro tipo 1).");
  if (!resultado.cabecalho) rejeitar("CABECALHO_AUSENTE");
  if (!resultado.trailer) {
    add("TRAILER_AUSENTE", "erro", "Arquivo sem trailer (registro 999999999).");
  } else {
    for (const tipo of TIPOS_COM_NSR) {
      const declarado = resultado.trailer.quantidades[tipo];
      const lido = resultado.contagemPorTipo[tipo];
      if (declarado !== lido) {
        add("TRAILER_DIVERGENTE", "erro", `Trailer declara ${declarado ?? "valor inválido"} registro(s) tipo ${tipo}; foram lidos ${lido}.`, { numeroLinha: resultado.trailer.numeroLinha, campo: `quantidadeTipo${tipo}` });
      }
    }
  }
  if (!resultado.assinatura) {
    add("ASSINATURA_AUSENTE", tipoRep === "A" || tipoRep === "P" ? "erro" : "aviso", "Arquivo sem a linha de assinatura digital depois do trailer.");
  }

  // Marcações fora do período declarado no cabeçalho
  const cab = resultado.cabecalho;
  if (cab?.dataInicial && cab.dataFinal) {
    for (const r of resultado.registros) {
      const dhMarcacao = r.tipo === "3" || r.tipo === "7" ? r.marcadoEm : null;
      if (dhMarcacao && (dhMarcacao.dataLocal < cab.dataInicial || dhMarcacao.dataLocal > cab.dataFinal)) {
        add("DATA_FORA_DO_PERIODO", "aviso", `Marcação em ${dhMarcacao.dataLocal}, fora do período do cabeçalho (${cab.dataInicial} a ${cab.dataFinal}).`, { numeroLinha: r.numeroLinha, nsr: r.nsr });
        if (!r.problemas.includes("DATA_FORA_DO_PERIODO")) r.problemas.push("DATA_FORA_DO_PERIODO");
      }
    }
  }
  return resultado;
}

function idEmpregadorValido(tpId: string, id: string): boolean {
  if (tpId === "1") return cnpjValido(id);
  if (tpId === "2") return cpfValido(id.length === 14 && id.startsWith("000") ? id.slice(3) : id);
  return false;
}

type Add = (codigo: CodigoInconsistencia, severidade: Severidade, mensagem: string, extra?: Partial<Inconsistencia>) => void;

function lerCabecalho(t: string, numeroLinha: number, linhaHash: string, add: Add, tipoRep: TipoRep | null): Cabecalho {
  const ctx = { numeroLinha };
  // P8-08: campo 7 (190–206), tipo N, preenchido a partir da esquerda (item 7: sobra com espaços)
  const campo7 = campo(t, 190, 206);
  if (!/^\d+ *$/.test(campo7)) {
    add("CAMPO_INVALIDO", "erro", `Campo 7 do cabeçalho (posições 190–206: ${tipoRep === "A" ? "nº do processo do acordo/convenção" : tipoRep === "P" ? "nº de registro no INPI" : "nº de fabricação"}) deve ser numérico, alinhado à esquerda.`, { ...ctx, campo: "numeroRep" });
  }
  const tpIdEmpregador = campo(t, 11, 11);
  const idEmpregador = campo(t, 12, 25).trimEnd();
  const dataInicial = lerData(campo(t, 207, 216));
  const dataFinal = lerData(campo(t, 217, 226));
  const geradoEm = lerDataHora(campo(t, 227, 250));
  const tpIdFabricante = campo(t, 254, 254);
  const idFabricante = campo(t, 255, 268).trimEnd();
  if (!idEmpregadorValido(tpIdEmpregador, idEmpregador)) add("CNPJ_CPF_INVALIDO", "erro", "CNPJ/CPF do empregador inválido no cabeçalho (tipo de identificador ou dígito verificador).", { ...ctx, campo: "idEmpregador" });
  if (numericoOpcional(campo(t, 26, 39)) === null) add("CAMPO_INVALIDO", "erro", "CNO/CAEPF não numérico no cabeçalho.", { ...ctx, campo: "cnoCaepf" });
  if (!dataInicial) add("CAMPO_INVALIDO", "erro", "Data inicial do cabeçalho inválida (AAAA-MM-dd).", { ...ctx, campo: "dataInicial" });
  if (!dataFinal) add("CAMPO_INVALIDO", "erro", "Data final do cabeçalho inválida (AAAA-MM-dd).", { ...ctx, campo: "dataFinal" });
  if (dataInicial && dataFinal && dataFinal < dataInicial) add("CAMPO_INVALIDO", "erro", "Data final do cabeçalho anterior à inicial.", { ...ctx, campo: "dataFinal" });
  if (!geradoEm) add("CAMPO_INVALIDO", "erro", "Data e hora de geração do cabeçalho inválida.", { ...ctx, campo: "geradoEm" });
  if (tpIdFabricante !== "1" && tpIdFabricante !== "2") add("CAMPO_INVALIDO", "erro", 'Tipo de identificador do fabricante deve ser "1" ou "2".', { ...ctx, campo: "tpIdFabricante" });
  else if (!idEmpregadorValido(tpIdFabricante, idFabricante)) add("CNPJ_CPF_INVALIDO", "aviso", "CNPJ/CPF do fabricante ou desenvolvedor inválido no cabeçalho.", { ...ctx, campo: "idFabricante" });
  return {
    numeroLinha, linhaBruta: t, linhaHash, tipo: "1", tpIdEmpregador, idEmpregador, cnoCaepf: campo(t, 26, 39).trimEnd(),
    razaoSocial: campo(t, 40, 189).trimEnd(), numeroRep: campo(t, 190, 206).trimEnd(), dataInicial, dataFinal, geradoEm,
    versaoLeiaute: campo(t, 251, 253), tpIdFabricante, idFabricante, modeloRep: campo(t, 269, 298).trimEnd(), crc: campo(t, 299, 302),
  };
}

function lerTrailer(t: string, numeroLinha: number, linhaHash: string, add: Add): Trailer {
  const q = (inicio: number, fim: number, tipo: string) => {
    const v = lerNumero(campo(t, inicio, fim));
    if (v === null) add("CAMPO_INVALIDO", "erro", `Quantidade de registros tipo ${tipo} no trailer não numérica.`, { numeroLinha, campo: `quantidadeTipo${tipo}` });
    return v;
  };
  return {
    numeroLinha, linhaBruta: t, linhaHash,
    quantidades: { "2": q(10, 18, "2"), "3": q(19, 27, "3"), "4": q(28, 36, "4"), "5": q(37, 45, "5"), "6": q(46, 54, "6"), "7": q(55, 63, "7") },
  };
}

/** Códigos de evento sensível permitidos por tipo de REP (leiaute, tipo 6, campo 4). */
const EVENTOS_POR_TIPO_REP: Record<"C" | "P", Set<string>> = {
  C: new Set(["01", "02", "03", "04", "05", "06"]),
  P: new Set(["02", "07", "08"]),
};

/** CNPJ/CPF do empregador sem pontuação e em maiúsculas; CPF em 14 posições ("000" + 11 ou 11 + espaços) vira 11. */
export function normalizarEmpregador(id: string, tpId?: string): string {
  const limpo = id.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (tpId === "2" && limpo.length === 14 && limpo.startsWith("000")) return limpo.slice(3);
  return limpo;
}

function contarLinhas(bytes: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0x0a) n++;
  return bytes.length > 0 && bytes[bytes.length - 1] !== 0x0a ? n + 1 : n;
}

/**
 * P8-09: BOM UTF-8, CR solto (só CR, ou CR CR LF) e arquivo re-salvo em UTF-8. Devolve o primeiro problema
 * encontrado, com mensagem para o RH. O AFD é ISO 8859-1 com CR LF (leiaute, itens 2 e 3).
 */
function diagnosticarEncoding(bytes: Uint8Array): { codigo: CodigoInconsistencia; mensagem: string; numeroLinha?: number } | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { codigo: "BOM_UTF8", numeroLinha: 1, mensagem: "O arquivo começa com BOM UTF-8: ele foi aberto e salvo num editor de texto. O AFD deve estar em ISO 8859-1, sem BOM; exporte de novo direto do relógio." };
  }
  let linha = 1;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0d && bytes[i + 1] !== 0x0a) {
      return { codigo: "QUEBRA_CR_SOLTO", numeroLinha: linha, mensagem: "Quebra de linha só com CR (ou CR repetido antes do LF): o arquivo foi convertido por outro programa. O AFD termina cada linha com CR LF; exporte de novo direto do relógio." };
    }
    if (bytes[i] === 0x0a) linha++;
  }
  // UTF-8: todo byte >= 0x80 faz parte de uma sequência UTF-8 válida e há pelo menos uma sequência
  let sequencias = 0;
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    if (b < 0x80) { i++; continue; }
    const n = b >= 0xc2 && b <= 0xdf ? 1 : b >= 0xe0 && b <= 0xef ? 2 : b >= 0xf0 && b <= 0xf4 ? 3 : -1;
    if (n < 0) return null;
    for (let k = 1; k <= n; k++) {
      const c = bytes[i + k];
      if (c === undefined || c < 0x80 || c > 0xbf) return null;
    }
    sequencias++;
    i += n + 1;
  }
  if (sequencias > 0) {
    return { codigo: "ENCODING_UTF8", mensagem: `O arquivo parece ter sido salvo em UTF-8 (${sequencias} caractere(s) acentuado(s) com mais de 1 byte), o que muda o tamanho das linhas. O AFD deve estar em ISO 8859-1; exporte de novo direto do relógio, sem abrir em editor.` };
  }
  return null;
}

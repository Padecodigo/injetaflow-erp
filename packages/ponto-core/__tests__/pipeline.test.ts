import { describe, expect, it } from "vitest";
import { decidirImportacao, type EstadoConhecido } from "../src/pipeline";

const l = (nsr: number, hash = `h${nsr}`) => ({ nsr, linhaHash: hash });
const estado = (nsrs: number[], extra: Record<number, string> = {}): EstadoConhecido => ({
  ultimoNsr: nsrs.length ? Math.max(...nsrs) : null,
  hashesPorNsr: new Map([...nsrs.map(n => [n, `h${n}`] as [number, string]), ...Object.entries(extra).map(([k, v]) => [Number(k), v] as [number, string])]),
});

describe("decidirImportacao (função pura do pipeline)", () => {
  it("primeira importação insere tudo, sem lacuna", () => {
    const d = decidirImportacao(estado([]), [l(1), l(2), l(3)]);
    expect(d).toEqual({ inserir: [l(1), l(2), l(3)], duplicadas: [], conflitos: [], quarentena: [], lacunasPreenchidas: [], lacunas: [], bloqueada: false, retidasPorBloqueio: [], novoUltimoNsr: 3, crcVerificavel: true });
  });

  it("reimportação do mesmo conteúdo gera só duplicadas", () => {
    const d = decidirImportacao(estado([1, 2, 3]), [l(1), l(2), l(3)]);
    expect(d.inserir).toEqual([]);
    expect(d.duplicadas.map(x => x.nsr)).toEqual([1, 2, 3]);
    expect(d.conflitos).toEqual([]);
    expect(d.lacunas).toEqual([]);
  });

  it("sobreposição (período maior) gera só o delta", () => {
    const d = decidirImportacao(estado([1, 2, 3]), [l(2), l(3), l(4), l(5)]);
    expect(d.inserir.map(x => x.nsr)).toEqual([4, 5]);
    expect(d.duplicadas.map(x => x.nsr)).toEqual([2, 3]);
  });

  it("mesmo NSR com hash diferente gera conflito e nunca entra em inserir", () => {
    const d = decidirImportacao(estado([1, 2, 3]), [l(2), l(3, "outro"), l(4)]);
    expect(d.conflitos).toEqual([{ registro: l(3, "outro"), hashExistente: "h3" }]);
    expect(d.inserir.map(x => x.nsr)).toEqual([4]);
    expect(d.bloqueada).toBe(false);
  });

  it("hash é comparado sem diferenciar maiúsculas", () => {
    expect(decidirImportacao({ ultimoNsr: 1, hashesPorNsr: { 1: "ABCDEF" } }, [l(1, "abcdef")]).duplicadas).toHaveLength(1);
  });

  it("lacunas: entre o último conhecido e o arquivo, e dentro do arquivo", () => {
    const d = decidirImportacao(estado([1, 2, 3]), [l(6), l(7), l(9), l(10)]);
    expect(d.lacunas).toEqual([{ de: 4, ate: 5 }, { de: 8, ate: 8 }]);
    expect(d.inserir.map(x => x.nsr)).toEqual([6, 7, 9, 10]);
  });

  it("NSR que preenche lacuna antiga (entre primeiroNsr e ultimoNsr) é inserido e não conta como lacuna", () => {
    const d = decidirImportacao(
      { ultimoNsr: 5, primeiroNsr: 1, hashesPorNsr: new Map([[1, "h1"], [2, "h2"], [5, "h5"]]), instantesPorNsr: new Map([[2, 200], [5, 500]]), lacunasConhecidas: [{ de: 3, ate: 4 }] },
      [{ ...l(3), instante: 300 }, { ...l(4), instante: 400 }],
    );
    expect(d.inserir.map(x => x.nsr)).toEqual([3, 4]);
    expect(d.lacunasPreenchidas.map(x => x.nsr)).toEqual([3, 4]);
    expect(d.lacunas).toEqual([]);
    expect(d.retrocesso).toBeUndefined();
  });

  it("retrocesso: a sequência recomeça com conteúdo diferente → bloqueia toda a inserção", () => {
    const d = decidirImportacao(estado([1, 2, 3, 4, 5]), [l(1, "novo1"), l(2, "novo2"), l(6)]);
    expect(d.retrocesso).toEqual({ ultimoNsr: 5, primeiroNsrArquivo: 1, maiorNsrArquivo: 6 });
    expect(d.bloqueada).toBe(true);
    expect(d.inserir).toEqual([]);
    expect(d.retidasPorBloqueio.map(x => x.nsr)).toEqual([6]);
    expect(d.conflitos.map(c => c.registro.nsr)).toEqual([1, 2]);
  });

  it("conflito isolado no meio do arquivo não é retrocesso", () => {
    const d = decidirImportacao(estado([1, 2, 3, 4, 5]), [l(4), l(5, "x"), l(6)]);
    expect(d.retrocesso).toBeUndefined();
    expect(d.inserir.map(x => x.nsr)).toEqual([6]);
  });

  it("NSR repetido no próprio arquivo: igual = duplicada; diferente = as duas ocorrências em quarentena (P8-07)", () => {
    const d = decidirImportacao(estado([]), [l(1), l(2), l(2), l(3), l(3, "y")]);
    expect(d.inserir.map(x => x.nsr)).toEqual([1, 2]);
    expect(d.duplicadas.map(x => x.nsr)).toEqual([2]);
    expect(d.conflitos).toEqual([]);
    expect(d.quarentena).toEqual([
      { registro: l(3), motivos: ["NSR_DUPLICADO_NO_ARQUIVO"] },
      { registro: l(3, "y"), motivos: ["NSR_DUPLICADO_NO_ARQUIVO"] },
    ]);
  });

  it("é determinística e aceita Map ou objeto como estado; não altera a entrada", () => {
    const linhas = Object.freeze([l(3), l(4, "z"), l(8)]);
    const mapa = estado([1, 2, 3, 4]);
    const objeto: EstadoConhecido = { ultimoNsr: 4, hashesPorNsr: { 1: "h1", 2: "h2", 3: "h3", 4: "h4" } };
    const a = decidirImportacao(mapa, linhas);
    expect(decidirImportacao(mapa, linhas)).toEqual(a);
    expect(decidirImportacao(objeto, linhas)).toEqual(a);
    expect(a).toMatchObject({ inserir: [l(8)], lacunas: [{ de: 5, ate: 7 }] });
  });

  it("arquivo vazio não decide nada", () => {
    expect(decidirImportacao(estado([1]), [])).toEqual({ inserir: [], duplicadas: [], conflitos: [], quarentena: [], lacunasPreenchidas: [], lacunas: [], bloqueada: false, retidasPorBloqueio: [], novoUltimoNsr: 1, crcVerificavel: true });
  });
});

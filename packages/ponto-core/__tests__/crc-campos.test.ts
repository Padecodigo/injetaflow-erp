import { describe, expect, it } from "vitest";
import { cnpjValido, cpfValido, lerCpf12, lerCpfResponsavel, lerData, lerDataHora } from "../src/campos";
import { crc16Kermit, crc16KermitHex } from "../src/crc16";
import { codificarLatin1, decodificarLatin1 } from "../src/latin1";
import { CNPJ_ALFANUMERICO, CPF_A, gerarCnpj } from "./fixtures/gerador";

describe("CRC-16/KERMIT", () => {
  it('vetor oficial do leiaute: "123456789" → 2189', () => {
    expect(crc16Kermit("123456789")).toBe(0x2189);
    expect(crc16KermitHex("123456789")).toBe("2189");
  });
  it("bytes e texto latin1 dão o mesmo resultado; vazio = 0000", () => {
    expect(crc16KermitHex(codificarLatin1("Indústria"))).toBe(crc16KermitHex("Indústria"));
    expect(crc16KermitHex("")).toBe("0000");
  });
});

describe("latin1", () => {
  it("ida e volta preserva acentos e bytes 0x80–0xFF", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(codificarLatin1(decodificarLatin1(bytes))).toEqual(bytes);
    expect(decodificarLatin1(Uint8Array.from([0x53, 0xe3, 0x6f]))).toBe("São");
  });
});

describe("campos D e DH", () => {
  it("DH com fuso -0300 e -0200 normaliza para UTC e guarda o original", () => {
    expect(lerDataHora("2021-04-27T16:44:00-0300")).toMatchObject({ utc: "2021-04-27T19:44:00.000Z", fuso: "-0300", offsetMinutos: -180, dataLocal: "2021-04-27", segundosNaoZero: false });
    expect(lerDataHora("2026-10-01T18:00:00-0200")).toMatchObject({ utc: "2026-10-01T20:00:00.000Z", fuso: "-0200", offsetMinutos: -120 });
    expect(lerDataHora("2026-10-01T23:30:00-0300")!.utc).toBe("2026-10-02T02:30:00.000Z");
    expect(lerDataHora("2026-10-01T08:00:00+0000")).toMatchObject({ utc: "2026-10-01T08:00:00.000Z", offsetMinutos: 0 });
  });
  it("DH inválida devolve null (sem exceção)", () => {
    for (const t of ["2026-02-30T08:00:00-0300", "2026-10-01T24:00:00-0300", "2026-10-01 08:00:00-0300", "2026-10-01T08:00:00", "2026-10-01T08:00:00-03:00", "", "xxxxxxxxxxxxxxxxxxxxxxxx"]) {
      expect(lerDataHora(t), t).toBeNull();
    }
    expect(lerDataHora("2026-10-01T08:00:30-0300")!.segundosNaoZero).toBe(true);
  });
  it("D", () => {
    expect(lerData("2024-02-29")).toBe("2024-02-29");
    expect(lerData("2026-02-29")).toBeNull();
    expect(lerData("01/10/2026")).toBeNull();
  });
});

describe("CPF e CNPJ (sintéticos)", () => {
  it("CPF em 12 posições nos dois formatos do FAQ 50", () => {
    expect(lerCpf12(`0${CPF_A}`)).toBe(CPF_A);
    expect(lerCpf12(`${CPF_A} `)).toBe(CPF_A);
    expect(lerCpf12(` ${CPF_A}`)).toBeNull();
    expect(lerCpf12(`1${CPF_A}`)).toBeNull();
    expect(lerCpf12("0123")).toBeNull();
  });
  it("CPF de responsável com zeros à esquerda ou espaços à direita", () => {
    expect(lerCpfResponsavel(`000${CPF_A}`)).toBe(CPF_A);
    expect(lerCpfResponsavel(`${CPF_A}   `)).toBe(CPF_A);
    expect(lerCpfResponsavel(CPF_A)).toBe(CPF_A);
    expect(lerCpfResponsavel(`123${CPF_A}`)).toBeNull();
  });
  it("dígitos verificadores", () => {
    expect(cpfValido(CPF_A)).toBe(true);
    expect(cpfValido(CPF_A.slice(0, 10) + ((Number(CPF_A[10]) + 1) % 10))).toBe(false);
    expect(cpfValido("11111111111")).toBe(false);
  });
  it("CNPJ alfanumérico (exemplo da Receita 12.ABC.345/01DE-35) e numérico", () => {
    expect(CNPJ_ALFANUMERICO).toBe("12ABC34501DE35");
    expect(cnpjValido("12ABC34501DE35")).toBe(true);
    expect(cnpjValido("12ABC34501DE36")).toBe(false);
    expect(cnpjValido(gerarCnpj("112223330001"))).toBe(true);
    expect(cnpjValido("12abc34501de35")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
  });
});

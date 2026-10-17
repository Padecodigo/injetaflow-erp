/**
 * Regrava as fixtures sintéticas em disco (ISO 8859-1, CR LF): `npx tsx packages/ponto-core/__tests__/fixtures/gerar.ts`.
 * O teste de integração confere que os arquivos versionados são idênticos ao gerador.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { linhasRepC, linhasRepP, montarAfd } from "./gerador";

const pasta = import.meta.dirname;
writeFileSync(join(pasta, "afd-671-repc-sintetico.txt"), montarAfd(linhasRepC()));
writeFileSync(join(pasta, "afd-671-repp-sintetico.txt"), montarAfd(linhasRepP()));
console.log("fixtures sintéticas regravadas em", pasta);

# Contribuindo com o InjetaFlow

## Antes de começar
Leia `AGENTS.md` e `docs/00-indice.md`. Para módulo novo, alinhe requisitos, regra de negócio, permissão, auditoria e modelo de dados antes de criar a tela.

## Fluxo
Crie uma branch curta. Descreva o problema e o resultado esperado. Implemente uma fatia vertical. Atualize documentação e testes. Rode `pnpm check`, `pnpm test` e `pnpm build` ou o build aplicável. Abra PR com critérios de aceite, riscos e evidência visual.

## Checklist de PR
- [ ] Tenant e unidade vêm da sessão/contexto.
- [ ] Permissão é validada no backend.
- [ ] Mutação exige número de registro.
- [ ] Auditoria registra antes/depois quando aplicável.
- [ ] Estados de loading, vazio, erro e sem permissão existem.
- [ ] Testes cobrem sucesso e falhas de autorização.
- [ ] Migration é versionada e reversível ou possui plano documentado.
- [ ] UI funciona em desktop, tablet e mobile.
- [ ] Nenhum segredo ou dado sensível foi commitado.

## Comandos
```bash
pnpm check
pnpm test
pnpm build
pnpm dev
```

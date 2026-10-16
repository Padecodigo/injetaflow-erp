# InjetaFlow ERP

React / Express / tRPC / Drizzle starter, adapted from the Sandbox web-db-user template.

## Documentação para desenvolvimento no Cursor

O contexto profissional do produto está em [`docs/00-indice.md`](docs/00-indice.md). Comece por [`AGENTS.md`](AGENTS.md), depois consulte as regras de domínio, segurança, UX, arquitetura e testes antes de implementar módulos. O prompt completo para o Cursor está em [`docs/11-prompt-mestre-cursor.md`](docs/11-prompt-mestre-cursor.md).

O protótipo atual contempla dashboard público, módulos operacionais, bloqueio visual de áreas restritas, login demonstrativo e exigência de número de registro para ações. Autenticação real, permissões persistidas, auditoria no backend e integrações industriais estão descritas como próximos incrementos.

- `pnpm dev`: development server; honors `PORT` (default 3000).
- `pnpm build` / `pnpm start`: build and serve `dist/index.js` and `dist/public/`.
- `pnpm db:migrate`: apply checked-in migrations. `pnpm db:push`: generate and apply new schema changes.
- `pnpm check` / `pnpm test`: types and application tests.

Start with the Webdev skill's default-template guide. Platform login, storage, payments and service contracts live in its shared references; read the relevant capability before extending its helper.

`server/_core/publicConfig.ts` exposes only named public runtime values. Private keys stay server-side. The platform serves managed `/manus-storage/` assets; the application does not register a second proxy.

Platform configuration is readable and editable through `webdev.config`. Default settings are initial values, not enforced constraints. The agent may modify the files, commands and configuration or follow the flexible guide for another stack.

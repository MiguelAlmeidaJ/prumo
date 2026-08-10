# AGENTS.md | Prumo

Prumo é um SaaS multi-tenant para gestão de autoescolas, desenvolvido pela Anoar.

## Aplicações

- apps/api: NestJS
- apps/web: Next.js
- apps/mobile: Expo
- packages/database: Prisma e PostgreSQL
- packages/contracts: schemas e tipos compartilhados

## Regras

1. Manter NestJS como monólito modular.
2. Entidades da autoescola devem possuir tenantId.
3. Nunca usar tenantId enviado pelo frontend como fonte de autorização.
4. Validar tenant pela membership do usuário autenticado.
5. Filtrar consultas de negócio pelo tenant ativo.
6. Usuários podem participar de múltiplos tenants.
7. Não criar microsserviços nesta fase.
8. Compartilhar contratos em packages/contracts.
9. Valores financeiros em centavos.
10. Datas em UTC.
11. Criar testes de isolamento multi-tenant.
12. Executar build, lint, typecheck e testes antes de concluir.

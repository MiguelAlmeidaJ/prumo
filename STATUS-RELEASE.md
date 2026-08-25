# Prumo RC1 — Homologação

Commit-base: `fc7bf00`

Data da auditoria: 25 de agosto de 2026

Este é o documento canônico do gate da release. Resultados históricos nos
demais documentos não substituem uma execução fresca registrada aqui.

| Gate      | Estado  | Evidência                                                                    |
| --------- | ------- | ---------------------------------------------------------------------------- |
| CI        | PARCIAL | workflow inclui `release`; proteção e checks obrigatórios dependem do GitHub |
| Database  | PASS    | PostgreSQL zerado, 19 migrations, seed repetido e verificação idempotente    |
| API       | PASS    | build, lint, typecheck, 47 unitários e 104 E2E                               |
| Web       | PASS    | build, lint, typecheck e 21 testes                                           |
| Mobile    | PARCIAL | gates locais e export web passam; preview APK físico pendente                |
| Security  | PASS    | 0 critical, 2 high aceitos, 0 moderate                                       |
| Staging   | PENDING | PostgreSQL, Redis, S3, SMTP, API, web e mobile                               |
| UAT       | PENDING | homologação por persona e isolamento entre tenants                           |
| Migration | PARCIAL | fase 1: unidades, instrutores e alunos                                       |

## Evidência local de 25 de agosto de 2026

- instalação congelada, Prisma generate e validate: PASS;
- banco temporário zerado `prumo_rc1_codex`: 19 migrations aplicadas;
- `pnpm lint`: PASS com 3 warnings preexistentes no web e nenhum erro;
- `pnpm typecheck`: PASS;
- testes: 41 arquivos e 304 testes aprovados;
- concorrência financeira: 8 cenários críticos aprovados em PostgreSQL real;
- `pnpm build`: PASS para API, web e export mobile;
- seed demo executado duas vezes, verificado sem duplicação;
- smoke demo: gestão, instrutor, aluno e 12 coleções aprovados;
- providers SMTP e Expo são in-memory em `APP_ENV=test`, sem rede externa.

## Bloqueadores P0

- proteger `main` e, idealmente, `release` no GitHub;
- exigir todos os jobs da CI antes do merge;
- abrir o PR `release` → `main` sem integrá-lo;
- subir staging e concluir o checklist por persona;
- homologar storage S3-compatible, SMTP e Expo Push reais.

## Observações não bloqueantes locais

- `pg@8` emite aviso de depreciação ao exercitar algumas consultas
  concorrentes; revisar antes de uma futura atualização para `pg@9`;
- Nest converte automaticamente o wildcard legado do middleware global;
  atualizar a rota ao revisar a configuração de bootstrap;
- o lint web mantém 3 warnings de variáveis não usadas.

## Evidência exigida para promover

- URL da execução verde da CI no commit candidato;
- commit e imagens imutáveis publicados em staging;
- resultado dos comandos locais e das migrations;
- checklist em [`docs/checklist-homologacao.md`](docs/checklist-homologacao.md);
- responsável, data e evidência para cada validação externa.

Nenhum gate `PENDING`, `FAIL` ou bloqueador P0 aberto permite o merge da RC1.

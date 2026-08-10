# Relatório de Homologação da API

Data da auditoria: 10/08/2026

Escopo: `apps/api`, `packages/database`, `packages/contracts` e compatibilidade estática com `apps/web` e `apps/mobile`.
Critério: prontidão para entregar o ambiente a homologadores, incluindo segurança, isolamento multi-tenant, integridade transacional e reprodução fresca dos testes.

## 1. Veredito

🔴 NÃO RECOMENDADA PARA HOMOLOGAÇÃO

A API compila, passa em typecheck e lint, possui uma arquitetura modular coerente e uma suíte relevante de testes. A autenticação, a autorização por permission e o isolamento por tenant nos serviços estão, em geral, bem implementados.

Entretanto, há três grupos de bloqueadores P0:

1. estados financeiros podem divergir sob requisições concorrentes, pois decisões são tomadas fora da transação e as gravações não fazem compare-and-swap;
2. caixa e despesas têm o mesmo tipo de corrida, permitindo duas aberturas, movimento após fechamento ou pagamento/cancelamento simultâneos;
3. o seed pode criar, reativar ou redefinir contas privilegiadas usando credenciais previsíveis quando configurado a partir do exemplo.

Além disso, PostgreSQL e Docker estavam indisponíveis na execução fresca. Por isso, migration status, seed e os E2E não puderam ser reproduzidos no estado final. Um resultado anterior de E2E foi apenas reproduzido do cache do Turbo e não foi usado como aprovação.

Resposta à pergunta central: **não, esta API não deve ser enviada para homologação com segurança antes da correção dos P0 e da execução fresca do gate de banco/E2E**.

## 2. Score

| Área                       |   Nota | Fundamentação resumida                                                                                              |
| -------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------- |
| Build                      |  10/10 | Build da API e do monorepo concluído.                                                                               |
| Arquitetura                | 8,5/10 | Monólito modular NestJS, contratos e banco separados; limites de módulos claros.                                    |
| Funcionalidade             |   7/10 | Cobertura funcional ampla, mas validação dinâmica final indisponível.                                               |
| Autenticação               | 7,5/10 | Refresh rotativo, revogação, hash e anti-enumeração; secrets e MFA precisam endurecimento.                          |
| RBAC                       |   8/10 | Guards e permissions no backend; invariantes de último owner não são concorrentes.                                  |
| Multi-tenancy              |   8/10 | Contexto autenticado e filtros consistentes; quatro relações não garantem tenant no FK.                             |
| Segurança                  |   6/10 | Helmet, CORS e rate limit existem; seed, secrets, MFA e dependências impedem nota maior.                            |
| Integridade de dados       |   3/10 | Corridas financeiras podem gerar estados contraditórios.                                                            |
| Banco                      |   7/10 | Schema válido e 15 migrations; status contra o banco não foi verificável.                                           |
| Agenda                     |   9/10 | Locks consultivos, transação serializável, validações e testes de concorrência existentes.                          |
| Financeiro                 |   3/10 | Cálculos em centavos são bons, mas as máquinas de estado não são seguras sob concorrência.                          |
| Documentos                 |   7/10 | Escopo, MIME, magic bytes e limites adequados; storage local carece de controles operacionais.                      |
| Notificações               |   8/10 | Outbox/filas, retries, idempotência e sanitização; depende de Redis/providers externos.                             |
| Testes                     |   7/10 | 112 testes estáticos de tenant, 28 unitários de API e 90 E2E definidos após a auditoria; E2E final não reproduzido. |
| Observabilidade            |   5/10 | Auditoria e logs existem; health público é apenas liveness e não há readiness completo.                             |
| Performance                |   6/10 | Paginação predominante e índices bons; há listas sem limite e loops operacionais.                                   |
| Prontidão para homologação |   3/10 | Há P0 e o gate fresco de banco/E2E está incompleto.                                                                 |

### 2.1 Arquitetura e inventário confirmados

- Monorepo pnpm/Turbo: `apps/api` (NestJS 11/Express), `apps/web` (Next.js 16), `apps/mobile` (Expo 54), `packages/database` (Prisma/PostgreSQL) e `packages/contracts` (Zod/tipos).
- API principal: `apps/api`, prefixo global `/api`, monólito modular.
- ORM/banco: Prisma Client 6.19.3 gerado, PostgreSQL; valores financeiros inteiros em centavos e datas persistidas como `DateTime`/UTC.
- Autenticação: Passport JWT, access/refresh separados, refresh armazenado como hash, sessões persistidas e rotação.
- Cache/filas: Redis/ioredis e BullMQ.
- Storage: filesystem local, com diretórios configuráveis para documentos de processos e mobile.
- Integrações: PostgreSQL, Redis, SMTP/Nodemailer e Expo Push API. Não foi encontrada integração bancária/gateway de pagamento externa.
- Módulos Nest: Database, Dashboard, Auth, Communication, Students, TenantSettings, Instructors, Vehicles, Schedule, Security, Processes, Financial, Mobile, Platform e Identity.
- HTTP: 32 classes `@Controller`, distribuídas em 24 arquivos, e 284 handlers HTTP.
- Proteções: `JwtAuthGuard`, `TenantGuard`, `PermissionsGuard`, `AuthRateLimitGuard`, `PlatformRolesGuard`, `PlatformPermissionsGuard`, `SupportSessionGuard` e `PlatformRateLimitGuard`.
- Infra transversal: Helmet, CORS, parsers com limite de 14 MB, `ValidationPipe` global com `whitelist`, `forbidNonWhitelisted` e `transform`; existe também `ZodValidationPipe`. Não há filter/interceptor/middleware Nest global customizado.
- Decorators de contexto: `CurrentUser`, `CurrentTenant`, `Permissions`, `PlatformRoles`, `PlatformPermissions`, `CurrentPlatformUser` e `CurrentSupportSession`.
- Filas: `domain-events`, `notifications`, `emails`, `push-notifications`, `reminders` e `communication-campaigns`; dispatcher repetido a cada 30 segundos e rotina horária no minuto 15.
- Banco: 15 diretórios de migration e um seed Prisma.
- Multi-tenancy: `tenantId` obrigatório nas entidades da autoescola, tenant efetivo derivado da membership autenticada pelo `TenantGuard`, e consultas de negócio predominantemente filtradas por `tenantId`.

### 2.2 Inventário resumido de endpoints

Todos os handlers foram inspecionados por controller, guard, tenant, DTO e efeito colateral. A tabela abaixo consolida a matriz de 284 endpoints; os controllers de tenant usam o contexto autenticado, não um `tenantId` do body.

| Grupo/controller          | Base route(s)                                                                       | Handlers | Proteção observada                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------- | -------: | ------------------------------------------------------------------------------------ |
| Health                    | `/health`                                                                           |        1 | Público, somente liveness.                                                           |
| Auth                      | `/auth`                                                                             |        7 | Login/refresh/reset públicos com rate limit; logout autenticado por token de sessão. |
| Identity/equipe           | `/auth`, `/team`                                                                    |        9 | Rotas de credencial públicas limitadas; equipe com JWT + tenant + permission.        |
| Dashboard                 | `/dashboard`                                                                        |        1 | JWT + tenant + permission.                                                           |
| Tenant settings           | `/tenant/settings`                                                                  |        2 | JWT + tenant + permission.                                                           |
| Students                  | `/students`                                                                         |        5 | JWT + tenant + permission; UUID validado.                                            |
| Instructors               | `/instructors`                                                                      |        5 | JWT + tenant + permission; UUID validado.                                            |
| Vehicles                  | `/vehicles`                                                                         |        5 | JWT + tenant + permission; UUID validado.                                            |
| Schedule/units/classrooms | `/schedule`, `/units`, `/classrooms`                                                |       14 | JWT + tenant + permission; locks/transações nos agendamentos.                        |
| Availability/blocks       | `/instructor-availabilities`, `/schedule-blocks`                                    |       10 | JWT + tenant + permission.                                                           |
| Lessons/classes           | `/practical-lessons`, `/theoretical-classes`                                        |       21 | JWT + tenant + permission; validação de conflitos.                                   |
| Processes/exams/documents | `/processes`, `/exams`, `/processes/:processId/documents`                           |       29 | JWT + tenant + permission; acesso ao arquivo revalidado.                             |
| Financial                 | services, plans, contracts, receivables, payments, cash, expenses, reports/settings |       62 | JWT + tenant + permissions específicas.                                              |
| Communication             | `/notifications`, `/communication`, `/communication/campaigns`                      |       34 | JWT + tenant; administração exige permissions.                                       |
| Mobile                    | `/mobile`                                                                           |       43 | JWT + tenant e autorização por perfil/objeto no `MobileAccessService`.               |
| Platform                  | `/platform`                                                                         |       36 | JWT + rate limit + roles/permissões globais; support session quando aplicável.       |

Não foi encontrado controller de negócio acidentalmente público. A exceção intencional é `/api/health`; os fluxos públicos de autenticação/credencial têm validação e limitação próprias.

## 3. Bloqueadores P0

### P0-01 — Máquina de estados de pagamentos e contratos não é concorrente

- **Problema:** `confirmPayment` e `cancelPayment` leem `PENDING` antes de entrar na transação e depois fazem `update` incondicional por `id`. Transições de contrato e verificações de pagamento/parcelas seguem o mesmo padrão. A transação serializável da confirmação não relê nem reivindica o status do pagamento dentro dela.
- **Impacto:** confirmação e cancelamento podem ambos responder sucesso; o pagamento pode terminar `CANCELLED` enquanto parcelas e caixa refletem uma confirmação. Cancelamento/conclusão de contrato também pode correr com confirmação de pagamento ou ajuste.
- **Arquivos:** `apps/api/src/financial/receivables-payments.service.ts` (`confirmPayment`, `cancelPayment`, `refundPayment`) e `apps/api/src/financial/catalogs.service.ts` (`completeContract`, `cancelContract`, `addAdjustment`, `transitionContract`).
- **Endpoints afetados:** `POST /api/payments/:id/confirm`, `POST /api/payments/:id/cancel`, `POST /api/payments/:id/refunds`, transições e ajustes de `/api/contracts/:id/...`.
- **Como reproduzir:** crie pagamento `PENDING` com allocation e envie confirmação e cancelamento simultaneamente. O teste novo `serializa confirmação e cancelamento concorrentes do mesmo pagamento` formaliza a expectativa de um `201` e um `409`.
- **Correção recomendada:** mover todas as leituras decisórias para uma transação serializável; reivindicar a transição com `updateMany({ where: { id, tenantId, status: esperado } })` e exigir `count === 1`; reler allocations/parcelas dentro da transação; aplicar retry limitado para `P2034`; adicionar invariantes pós-transação.

### P0-02 — Caixa e despesas permitem gravações contraditórias

- **Problema:** `openCash` verifica caixa existente fora da transação e não há unique parcial para caixa aberto. `closeCash`, `manualMovement`, `updateExpense`, `payExpense` e `cancelExpense` também verificam status/saldo antes da transação e atualizam incondicionalmente.
- **Impacto:** duas caixas abertas para a mesma unidade/usuário; retirada depois do fechamento; duas retiradas ultrapassando saldo; despesa cancelada com movimento de caixa e saldo decrementado; alteração concorrente de despesa já paga.
- **Arquivo:** `apps/api/src/financial/cash-expenses.service.ts`.
- **Endpoints afetados:** `POST /api/cash-registers/open`, `POST /api/cash-registers/:id/{supply,withdrawal,adjustment,close}`, `PATCH /api/expenses/:id`, `POST /api/expenses/:id/{pay,cancel}`.
- **Como reproduzir:** dispare duas aberturas simultâneas com mesmo `unitId`/usuário. O teste novo `aceita somente uma abertura concorrente de caixa por unidade e usuário` exige um único caixa aberto.
- **Correção recomendada:** transações serializáveis com leituras internas, CAS por status, retry `P2034`, proteção de saldo no próprio update e constraint/índice parcial PostgreSQL para unicidade de caixa `OPEN` por unidade e por operador. Pagamento/cancelamento de despesa deve reivindicar o estado antes de criar movimento.

### P0-03 — Seed inseguro para ambiente não local

- **Problema:** o seed possui `PrumoDev@123` como fallback e o `.env.example` define a mesma senha para admin do tenant e owner global. Em produção, o código apenas exige que as variáveis existam; copiar o exemplo satisfaz essa condição. Upserts também reativam contas/memberships e podem atualizar hash/role/status em nova execução.
- **Impacto:** criação ou restauração previsível de acesso `TENANT_OWNER` e `PLATFORM_OWNER`, além de tenants/dados demo em homologação/produção.
- **Arquivo:** `packages/database/prisma/seed.ts`, especialmente constantes iniciais, validação de ambiente e upserts de usuários/memberships; `.env.example`.
- **Endpoint afetado:** não é endpoint; comando `pnpm db:seed`.
- **Como reproduzir:** configure `NODE_ENV=production` com os valores de seed do example e execute o seed em banco descartável. As variáveis estão presentes, portanto a barreira de produção não rejeita a credencial conhecida.
- **Correção recomendada:** separar `seed:reference` de `seed:demo`; proibir seed demo fora de `development/test`; rejeitar valores conhecidos e igualdade entre senhas; não atualizar senha/role/active de usuário existente; criar bootstrap de owner explícito, one-shot e auditável.

## 4. Problemas P1

### P1-01 — Gate fresco de banco e E2E não foi reproduzido

PostgreSQL/Docker Desktop estava indisponível. `prisma migrate status` falhou no schema engine e a execução direta da API falhou no setup das 9 suítes E2E existentes. O `pnpm test` posterior ficou verde apenas por replay de cache do Turbo, portanto não comprova o estado atual. Antes da homologação é obrigatório executar migrations, seed seguro e os 90 E2E definidos após esta auditoria em banco limpo.

### P1-02 — Secrets e configuração crítica sem validação forte

`JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` são exigidos, mas não há schema global de configuração, comprimento/entropia mínimos nem rejeição dos padrões do example. O `.env` auditado continha padrões equivalentes aos valores de exemplo e comprimentos baixos. A API pode iniciar com segredo previsível. Centralizar a validação no bootstrap e falhar antes de abrir a porta.

### P1-03 — Invariante de último owner sofre race condition

As proteções de último `TENANT_OWNER` e `PLATFORM_OWNER` usam `count` seguido de update. Duas desativações/reduções concorrentes podem observar outro owner e remover ambos. Arquivos principais: `apps/api/src/identity/identity.service.ts` e `apps/api/src/platform/platform.service.ts` (`assertNotLastOwner`). Usar transação serializável/advisory lock ou uma estratégia de governança com constraint.

### P1-04 — MFA modelado, mas não implementado/enforced

Existem `User.mfaEnabled` e `TenantSettings.requireMfaForManagers`, mas não há challenge MFA no login nem enforcement para owner/admin global. Para console de plataforma e suporte, isso é um risco relevante. Implementar MFA antes de expor credenciais privilegiadas fora da equipe interna, ou desabilitar claramente flags ainda não suportadas.

### P1-05 — Storage de documentos depende do filesystem local

Upload valida autorização, tamanho, MIME, magic bytes, nome e token one-shot, mas os arquivos ficam em diretório local. Não foi encontrado antivírus, criptografia/retention, storage compartilhado, backup ou política de órfãos robusta. Para mais de uma instância ou dados reais de homologação, usar object storage privado com scan, checksum, lifecycle e download autorizado.

### P1-06 — Listagens operacionais sem limite máximo

`LessonQueryDto`, queries de turmas/bloqueios/disponibilidades e `MobileRangeQueryDto` aceitam intervalo opcional sem paginação ou janela máxima. A omissão de `from/to` pode retornar todo o histórico do tenant. Impor paginação/cursor e limitar janelas de data, mantendo compatibilidade por default controlado.

## 5. Problemas P2

### P2-01 — Quatro relações tenant-scoped não garantem tenant no FK

O schema permite associação cruzada em `Lesson.rescheduledFrom`, `Exam.rescheduledFrom`, `NotificationDelivery.notification` e `CommunicationCampaignRecipient.delivery`, pois o FK usa apenas `id`. A maioria das demais relações sensíveis usa `[id, tenantId]`. Adicionar uniques compostos e FKs compostos em migration revisada.

### P2-02 — Rate limit da plataforma é local e responde 403

`PlatformRateLimitGuard` mantém contadores em memória. Em múltiplas instâncias, o limite é por processo e pode ser contornado. O excesso lança `ForbiddenException` (403), não 429. Migrar para Redis, usar chave confiável com proxy configurado e retornar `TooManyRequests`/429.

### P2-03 — IDs do console de plataforma não usam `ParseUUIDPipe`

Há 22 usos de `@Param` em `platform.controller.ts` sem `ParseUUIDPipe`. UUID inválido pode chegar ao Prisma e virar 500/P2023. Aplicar validação aos IDs de tenant, usuário, plano, subscription e support session; manter `feature` como enum/string validada.

### P2-04 — Health público não comprova readiness

`GET /api/health` só retorna status, serviço e timestamp. Não verifica PostgreSQL, Redis, filas, storage, SMTP/Expo nem status de migrations. Manter liveness simples e criar readiness protegido/operacional com timeouts e resposta sem secrets.

### P2-05 — Auditoria de dependências falha

`pnpm audit --prod --audit-level high` encontrou 11 vulnerabilidades (9 high e 2 moderate) em `brace-expansion`, `js-yaml`, `image-size` e `nanoid`. A maior parte dos caminhos reportados pertence ao toolchain Expo/React Native; na API, caminhos identificados foram principalmente devDependencies e `@nestjs/swagger`. O risco de runtime da API deve ser confirmado com artefato de produção/SBOM, mas o gate do monorepo está vermelho e as versões devem ser atualizadas/testadas.

### P2-06 — OpenAPI é parcial

Swagger é desligado por padrão em produção e há bearer auth, DTOs e tags. Porém foram encontrados 50 `@ApiOperation` e 32 decorators de resposta para 284 handlers, indicando documentação de operações/respostas incompleta. Completar status/erros e exemplos dos fluxos críticos e gerar um diff do OpenAPI no CI.

### P2-07 — Alunos transitam pelo contrato de equipe

`STUDENT` é uma membership real e o endpoint de equipe pode listar/convidar esse papel; o web filtra alunos na apresentação. Não é bypass de autorização, mas mistura semântica de equipe e aluno e pode causar exposição funcional futura. Definir decisão de produto e, se a separação for obrigatória, filtrar no backend ou expor endpoint próprio sem quebrar mobile/web.

## 6. Problemas P3

1. `.env.example` não declara `NODE_ENV`, `UPLOAD_DIR` e `MOBILE_UPLOAD_DIR`, embora sejam usados/documentados em outros pontos.
2. Lint do web passa com três warnings de variáveis `logout`/`isSubmitting` não usadas.
3. Não existe script separado de testes de integração; integração e E2E estão acoplados em `vitest run src test`.
4. A API usa prefixo `/api`, mas não possui versionamento explícito; planejar antes de consumidores externos.
5. O incremento de falhas de login não é uma operação atômica completa; sob concorrência extrema o lockout pode perder incremento.
6. Campanhas e alguns dispatches fazem trabalho por destinatário/loop; medir filas e latência antes de volumes altos.

A busca por `TODO`, `FIXME`, `HACK`, `XXX`, `NotImplemented`, `fake`, `stub` e `placeholder` não encontrou implementação fake de produção. Ocorrências de `mock` estão concentradas em testes; textos com “temporário” são mensagens funcionais.

## 7. Segurança

### Vulnerabilidades e riscos encontrados

- **Crítico:** seed pode provisionar/restaurar owners com credencial previsível (P0-03).
- **Crítico de integridade:** corridas financeiras permitem estados contraditórios (P0-01/P0-02).
- **Alto:** secrets JWT fracos/padrão não são rejeitados (P1-02).
- **Alto:** remoção concorrente do último owner de tenant/plataforma (P1-03).
- **Alto:** ausência de MFA efetivo para privilégios globais (P1-04).
- **Alto operacional:** documentos locais sem scan/durabilidade/retention (P1-05).
- **Médio:** relações sem FK composto podem produzir associação cross-tenant (P2-01).
- **Médio:** rate limit global local por instância e status HTTP incorreto (P2-02).
- **Médio:** UUID inválido no platform pode virar 500 (P2-03).
- **Médio/pendente:** 11 advisories no workspace (P2-05).

### Controles positivos confirmados

- Login usa resposta genérica, dummy bcrypt e lockout; reset de senha não enumera contas.
- Refresh token é armazenado como HMAC/hash, rotacionado, revogado e reuse detection revoga sessões.
- Usuário, membership, tenant e permissions são revalidados no backend; mudança de role não depende de claim antiga.
- Tokens de convite/reset são aleatórios, armazenados por hash, expiram e têm consumo atômico.
- `ValidationPipe` impede propriedades extras e faz transform; DTOs usam UUID, enums, limites, datas e inteiros.
- Helmet, CORS explícito em produção, limite de body e Swagger off por padrão em produção estão presentes.
- Upload mobile usa token one-shot, limite de 10 MB, allowlist e magic bytes; paths/storage keys são gerados no servidor.
- Não foram encontrados logs deliberados de senha, JWT, refresh token, Authorization ou payload financeiro completo.
- Não foi encontrado endpoint de debug público; endpoints de teste de comunicação exigem flag e proteção administrativa.
- Não foi encontrada SQL raw de negócio insegura; o uso raw relevante é advisory lock parametrizado da agenda.

### Erros HTTP

O código usa 400/401/403/404/409 de forma ampla. Não há exception filter customizado, então erros esperados não mapeados, como UUID Prisma no platform, podem virar 500. Rate limit de auth é distribuído; o da plataforma deve responder 429. O handler padrão do Nest não devolve stack em resposta normal, mas readiness/log aggregation devem ser verificados no ambiente.

## 8. Multi-tenancy

**Foi encontrada possibilidade de acesso cruzado entre autoescolas? SIM.**

Não foi confirmado um IDOR direto nos endpoints auditados: controllers de tenant usam `CurrentTenant`, o `TenantGuard` reconsulta membership ativa, e services usam predominantemente `findFirst/findMany` com `tenantId`. A suíte contém casos explícitos de tenant A não ler/alterar aluno, instrutor, veículo, processo, arquivo, agenda, financeiro e notificação do tenant B; os 112 testes estáticos de isolamento passaram.

Contudo, quatro foreign keys não carregam `tenantId` (P2-01). Um bug interno, import futuro ou operação administrativa pode gravar relação cruzada e um `include` subsequente pode expor registro do outro tenant. Por esse motivo, a resposta conservadora é SIM até a integridade referencial ser reforçada e os E2E serem executados frescos.

Pontos positivos adicionais:

- entidades da autoescola possuem `tenantId` e índices correspondentes;
- IDs associados são revalidados contra o tenant nos fluxos revisados;
- o frontend não é fonte de autorização do tenant;
- platform support exige sessão associada ao usuário, tenant e expiração;
- arquivos e notificações revalidam tenant/usuário/destinatário.

## 9. RBAC

Roles reais de tenant: `TENANT_OWNER`, `TENANT_ADMIN`, `SECRETARY`, `FINANCE`, `INSTRUCTOR`, `STUDENT`. Não existe role `MANAGER` separada. Roles globais observadas: `PLATFORM_OWNER`, `PLATFORM_ADMIN` e `PLATFORM_SUPPORT`.

| Perfil           | Áreas principais permitidas                                                               | Restrições confirmadas/ressalvas                                                          |
| ---------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| PLATFORM_OWNER   | Console global, usuários globais, tenants, planos, suporte, settings conforme permissions | Não recebe acesso normal a módulos tenant sem sessão de suporte; último owner sofre race. |
| PLATFORM_ADMIN   | Administração global explicitamente concedida                                             | Não herda wildcard; ações sensíveis exigem permissions/reauth conforme rota.              |
| PLATFORM_SUPPORT | Recursos de suporte e sessão limitada                                                     | Não acessa livremente módulos tenant; sessão valida tenant/usuário/expiração.             |
| TENANT_OWNER     | Todas as permissions operacionais do tenant                                               | Tenant vem da membership; último owner sofre race.                                        |
| TENANT_ADMIN     | Administração ampla do tenant                                                             | Sem console global; permissions reavaliadas no backend.                                   |
| SECRETARY        | Cadastros, agenda/processos/comunicação conforme matriz                                   | Sem financeiro/global não concedido.                                                      |
| FINANCE          | Serviços, contratos, recebíveis, pagamentos, caixa, despesas e relatórios                 | Sem global; risco atual é integridade concorrente, não bypass RBAC.                       |
| INSTRUCTOR       | Mobile/perfil, agenda/aulas/turmas e objetos vinculados                                   | Bloqueado nos endpoints administrativos gerais e financeiros.                             |
| STUDENT          | Mobile/perfil, próprios processos/documentos/financeiro/agenda/notificações               | Bloqueado na administração; membership também aparece no domínio de equipe.               |

Não foi encontrado wildcard `*` concedido a role padrão, apesar de o valor existir no catálogo. As permissions usadas pelos decorators foram encontradas no catálogo correspondente. Segurança não depende do sidebar: os guards estão nos controllers/services.

## 10. Testes executados

| Comando                                           | Resultado                            | Observação                                                                                                                   |
| ------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                  | PASS                                 | Lockfile consistente.                                                                                                        |
| `pnpm db:generate`                                | PASS                                 | Prisma Client 6.19.3 gerado.                                                                                                 |
| `prisma validate` no database                     | PASS                                 | Schema Prisma válido.                                                                                                        |
| `prisma migrate status`                           | FAIL                                 | PostgreSQL/Docker indisponível; status/divergência não verificados.                                                          |
| `docker compose ps`                               | FAIL                                 | Docker Desktop engine não encontrado.                                                                                        |
| `pnpm --filter @prumo/api typecheck`              | PASS                                 | Após correção de `STUDENT`; repetido depois dos testes novos.                                                                |
| `pnpm typecheck`                                  | PASS                                 | 5 packages.                                                                                                                  |
| `pnpm --filter @prumo/api build`                  | PASS                                 | Nest build.                                                                                                                  |
| `pnpm build`                                      | PASS                                 | API, contracts, database, web e export mobile.                                                                               |
| `pnpm lint`                                       | PASS                                 | Sem erros; 3 warnings no web.                                                                                                |
| `pnpm --filter @prumo/api exec vitest run src`    | PASS                                 | 10 arquivos, 28 testes unitários.                                                                                            |
| testes de `packages/contracts`                    | PASS                                 | 5 testes.                                                                                                                    |
| testes de `packages/database`                     | PASS                                 | 112 testes estáticos de isolamento multi-tenant.                                                                             |
| `pnpm --filter @prumo/web test`                   | PASS                                 | 3 arquivos, 12 testes.                                                                                                       |
| `pnpm --filter @prumo/mobile test`                | PASS                                 | 7 arquivos, 12 testes.                                                                                                       |
| `pnpm --filter @prumo/api test` (execução fresca) | FAIL                                 | 28 unitários passaram; 9 suítes E2E falharam no setup por conexão a `localhost:5432`; 88 E2E então existentes foram skipped. |
| `pnpm test`                                       | PASS COM CACHE, NÃO ACEITO COMO GATE | Turbo reproduziu cache anterior com 116 testes de API verdes; não executou E2E fresco.                                       |
| 2 regressões financeiras adicionadas              | NÃO EXECUTADAS                       | Typecheck/lint PASS; dependem do PostgreSQL. Total esperado passa a 90 E2E.                                                  |
| script separado de integração                     | ➖ NÃO EXISTE                        | Integração está incorporada às suítes E2E do Vitest.                                                                         |
| `pnpm audit --prod --audit-level high`            | FAIL                                 | 11 vulnerabilidades: 9 high, 2 moderate.                                                                                     |
| seed                                              | NÃO EXECUTADO                        | Banco indisponível e seed atual classificado P0.                                                                             |

Status obrigatório consolidado:

- build: **PASS**;
- typecheck: **PASS**;
- lint: **PASS**;
- unit tests: **PASS**;
- integration tests: **FAIL / sem script dedicado e sem execução fresca do banco**;
- E2E: **FAIL na execução fresca por infraestrutura indisponível**.

## 11. Correções realizadas

| Arquivo                               | Correção                                                             | Motivo                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `packages/contracts/src/index.ts`     | Adicionado `STUDENT` a `membershipRoleValues`.                       | Prisma, seed, API, web e mobile já tratavam a role; o contrato compartilhado quebrava typecheck/build. |
| `apps/web/src/app/page.tsx`           | Adicionado rótulo `STUDENT: "Aluno"`.                                | O contrato corrigido revelou mapa `Record<MembershipRole, string>` incompleto.                         |
| `apps/api/test/financial.e2e.spec.ts` | Adicionados 2 E2E de concorrência: caixa e pagamento confirm/cancel. | Cobertura crítica ausente e P0 comprovado por inspeção. A implementação não foi mascarada.             |

Não foram usados `any`, `@ts-ignore`, desativação de regra ou remoção de teste.

## 12. Alterações não realizadas

- Refatoração transacional do financeiro: afeta pagamentos, parcelas, caixa, despesas, contratos, eventos e auditoria; requer desenho de CAS/retry, migration e E2E em banco real.
- Separação do seed de referência/demo e bootstrap de owner: exige decisão operacional sobre provisionamento de ambientes.
- Migração de storage local para object storage/antivírus: decisão de infraestrutura e custos.
- MFA: exige produto, UX web/mobile, recuperação e política de enforcement.
- FKs compostos tenant-scoped: requer migration avaliada contra dados existentes.
- Mudança do contrato “equipe x aluno”: exige alinhamento de produto para preservar clientes.
- Rate limit distribuído da plataforma e readiness completo: exige convenção de deploy/observabilidade.
- Atualização forçada de dependências transitivas: deve ser feita com matriz de compatibilidade Expo/Nest e novo audit.

## 13. Fluxos validados

Legenda: ✅ Validado · ⚠️ Parcialmente validado · ❌ Falhou · ➖ Não existe

| Fluxo                | Estado                   | Evidência/limite                                                                             |
| -------------------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| autenticação         | ⚠️ Parcialmente validado | Unit/static fortes e E2E em cache; execução fresca bloqueada, secret/MFA pendentes.          |
| equipe               | ⚠️ Parcialmente validado | Guards, tenant e convite revisados; corrida de último owner.                                 |
| alunos               | ⚠️ Parcialmente validado | CRUD/tenant cobertos por testes existentes; E2E final não fresco.                            |
| instrutores          | ⚠️ Parcialmente validado | CRUD, disponibilidade e restrições revisados; E2E final não fresco.                          |
| unidades             | ⚠️ Parcialmente validado | CRUD/uso/tenant presentes; E2E final não fresco.                                             |
| salas                | ⚠️ Parcialmente validado | Capacidade, unidade e conflitos cobertos; E2E final não fresco.                              |
| agenda               | ⚠️ Parcialmente validado | Implementação com advisory locks e serializable; cache anterior verde, sem reprodução final. |
| aulas práticas       | ⚠️ Parcialmente validado | Conflitos, transições e auditoria presentes.                                                 |
| turmas teóricas      | ⚠️ Parcialmente validado | Capacidade, presença e conflitos presentes.                                                  |
| exames               | ⚠️ Parcialmente validado | Pré-requisitos, tentativas e tenant revisados.                                               |
| financeiro           | ❌ Falhou                | P0 de concorrência em pagamentos, caixa, despesas e contratos.                               |
| documentos           | ⚠️ Parcialmente validado | Segurança de upload/download boa; storage operacional pendente.                              |
| notificações         | ⚠️ Parcialmente validado | Outbox, retries e preferências revisados; providers reais não testados.                      |
| administrador global | ⚠️ Parcialmente validado | Guards/suporte/reauth presentes; último owner, MFA e rate limit pendentes.                   |

## 14. Checklist para homologação

- [ ] Corrigir P0-01 com CAS/serializable/retry em pagamentos, refunds, contratos e ajustes.
- [ ] Corrigir P0-02 em caixa e despesas e criar constraints PostgreSQL para caixa aberto.
- [ ] Fazer os dois E2E financeiros novos passarem de forma repetida, incluindo execução paralela em loop.
- [ ] Separar seed demo/referência; bloquear credenciais conhecidas e impedir reset de contas existentes.
- [ ] Rotacionar JWT secrets; exigir entropia/tamanho e rejeitar padrões do example no bootstrap.
- [ ] Subir PostgreSQL e Redis limpos no mesmo perfil de homologação.
- [ ] Executar `prisma migrate status`, aplicar migrations com `migrate deploy` no banco descartável e confirmar ausência de drift.
- [ ] Executar seed seguro duas vezes e comprovar idempotência sem reset de credencial/status.
- [ ] Executar `pnpm test --force`/Turbo sem cache e registrar os 90 E2E frescos.
- [ ] Executar build, typecheck, lint e audit novamente no commit candidato.
- [ ] Corrigir a corrida de último owner em tenant e plataforma e adicionar teste concorrente.
- [ ] Definir/enforçar MFA para roles globais ou restringir o ambiente a usuários internos até concluir.
- [ ] Definir storage privado, backup, scan e retention para documentos de homologação.
- [ ] Impor paginação/janela máxima nas listas sem limite.
- [ ] Corrigir advisories high aplicáveis e produzir SBOM/scan do artefato da API.
- [ ] Adicionar validação UUID no console platform e confirmar que input inválido retorna 400.
- [ ] Reforçar quatro FKs compostos de tenant após checagem de dados.
- [ ] Configurar CORS, `TRUST_PROXY`, Redis, SMTP/Expo, URLs públicas e Swagger conforme o ambiente.
- [ ] Criar readiness e alertas para DB, Redis, filas e storage.
- [ ] Fazer smoke test real web/mobile contra o candidato, incluindo login, troca de tenant, agenda, documento e financeiro.
- [ ] Preservar evidências de logs/auditoria sem secrets e definir retenção.

## 15. Checklist pós-homologação

- [ ] Completar descrições de operação/respostas no OpenAPI e publicar diff versionado.
- [ ] Remover os três warnings de lint do web.
- [ ] Criar script separado para testes de integração e política explícita de cache no CI.
- [ ] Planejar versionamento da API antes de clientes externos.
- [ ] Medir latência, cardinalidade e backlog de campanhas/notifications com carga representativa.
- [ ] Adicionar métricas de negócio e tracing distribuído para providers externos.
- [ ] Formalizar separação de equipe e aluno no contrato sem quebra de clientes.
- [ ] Revisar índices com `EXPLAIN ANALYZE` usando volume semelhante ao real.
- [ ] Documentar RTO/RPO, restore de documentos e procedimento de rotação de secrets.
- [ ] Automatizar análise de código/dependências e geração de SBOM no CI.

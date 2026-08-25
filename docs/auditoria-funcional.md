# Auditoria funcional do PRUMO

Data da auditoria original: 28 de julho de 2026.

Revalidação da RC1: 25 de agosto de 2026.

## Resumo executivo

O PRUMO é um monorepo funcional, com API, web, aplicativo mobile e banco
integrados. A auditoria percorreu arquitetura, infraestrutura, autenticação,
RBAC, isolamento multi-tenant, API, regras de negócio, clientes e testes. Foram
encontrados 16 problemas: nenhuma falha crítica, 5 de severidade alta, 8 médias
e 3 baixas. Onze foram corrigidos integralmente; um foi mitigado parcialmente e
quatro permanecem como risco ou validação externa.

As correções mais relevantes foram:

- retirada do acesso administrativo concedido indevidamente ao instrutor;
- constraints compostas de tenant em relações que dependiam apenas do ID;
- controle de concorrência serializável com retry e transições atômicas;
- consumo atômico de token de upload e remoção compensatória de arquivo;
- proteção de rotas web por permissão de leitura e escrita;
- reconciliação de permissões da sessão restaurada e refresh único concorrente;
- Swagger fechado por padrão em produção e limite de corpo coerente com upload;
- redução das vulnerabilidades altas de dependências de 5 para 1.

O banco local está consistente e com 19 migrations aplicadas. O seed foi
executado repetidamente sem duplicar dados. Lint, typecheck, testes e build do
workspace foram executados contra a infraestrutura local.

## Arquitetura encontrada

| Camada       | Tecnologia                                  | Responsabilidade                                  |
| ------------ | ------------------------------------------- | ------------------------------------------------- |
| API          | NestJS 11, TypeScript                       | monólito modular, REST, Swagger, guards e workers |
| Web          | Next.js 16, React 19                        | console da autoescola e console da plataforma     |
| Mobile       | Expo SDK 54, React Native 0.81, Expo Router | fluxos separados de aluno e instrutor             |
| Banco        | PostgreSQL 17, Prisma 6                     | persistência, constraints e migrations            |
| Cache/filas  | Redis 7, BullMQ                             | outbox, lembretes e entregas                      |
| E-mail local | Mailpit, Nodemailer                         | SMTP de desenvolvimento                           |
| Push         | Expo Push                                   | entrega externa de notificações                   |
| Contratos    | Zod e TypeScript                            | tipos compartilhados entre aplicações             |
| Testes       | Vitest e Supertest                          | unitários, integração e API E2E                   |

Fluxo principal:

`Next.js/Expo -> NestJS -> guards JWT/tenant/permissão -> services tenant-scoped
-> Prisma -> PostgreSQL`. Eventos de comunicação passam por outbox e BullMQ no
Redis, com SMTP ou Expo Push como destino.

Não foram encontrados microsserviços, armazenamento simulado em memória ou
dados mockados em caminhos de produção.

## Aplicações e módulos

### API

A API possui 21 classes de controller e 270 handlers HTTP. Os módulos
inspecionados foram:

- autenticação, memberships, papéis tenant e papéis globais;
- alunos, instrutores e veículos;
- unidades, salas, disponibilidades e bloqueios;
- agenda, aulas práticas e turmas teóricas;
- processos, etapas, documentos e exames;
- serviços, planos, contratos, parcelas, pagamentos, caixas e despesas;
- notificações, preferências, templates, campanhas e eventos;
- endpoints mobile com autorização por objeto;
- console de plataforma, assinaturas, suporte temporário e auditoria.

Os controllers administrativos usam `JwtAuthGuard`, `TenantGuard` e
`PermissionsGuard`. O módulo mobile usa `JwtAuthGuard` e `TenantGuard`, seguido
de escopo por aluno/instrutor no `MobileAccessService`. O console global possui
guards separados de papel, permissão, suporte e limite de requisições.

### Web

Foram encontradas 72 páginas Next.js. A navegação tenant é derivada de uma
fonte central de permissões. A proteção do shell diferencia rotas de leitura,
criação e edição e falha de forma fechada para rotas desconhecidas. O console
global usa navegação e sessão separadas.

### Mobile

Foram encontradas 39 telas funcionais, além dos layouts. O Expo Router separa
grupos públicos, de aluno e de instrutor. O refresh token usa Secure Store em
Android/iOS, as requisições concorrentes compartilham uma única rotação e o
cache permitido é separado por tenant e usuário. A exportação web mantém o
refresh apenas em memória.

### Banco e contratos

O schema possui 49 modelos. Entidades de negócio são tenant-scoped e os testes
de metadados verificam todos os modelos que devem conter `tenantId`. Contratos
compartilhados cobrem autenticação, paginação, permissões e respostas usadas
pelos clientes.

## Comandos utilizados

```powershell
pnpm install --frozen-lockfile
pnpm infra:up
pnpm db:generate
pnpm --filter @prumo/database exec prisma validate
pnpm --filter @prumo/database exec prisma migrate deploy
pnpm --filter @prumo/database exec prisma migrate status
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod --audit-level high
pnpm dlx expo-doctor
pnpm peers check
docker compose ps
```

Comandos de desenvolvimento confirmados:

```powershell
pnpm dev
pnpm --filter @prumo/api dev
pnpm --filter @prumo/web dev
pnpm --filter @prumo/mobile dev
pnpm --filter @prumo/mobile exec expo start --tunnel
```

## Estado da infraestrutura

- Node.js usado: `v24.15.0`; o README exige Node.js 22.13 ou superior.
- pnpm usado: `11.16.0`, igual ao `packageManager` da raiz.
- Docker Engine: 29.4.2; Docker Compose: 5.1.3.
- PostgreSQL, Redis e Mailpit estavam ativos e saudáveis.
- O lockfile permaneceu válido depois dos overrides de segurança.
- No Windows, processos de desenvolvimento antigos mantinham a DLL do Prisma
  aberta e causaram `EPERM` durante `prisma generate`. Somente os processos do
  PRUMO foram encerrados e a geração passou.

Serviços necessários:

| Serviço      | Porta | Uso             |
| ------------ | ----- | --------------- |
| PostgreSQL   | 5432  | banco principal |
| Redis        | 6379  | filas BullMQ    |
| Mailpit SMTP | 1025  | e-mail local    |
| Mailpit UI   | 8025  | inspeção local  |

Variáveis verificadas, sem registrar seus valores secretos:

- banco e filas: `DATABASE_URL`, `REDIS_URL`, `QUEUE_ENABLED`,
  `QUEUE_MAX_ATTEMPTS`;
- JWT e bcrypt: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`,
  `JWT_PLATFORM_ACCESS_EXPIRES_IN`, `JWT_PLATFORM_REFRESH_EXPIRES_IN`,
  `BCRYPT_ROUNDS`;
- HTTP: `API_PORT`, `CORS_ORIGINS`, `SWAGGER_ENABLED`, `APP_WEB_URL`;
- comunicação: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
  `SMTP_PASSWORD`, `EMAIL_FROM`, `EMAIL_TIMEOUT_MS`,
  `ALLOW_COMMUNICATION_TEST_ENDPOINTS`, `EXPO_ACCESS_TOKEN`;
- clientes e arquivos: `NEXT_PUBLIC_API_URL`, `EXPO_PUBLIC_API_URL`,
  `MOBILE_UPLOAD_DIR`;
- seed: `SEED_ADMIN_PASSWORD`, `SEED_PLATFORM_PASSWORD`.

`MOBILE_UPLOAD_DIR` é opcional e agora está documentado no README. Push real
depende de credencial e dispositivo externos.

## Estado do banco e migrations

- Prisma format e validate: aprovados.
- Prisma Client: gerado.
- Estado final: 19 migrations aplicadas, nenhuma pendente.
- Seed: aprovado em duas execuções consecutivas e idempotentes.
- Não foi usada migration destrutiva, reset, `db push` ou remoção de dados.
- Consultas de integridade anteriores às novas FKs encontraram zero relações
  cruzadas entre tenants.

Migrations criadas nesta auditoria:

1. `20260728193000_tenant_relation_integrity`
   - FKs compostas por recurso e `tenantId` para requisito/aluno, sessão de
     upload/requisito e destinatário de campanha/aluno ou instrutor.
2. `20260728200000_document_upload_processing`
   - estado `PROCESSING` para reivindicação atômica de upload.

## Funcionalidades validadas

- autenticação válida e inválida, conta inativa e usuário sem membership;
- hash de refresh, rotação, detecção de reutilização e logout;
- seleção autorizada e não autorizada de tenant;
- revalidação da membership a cada request tenant;
- RBAC administrativo, de aluno, instrutor e plataforma;
- isolamento de alunos, instrutores, veículos, agenda, processos, financeiro,
  comunicação, mobile e console global;
- CRUD, busca, paginação e unicidade tenant-scoped de cadastros;
- disponibilidade, bloqueios, conflitos, capacidade e agenda unificada;
- concorrência de reserva e de transição de aula;
- processos, dependências de etapas, documentos, exames e timeline;
- contratos, parcelas, pagamentos parciais, caixa, estorno, despesas,
  inadimplência e relatórios;
- notificações, preferências, push token, templates e autorização de eventos;
- fluxos mobile por perfil, idempotência offline e escopo por objeto;
- upload, tipo/tamanho, token de uso único e download próprio;
- provisionamento e ciclo de vida de tenant, papéis globais e suporte auditado;
- rotas web de leitura/escrita e sidebar filtrada por permissão.

Os cenários E2E administrativos estão distribuídos por suítes de domínio, não
por um único teste de navegador. A execução em navegador real, aparelho físico,
SMTP externo e Expo Push real permanece explicitamente externa.

## Problemas encontrados

### AUD-001 — alta — RBAC de instrutor

- Descrição: `INSTRUCTOR` herdava leitura de cadastros, agenda, processos,
  financeiro e mudança administrativa de status.
- Causa raiz: composição ampla de grupos de permissões no papel.
- Impacto: exposição de PII e financeiro por URL ou API direta.
- Arquivo: `apps/api/src/auth/auth.permissions.ts`.
- Correção: o papel passou a conter apenas permissões básicas e notificações;
  operações próprias continuam nos endpoints mobile com autorização por objeto.
- Teste: `apps/api/test/mobile.e2e.spec.ts`.
- Resultado: instrutor recebe 403 em alunos e dashboard financeiro.

### AUD-002 — alta — integridade multi-tenant no banco

- Descrição: quatro relações aceitavam somente o ID do recurso relacionado.
- Causa raiz: FKs simples em modelos que já continham `tenantId`.
- Impacto: uma escrita interna defeituosa poderia criar vínculo cruzado.
- Arquivos: `schema.prisma` e migration
  `20260728193000_tenant_relation_integrity`.
- Correção: relações e FKs compostas por ID e tenant.
- Teste: `packages/database/src/tenant-isolation.spec.ts`.
- Resultado: 112 verificações do schema aprovadas e migration aplicada.

### AUD-003 — alta — concorrência de agenda e status

- Descrição: colisões serializáveis vazavam como HTTP 500 e duas transições
  concorrentes podiam validar o mesmo estado anterior.
- Causa raiz: ausência de retry para `P2034` e update sem compare-and-set.
- Impacto: erro incorreto e possível dupla mudança de estado.
- Arquivos: `prisma.service.ts` e services de agenda, aulas, turmas, exames e
  processos.
- Correção: helper serializável com até três tentativas e retorno 409; transições
  usam `updateMany` condicionado ao status permitido.
- Teste: `apps/api/test/schedule.e2e.spec.ts`.
- Resultado: em duas reservas ou transições iguais, somente uma vence.

### AUD-004 — alta — upload concorrente e limite HTTP

- Descrição: um token podia ser consumido duas vezes; falha de banco deixava
  arquivo órfão; o limite HTTP padrão era menor que os 10 MB anunciados.
- Causa raiz: leitura seguida de escrita sem reivindicação atômica e bootstrap
  sem limite explícito.
- Impacto: duplicidade, resíduos em disco e upload real quebrado.
- Arquivos: `mobile-student.service.ts`, `main.ts`, schema e migration
  `20260728200000_document_upload_processing`.
- Correção: estado `PROCESSING`, compare-and-set, limpeza compensatória e corpo
  JSON/urlencoded de 14 MB.
- Teste: concorrência de upload em `mobile.e2e.spec.ts`.
- Resultado: uma resposta 200, uma 409 e somente um documento persistido.

### AUD-005 — média — proteção imprecisa de rotas web

- Descrição: rotas de criação/edição podiam ser liberadas somente pela
  permissão de leitura do prefixo.
- Causa raiz: política genérica por prefixo.
- Impacto: tela indevida visível, embora a API ainda barrasse a mutação.
- Arquivo: `apps/web/src/components/tenant-navigation.ts`.
- Correção: políticas ordenadas por rota e ação; rota desconhecida falha fechada.
- Teste: `tenant-navigation.test.ts`.
- Resultado: leitura não autoriza criação ou edição.

### AUD-006 — média — sessão web desatualizada e refresh concorrente

- Descrição: permissões restauradas vinham do armazenamento da aba; múltiplos
  401 podiam tentar rotacionar o mesmo refresh.
- Causa raiz: restauração sem reconciliação completa e ausência de single-flight.
- Impacto: menu desatualizado e logout acidental sob concorrência.
- Arquivo: `apps/web/src/auth/auth-context.tsx`.
- Correção: `/auth/me` e `/auth/memberships` são autoritativos e uma Promise de
  refresh é compartilhada.
- Validação: typecheck, testes web e build.

### AUD-007 — média — sidebar e ações de conta

- Descrição: troca de autoescola aparecia sem alternativa real e “Meu perfil”
  não navegava.
- Causa raiz: itens estáticos sem considerar memberships e elemento sem link.
- Impacto: navegação quebrada e confusa.
- Arquivos: `app-shell.tsx`, página inicial, página `/profile` e CSS.
- Correção: troca somente com permissão e mais de uma membership; link e tela de
  perfil reais.
- Validação: typecheck e build Next.js.

### AUD-008 — média — Swagger exposto por padrão

- Descrição: `/docs` era sempre registrado.
- Causa raiz: bootstrap sem controle por ambiente.
- Impacto: aumento desnecessário da superfície informacional em produção.
- Arquivos: `main.ts`, `.env.example` e README.
- Correção: desabilitado por padrão em produção, habilitação explícita por
  `SWAGGER_ENABLED=true`.
- Validação: typecheck e build da API.

### AUD-009 — média — extensão indefinida de bloqueio

- Descrição: cada tentativa em uma conta já bloqueada atualizava o contador e o
  prazo de bloqueio.
- Causa raiz: registro de falha executado mesmo quando `locked=true`.
- Impacto: terceiro podia prolongar a indisponibilidade da conta.
- Arquivo: `auth.service.ts`.
- Correção: tentativas durante o bloqueio não alteram seu prazo.
- Teste: `auth.e2e.spec.ts`.
- Resultado: contador e timestamp permanecem iguais.

### AUD-010 — alta — dependências vulneráveis

- Descrição: o audit inicial reportou cinco vulnerabilidades altas.
- Causa raiz: versões transitivas de `sharp`, `postcss`, `js-yaml` e
  `brace-expansion`.
- Impacto: DoS ou vulnerabilidades em parser/processamento.
- Arquivos: `pnpm-workspace.yaml` e `pnpm-lock.yaml`.
- Correção: overrides compatíveis para `sharp 0.35`, `postcss 8.5.22` e
  `js-yaml 5.2.2`; tipos React DOM do mobile alinhados ao React 19.1.
- Validação: lint, testes e builds após reinstalação.
- Resultado: resta uma alta em `brace-expansion` dentro da cadeia de build do
  Expo/React Native e uma moderada; item parcialmente corrigido.

### AUD-011 — baixa — geração Prisma bloqueada no Windows

- Descrição: `prisma generate` falhava com `EPERM` ao substituir a DLL.
- Causa raiz: processos antigos do projeto mantinham o engine aberto.
- Impacto: instalação e build local bloqueados.
- Correção: encerramento restrito aos processos de desenvolvimento do PRUMO e
  nova geração.
- Resultado: geração e build aprovados.

### AUD-016 — baixa — mensagens de autenticação com codificação corrompida

- Descrição: mensagens retornadas pelo serviço de autenticação continham
  sequências como `invÃ¡lidos`.
- Causa raiz: texto UTF-8 previamente salvo com dupla codificação.
- Impacto: erro ilegível no web/mobile e teste de contrato inconsistente.
- Arquivo: `auth.service.ts`.
- Correção: todas as mensagens afetadas foram normalizadas para UTF-8.
- Teste: `auth.e2e.spec.ts` verifica a mensagem genérica da conta inativa.
- Resultado: suíte focal com 10 testes aprovada.

### AUD-012 — média — rate limit distribuído ausente — corrigido

- Descrição: login possui bloqueio por conta e a plataforma possui guard local,
  mas não há rate limit distribuído por IP/identidade para toda a API.
- Impacto: múltiplas instâncias não compartilham o contador de abuso.
- Correção: guard Redis por IP e identidade em login, recuperação, definição de
  senha e refresh, com política por rota, `Retry-After` e fallback local.

### AUD-013 — média — refresh token do Next.js acessível ao JavaScript — corrigido

- Descrição: a sessão Next.js, inclusive refresh token, fica no
  `sessionStorage`.
- Impacto: uma futura falha XSS poderia extrair o token.
- Correção: BFF do Next.js para login, refresh, seleção de escopo e logout. O
  refresh token fica em cookie `HttpOnly`, `SameSite=Strict`, com `Secure` em
  produção e validação de origem. O mobile continua usando Secure Store.

### AUD-014 — média — integrações externas sem homologação

- Descrição: SMTP local foi inspecionado, mas SMTP de produção, credenciais Expo
  Push e gateways financeiros/fiscais não foram fornecidos.
- Estado: bloqueado externamente. Gateway, PIX, boleto e emissão fiscal estão
  declaradamente fora do produto atual.

### AUD-015 — baixa — validação manual de clientes

- Descrição: build e testes automatizados passaram, mas não houve sessão de
  navegador real nem aparelho físico nesta execução.
- Estado: pendente de smoke test humano, incluindo permissões do dispositivo,
  recebimento de push e redes móveis.

## Problemas corrigidos

Corrigidos integralmente: AUD-001 a AUD-009, AUD-011 a AUD-013 e AUD-016.
AUD-010 foi mitigado e permanece aberto apenas para a cadeia antiga do Expo.

## Problemas não corrigidos

- AUD-010: atualização definitiva depende de versão do Expo/React Native que
  atualize `glob/minimatch/brace-expansion`; override de versão principal não
  foi forçado para não quebrar Android/Expo Go.
- AUD-014: depende de serviços, credenciais e ambiente externos.
- AUD-015: depende de navegador e aparelho físico.

## Segurança e multi-tenancy

- O access token tenant contém `sub`, `tenantId`, `membershipId`, `role` e
  `permissions`.
- `TenantGuard` consulta novamente membership e status do tenant; não confia no
  `tenantId` do payload.
- DTOs usam whitelist e rejeitam campos não declarados.
- Services de negócio usam `CurrentTenant`; testes E2E tentam IDs de outro
  tenant.
- Refresh tokens são persistidos somente como HMAC SHA-256, rotacionados de
  forma atômica e revogados quando há reutilização.
- Login usa bcrypt e erro genérico para credencial/conta inativa.
- CORS exige origens explícitas em produção.
- Upload valida DTO, tamanho, assinatura do arquivo, dono, tenant e token
  temporário; o storage key é gerado no servidor.
- Swagger fecha por padrão em produção.
- Logs de filas registram IDs técnicos e mensagens de erro, sem tokens, CPF ou
  conteúdo financeiro.

Riscos ainda relevantes: dependência transitiva do Expo e homologação em
staging do storage S3-compatible e das demais integrações externas.

## Matriz de permissões

| Papel confirmado   | Escopo                                                                         |
| ------------------ | ------------------------------------------------------------------------------ |
| `TENANT_OWNER`     | todos os módulos do tenant, memberships e configuração                         |
| `TENANT_ADMIN`     | mesmo conjunto operacional do owner no estado atual                            |
| `SECRETARY`        | cadastros, agenda, processos, financeiro e comunicação                         |
| `FINANCE`          | leitura operacional e gestão financeira; sem escrita cadastral                 |
| `INSTRUCTOR`       | perfil, memberships/troca e notificações; operações próprias somente no mobile |
| `STUDENT`          | perfil, memberships/troca e notificações; dados próprios somente no mobile     |
| `PLATFORM_SUPPORT` | leitura/suporte global conforme permissões do papel                            |
| `PLATFORM_ADMIN`   | administração global, exceto invariantes reservadas ao owner                   |
| `PLATFORM_OWNER`   | administração global completa                                                  |

O frontend oculta menus, protege rotas e mantém a API como autoridade final.
Mais detalhes funcionais estão em `docs/matriz-funcional.md`.

## Cobertura de testes

Há 41 arquivos de teste:

- API: 47 unitários e 10 suítes E2E/104 testes reais com PostgreSQL;
- web: API client e políticas de navegação tenant/plataforma;
- mobile: HTTP, sessão segura, deep links, cache/fila e contratos da API;
- database: 115 invariantes de isolamento/schema e bootstrap;
- contracts: 5 validações dos schemas compartilhados.

Regressões criadas ou ampliadas nesta auditoria:

- instrutor bloqueado em endpoints administrativos;
- leitura/criação/edição separadas no roteamento web;
- todas as entidades tenant-scoped e quatro FKs compostas;
- duas reservas simultâneas;
- duas transições simultâneas do mesmo registro;
- conta já bloqueada, inativa e sem tenant;
- duas tentativas simultâneas de consumir o mesmo upload.
- oito cenários concorrentes de pagamento, parcela, caixa e despesa;
- bloqueio de chamadas SMTP e Expo reais no ambiente de teste.

Não há E2E automatizado em browser nem teste instrumentado Android/iOS.

## Resultados de lint, typecheck, testes e build

| Validação                              | Resultado                                           |
| -------------------------------------- | --------------------------------------------------- |
| `pnpm install --frozen-lockfile`       | aprovado                                            |
| Prisma format/validate/generate/status | aprovado                                            |
| migrations                             | 19 aplicadas em banco zerado, 0 pendentes           |
| seed executado duas vezes              | aprovado/idempotente                                |
| `pnpm lint`                            | aprovado                                            |
| `pnpm typecheck`                       | aprovado                                            |
| `pnpm test`                            | aprovado, 304 testes em 41 arquivos                 |
| `pnpm build`                           | aprovado                                            |
| Expo Doctor                            | aprovado                                            |
| peers                                  | aprovado, nenhum conflito                           |
| audit de produção                      | 2 altas aceitas e 0 moderadas, na cadeia Metro/Expo |

## Pendências externas

- smoke test em Chrome/Edge com console aberto;
- teste em Android/iOS físico, inclusive Expo Go ou development build;
- recebimento real de e-mail fora do Mailpit;
- credencial e entrega real do Expo Push;
- configuração de proxy reverso, TLS e CSP de produção;
- gateway de pagamento, PIX/boleto, conciliação e emissão fiscal, ainda não
  implementados.

## Riscos restantes

1. Dependência transitiva alta em ferramentas Expo antigas.
2. Storage S3-compatible privado está implementado, mas ainda exige homologação
   externa, backup do bucket e política de retenção.
3. Fluxos de UI foram validados por build/testes e smoke HTTP, não por automação
   de browser.

## Próximos passos recomendados

1. Planejar atualização do Expo/React Native e repetir build Android em
   development build.
2. Adicionar Playwright para os cenários de admin, aluno, instrutor e troca de
   tenant.
3. Homologar o storage privado S3-compatible, incluindo URL assinada curta,
   indisponibilidade, backup/restore, antivírus e rotina de retenção.
4. Homologar SMTP e Expo Push em staging com observabilidade e alertas.

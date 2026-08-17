# Prumo

SaaS multi-tenant para gestão de autoescolas. Este repositório contém:

- `apps/api`: API NestJS;
- `apps/web`: aplicação Next.js;
- `apps/mobile`: aplicação Expo;
- `packages/contracts`: schemas Zod e tipos compartilhados;
- `packages/database`: Prisma e PostgreSQL.

## Fase implementada

O projeto contém autenticação, contexto multi-tenant e os cadastros base:

- login com e-mail e senha usando bcrypt;
- access token tenant-bound;
- refresh token com rotação atômica;
- armazenamento apenas do hash HMAC-SHA-256 do refresh token;
- seleção de tenant validada pela membership do usuário;
- convites de equipe, primeiro acesso, recuperação e troca de senha;
- guards de JWT, tenant e permissões;
- decorators `CurrentUser`, `CurrentTenant` e `Permissions`;
- seeds de referência e demonstração separados, com bootstrap administrativo;
- testes e2e de autenticação e isolamento de tenant;
- alunos com endereço, documentos, notas e processos;
- instrutores;
- veículos;
- busca, paginação, edição e alteração de status nos três cadastros;
- telas Next.js integradas à API;
- dashboard operacional adaptado para gestão, instrutor e aluno;
- configurações da autoescola e equipe com auditoria;
- upload e download de documentos também no web;
- processos de habilitação com categorias, etapas dependentes, documentos e
  cálculo de progresso;
- exames com tentativas imutáveis, regras de elegibilidade e integração à
  agenda.

Os módulos operacionais de agenda, processos e exames, assim como o módulo
financeiro interno, também estão implementados. Integrações externas de
pagamento, emissão fiscal e notificações permanecem fora desta fase.

## Pré-requisitos

- Node.js 22.13 ou superior;
- pnpm 11.16;
- Docker com Docker Compose.

## Configuração

Copie `.env.example` para `.env` e substitua os segredos JWT:

```powershell
Copy-Item .env.example .env
```

Variáveis relevantes:

| Variável                   | Descrição                                       | Padrão local                |
| -------------------------- | ----------------------------------------------- | --------------------------- |
| `APP_ENV`                  | Ambiente efetivo da aplicação                   | `development`               |
| `DATABASE_URL`             | Conexão PostgreSQL                              | PostgreSQL do Compose       |
| `REDIS_URL`                | Conexão das filas BullMQ                        | Redis do Compose            |
| `AUTH_RATE_LIMIT_ENABLED`  | Limite distribuído das rotas de autenticação    | `true`                      |
| `TRUST_PROXY`              | Confia no primeiro proxy para obter IP          | `false` local               |
| `QUEUE_ENABLED`            | Ativa workers e tarefas de comunicação          | `true`                      |
| `JWT_ACCESS_SECRET`        | Assinatura do access token                      | obrigatório                 |
| `JWT_REFRESH_SECRET`       | Assinatura e HMAC do refresh token              | obrigatório                 |
| `JWT_ACCESS_EXPIRES_IN`    | Duração do access token                         | `15m`                       |
| `JWT_REFRESH_EXPIRES_IN`   | Duração do refresh token                        | `7d`                        |
| `BCRYPT_ROUNDS`            | Custo bcrypt do seed                            | `12`                        |
| `CORS_ORIGINS`             | Origens web permitidas em produção              | obrigatório em produção     |
| `SWAGGER_ENABLED`          | Expõe `/docs`; desligado por padrão em produção | `true` local                |
| `SWAGGER_RESTRICTED`       | Exige autenticação no Swagger de homologação    | `false` local               |
| `SWAGGER_USERNAME`         | Usuário HTTP Basic do Swagger de homologação    | vazio local                 |
| `SWAGGER_PASSWORD`         | Senha HTTP Basic do Swagger de homologação      | vazio local                 |
| `MOBILE_UPLOAD_DIR`        | Diretório privado dos documentos                | `var/uploads`               |
| `UPLOAD_DIR`               | Diretório privado compartilhado de uploads      | usa `MOBILE_UPLOAD_DIR`     |
| `API_URL`                  | URL server-side usada pelo BFF do Next          | `http://localhost:3333/api` |
| `SEED_ADMIN_PASSWORD`      | Senha dos usuários do seed demo                 | apenas desenvolvimento      |
| `BOOTSTRAP_ADMIN_EMAIL`    | E-mail do primeiro administrador global         | sem padrão                  |
| `BOOTSTRAP_ADMIN_PASSWORD` | Senha forte do primeiro administrador global    | sem padrão                  |

Em `staging` e `production`, o bootstrap valida toda a configuração antes de
abrir a porta da API. JWTs precisam ter ao menos 48 caracteres, banco, Redis,
web e API não podem apontar para hosts locais, as URLs públicas devem usar
HTTPS, o CORS aceita somente origens exatas, e SMTP e um diretório absoluto de
storage precisam estar configurados. O Swagger é proibido em produção; em
homologação, quando habilitado, exige `SWAGGER_RESTRICTED=true` e credenciais
HTTP Basic.

## Instalação e banco

```powershell
pnpm install
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed:reference
```

O seed de referência é idempotente, pode rodar em qualquer ambiente e contém
somente categorias, planos, configurações globais e templates estruturais.

Dados fictícios são instalados separadamente e o comando recusa qualquer
ambiente diferente de `NODE_ENV=development`:

```powershell
$env:NODE_ENV="development"
pnpm db:seed:demo
```

O seed demo cria ou atualiza:

- tenant: **Autoescola Demonstração**;
- usuários de gestão: `admin@prumo.local`, `secretaria@prumo.local` e
  `financeiro@prumo.local`;
- acessos mobile: `mariana@exemplo.local`, `lucas.aluno@prumo.local`,
  `carlos@exemplo.local` e `ana.instrutora@prumo.local`;
- senha local padrão: `PrumoDev@123`;
- cadastros, processos em diferentes etapas, agenda, exames, contratos,
  parcelas, pagamentos, despesas, caixa, notificações e campanhas;
- uma auditoria automática de cobertura ao final da execução.

Para validar novamente a cobertura sem alterar os dados:

```powershell
pnpm db:seed:demo:verify
```

Com a API em execução, o smoke test autentica os perfis de gestão, instrutor e
aluno, valida seus dashboards e consulta os principais módulos:

```powershell
pnpm demo:smoke
```

Use `DEMO_API_URL` se a API não estiver em `http://localhost:3333/api` e
`SEED_ADMIN_PASSWORD` caso o seed tenha sido criado com outra senha.

Não use a senha padrão fora do desenvolvimento. Em produção,
o seed demo não pode ser executado.

Para criar o primeiro administrador global, configure temporariamente
`BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` e
`BOOTSTRAP_ADMIN_PASSWORD`, depois execute:

```powershell
pnpm db:bootstrap-admin
```

O bootstrap só cria um `PLATFORM_OWNER` quando nenhum administrador global
existe, registra `BOOTSTRAP_ADMIN_CREATED` na auditoria e nunca atualiza,
reativa ou troca a senha de usuários existentes. Remova a senha do ambiente
após o uso.

## Qualidade e CI

O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) executa em
cada Pull Request: instalação congelada, validação Prisma, PostgreSQL e Redis
temporários, build/typecheck/testes de contracts e database, todos os gates da
API e web, gates do mobile e auditoria de dependências.

Antes de habilitar merges, marque todos os jobs do workflow **Integração
contínua** como checks obrigatórios na proteção da branch `main`. A auditoria
local equivalente é executada com `pnpm audit:security`; a classificação e as
exceções temporárias ficam em [`docs/AUDITORIA-DEPENDENCIAS.md`](docs/AUDITORIA-DEPENDENCIAS.md).

## Execução

```powershell
pnpm dev
```

Os clientes já possuem as telas de login, seleção/troca de autoescola, visão
autenticada e logout. A sessão é restaurada automaticamente e o refresh token é
rotacionado quando o access token expira.

Para sobrescrever a URL da API no Next.js:

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
```

No Expo Go, o app usa automaticamente o IP anunciado pelo Metro para acessar a
porta `3333`. Se a API estiver em outro host, configure:

```powershell
Copy-Item apps/mobile/.env.example apps/mobile/.env
```

O aplicativo mobile permanece no Expo SDK 54 para ser compatível com o Expo Go
em aparelhos físicos. Uma atualização para o SDK 57 deve ser feita junto com a
adoção de um development build.

Se o celular e o computador estiverem na mesma rede, execute `pnpm dev` e abra
o QR code no Expo Go. Em redes que bloqueiam conexões locais, execute o Metro
separadamente em modo tunnel:

```powershell
Set-Location apps/mobile
pnpm exec expo start --tunnel
```

Em Android e iOS, o refresh token fica no armazenamento seguro do sistema. Na
exportação web do app Expo ele permanece somente em memória. No cliente Next.js,
o BFF guarda o refresh token em cookie `HttpOnly`, `SameSite=Strict` e `Secure`
em produção; o `sessionStorage` contém apenas o access token de curta duração e
dados não secretos da sessão. Os dados locais e o cookie são removidos no logout.

- Web: <http://localhost:3000>
- API: <http://localhost:3333/api>
- Health: <http://localhost:3333/api/health>
- Swagger local: <http://localhost:3333/docs> (`SWAGGER_ENABLED=true`)
- Metro/Expo: <http://localhost:8081>

## Fluxo de autenticação

### 1. Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@prumo.local",
  "password": "PrumoDev@123"
}
```

O login retorna todas as memberships ativas. A primeira membership ativa é
usada como contexto inicial e recebe um par de tokens.

### 2. Seleção de tenant

```http
POST /api/auth/select-tenant
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "tenantId": "<uuid-do-tenant>",
  "refreshToken": "<refreshToken-atual>"
}
```

O `tenantId` do corpo nunca é aceito como autorização. A API busca uma
membership ativa que relacione o usuário autenticado ao tenant solicitado. Em
caso de sucesso, o refresh token anterior é revogado e um novo par é emitido.

### 3. Renovação

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<refreshToken-atual>"
}
```

Cada refresh token pode ser usado uma única vez. A reutilização de um token já
rotacionado revoga as sessões ativas do usuário.

### 4. Logout

```http
POST /api/auth/logout
Content-Type: application/json

{
  "refreshToken": "<refreshToken-atual>"
}
```

O logout é idempotente e responde com `204`.

## Endpoints

| Método | Rota                      | Proteção                          |
| ------ | ------------------------- | --------------------------------- |
| `POST` | `/api/auth/login`         | pública                           |
| `POST` | `/api/auth/select-tenant` | access token + tenant + permissão |
| `POST` | `/api/auth/refresh`       | refresh token                     |
| `POST` | `/api/auth/logout`        | refresh token                     |
| `GET`  | `/api/auth/me`            | access token + tenant + permissão |
| `GET`  | `/api/auth/memberships`   | access token + tenant + permissão |

## Claims do access token

```json
{
  "sub": "user-uuid",
  "tenantId": "tenant-uuid",
  "membershipId": "membership-uuid",
  "role": "TENANT_OWNER",
  "permissions": [
    "profile:read",
    "tenant:select",
    "tenant:manage",
    "memberships:read",
    "memberships:manage"
  ]
}
```

O `TenantGuard` revalida usuário, membership e status do tenant no banco a cada
requisição protegida. As permissões efetivas são recalculadas a partir da role
atual, evitando autorização com dados desatualizados do token.

## Cadastros base

Todos os endpoints abaixo usam `JwtAuthGuard`, `TenantGuard`,
`PermissionsGuard` e o tenant obtido por `CurrentTenant`. Nenhum DTO aceita
`tenantId`.

| Módulo      | Criar                   | Listar e buscar        | Detalhar                   | Editar                       | Status                              |
| ----------- | ----------------------- | ---------------------- | -------------------------- | ---------------------------- | ----------------------------------- |
| Alunos      | `POST /api/students`    | `GET /api/students`    | `GET /api/students/:id`    | `PATCH /api/students/:id`    | `PATCH /api/students/:id/status`    |
| Instrutores | `POST /api/instructors` | `GET /api/instructors` | `GET /api/instructors/:id` | `PATCH /api/instructors/:id` | `PATCH /api/instructors/:id/status` |
| Veículos    | `POST /api/vehicles`    | `GET /api/vehicles`    | `GET /api/vehicles/:id`    | `PATCH /api/vehicles/:id`    | `PATCH /api/vehicles/:id/status`    |

Parâmetros de listagem:

```http
GET /api/students?search=Maria&page=1&pageSize=20&status=ACTIVE
```

O CPF de alunos e instrutores e a placa dos veículos são únicos apenas dentro
do tenant. Cadastros não possuem rota de exclusão física; a retirada de uso é
feita com `status: INACTIVE`.

Telas Next.js:

- `/students`, `/students/new` e `/students/:id/edit`;
- `/instructors`, `/instructors/new` e `/instructors/:id/edit`;
- `/vehicles`, `/vehicles/new` e `/vehicles/:id/edit`.

O Swagger em <http://localhost:3333/docs> documenta DTOs, filtros, respostas e
permissões.

## Validação

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Agenda operacional

Todos os recursos são isolados pelo tenant ativo, com validação de vínculos
no banco e auditoria de criação, alteração e mudanças de estado.

- Unidades: `POST/GET /api/units`, `GET/PATCH/DELETE /api/units/:id` e
  `PATCH /api/units/:id/status`.
- Salas: `POST/GET /api/classrooms`, `GET/PATCH/DELETE /api/classrooms/:id` e
  `PATCH /api/classrooms/:id/status`.
- Disponibilidades: CRUD em `/api/instructor-availabilities`.
- Bloqueios exatos de recurso: CRUD em `/api/schedule-blocks`.
- Aulas práticas: CRUD sem exclusão e ações `confirm`, `start`, `complete`,
  `cancel`, `reschedule` e `no-show` em `/api/practical-lessons/:id/...`.
- Turmas teóricas: CRUD sem exclusão, participantes, presença e mudanças de
  estado em `/api/theoretical-classes`.
- Agenda unificada: `GET /api/schedule?from=<UTC>&to=<UTC>`.
- Horários livres: `GET /api/schedule/availability`, com unidade, duração e
  recursos opcionais.

A API impede sobreposição de aluno, instrutor, veículo e sala; respeita
bloqueios, funcionamento da unidade, disponibilidade semanal do instrutor,
capacidade da sala/turma e transições de estado.

Telas Next.js:

- `/units`, `/units/new` e `/units/:id/edit`;
- `/classrooms`, `/classrooms/new` e `/classrooms/:id/edit`;
- `/schedule`, com visão semanal e filtros;
- `/practical-lessons/new` e `/practical-lessons/:id`;
- `/theoretical-classes/new` e `/theoretical-classes/:id`.

## Processos de habilitação e exames

As categorias `ACC`, `A`, `B`, `C`, `D` e `E` são globais e criadas por seed
idempotente. Os processos, etapas, documentos, aulas e exames continuam
isolados pelo tenant ativo; nenhum endpoint aceita `tenantId` como fonte de
autorização.

Principais endpoints:

- processos: `POST/GET /api/students/:studentId/processes`,
  `GET/PATCH /api/processes/:id` e ações `start`, `suspend`, `resume`,
  `complete` e `cancel`;
- progresso e auditoria: `GET /api/processes/:id/progress` e
  `GET /api/processes/:id/timeline`;
- documentos: `GET /api/processes/:id/documents` e ações `link`, `submit`,
  `approve`, `reject` e `waive`;
- exames: `POST/GET /api/exams`, `GET /api/exams/:id` e ações `confirm`,
  `complete`, `cancel`, `reschedule` e `no-show`;
- agenda: eventos `PRACTICAL_LESSON`, `THEORETICAL_CLASS`, `SCHEDULE_BLOCK` e
  `EXAM`, com filtros `examType` e `result`.

O motor central cria as etapas e dependências conforme o tipo de processo,
calcula a carga horária diretamente das aulas vinculadas e impede exames ou
conclusões enquanto requisitos obrigatórios estiverem pendentes. Cada nova
tentativa de exame gera outro registro e preserva a anterior.

Telas Next.js:

- `/students/:studentId/processes` e
  `/students/:studentId/processes/new`;
- `/processes/:id`, `/processes/:id/documents` e `/processes/:id/exams`;
- `/exams`, `/exams/new` e `/exams/:id`.

## Financeiro

O módulo financeiro usa exclusivamente inteiros em centavos e mantém todos os
registros isolados pelo tenant ativo. Estão implementados:

- catálogo de serviços e planos comerciais;
- contratos de alunos, itens e ajustes;
- geração mensal ou personalizada de parcelas;
- pagamentos com alocação em múltiplas parcelas, confirmação e estorno;
- caixas, suprimentos, retiradas, conferência e fechamento;
- categorias de despesas, contas a pagar e pagamento em dinheiro;
- configurações de inadimplência e cobranças automáticas idempotentes;
- dashboard e relatórios por período, unidade, aluno, serviço e categoria.

Principais endpoints:

- `/api/services` e `/api/service-plans`;
- `/api/students/:studentId/contracts` e `/api/contracts/:id`;
- `/api/receivables` e `/api/payments`;
- `/api/cash-registers` e `/api/expenses`;
- `/api/financial/dashboard` e `/api/financial/reports/...`.

Telas Next.js:

- `/financial`;
- `/financial/services`, `/financial/plans` e `/students/:studentId/contracts`;
- `/financial/receivables`, `/financial/payments` e
  `/financial/cash-registers`;
- `/financial/expenses` e `/financial/reports`.

Não há integração com gateway, emissão fiscal, PIX ou boleto reais ou
conciliação bancária externa nesta fase.

## Aplicativo mobile

O Expo Router mantém um único aplicativo com áreas protegidas separadas para
alunos e instrutores:

- aluno: home, agenda, aulas, processos, exames, financeiro, documentos,
  notificações e perfil;
- instrutor: home, agenda diária/semanal, aulas práticas, turmas teóricas,
  alunos vinculados, veículos, ocorrências, notificações e perfil;
- sessão com rotação automática, seleção segura de tenant e refresh token
  armazenado somente no Expo Secure Store em Android e iOS;
- cache seletivo isolado por tenant e usuário, conectividade com NetInfo e fila
  offline idempotente apenas para ações operacionais;
- upload temporário de PDF/JPEG/PNG, push token, deep links validados por perfil
  e preferências de comunicação.

Contas criadas pelo seed de desenvolvimento:

- aluno: `mariana@exemplo.local`;
- instrutor: `carlos@exemplo.local`;
- senha: `PrumoDev@123`, salvo quando `SEED_ADMIN_PASSWORD` não foi definido.

O mobile não realiza pagamentos, não registra resultados de exame offline e
não implementa rastreamento contínuo, chat, WhatsApp ou SMS.

## Console administrativo da plataforma

O console da Anoar fica em `/platform` e usa papel global separado da
`MembershipRole`: `PLATFORM_SUPPORT`, `PLATFORM_ADMIN` ou `PLATFORM_OWNER`.
O login global recebe tokens com duração reduzida e pode alternar para uma
autoescola somente quando o usuário também possui membership válida.

Os planos `BASIC` e `PRO` vêm do seed de referência. O proprietário global é
criado exclusivamente por `pnpm db:bootstrap-admin`, sem credencial previsível
e sem atualização automática de contas existentes. As sessões globais usam
`JWT_PLATFORM_ACCESS_EXPIRES_IN` (padrão `5m`) e
`JWT_PLATFORM_REFRESH_EXPIRES_IN` (padrão `8h`). `CORS_ORIGINS` também é
obrigatório em produção.

Principais grupos de endpoints:

- dashboard agregado: `GET /api/platform/dashboard`;
- tenants, provisionamento, ciclo de vida e métricas:
  `/api/platform/tenants`;
- usuários globais e revogação de sessões: `/api/platform/users`;
- planos e assinaturas internas: `/api/platform/plans` e
  `/api/platform/subscriptions`;
- suporte temporário: `/api/platform/support-sessions`;
- auditoria, saúde e configurações: `/api/platform/audit`,
  `/api/platform/health` e `/api/platform/settings`.

O suporte não cria bypass nos services de tenant. Para contexto assistido é
obrigatório enviar `x-support-session-id`; a sessão resolve um único tenant,
expira rapidamente, mostra banner na web e grava `supportSessionId` na
auditoria. Métricas globais e por tenant são agregadas e não retornam CPF,
documentos, hashes de senha, refresh tokens ou pagamentos individuais.

As telas disponíveis são `/platform`, `/platform/tenants`,
`/platform/tenants/new`, detalhes e métricas de tenant, `/platform/users`,
`/platform/plans`, `/platform/subscriptions`, `/platform/support`,
`/platform/audit`, `/platform/health` e `/platform/settings`.

Esta fase não integra cobrança real, não exclui tenants fisicamente e não
implementa impersonação invisível.

## Auditoria funcional

O estado auditado, as correções, os riscos restantes e a cobertura por módulo
estão documentados em:

- [`docs/auditoria-funcional.md`](docs/auditoria-funcional.md);
- [`docs/matriz-funcional.md`](docs/matriz-funcional.md).

## Operação e deploy

Containerização, storage S3 privado, probes, métricas, alertas e a ordem de
publicação estão em [`docs/OPERACAO-STAGING.md`](docs/OPERACAO-STAGING.md).
A configuração dos domínios oficiais, TLS e o procedimento de publicação estão
em [`docs/OPERACAO-PRODUCAO.md`](docs/OPERACAO-PRODUCAO.md).
A classificação das dependências vulneráveis permanece em
[`docs/AUDITORIA-DEPENDENCIAS.md`](docs/AUDITORIA-DEPENDENCIAS.md).

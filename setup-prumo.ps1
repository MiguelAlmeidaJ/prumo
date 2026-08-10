$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Require-Command([string]$Command, [string]$Hint) {
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw "O comando '$Command' não foi encontrado. $Hint"
    }
}

# Execute este script dentro da pasta vazia do projeto:
# C:\Projetos\prumo

$ProjectRoot = (Get-Location).Path

if ((Get-ChildItem -Force | Measure-Object).Count -gt 1) {
    Write-Warning "A pasta atual não está completamente vazia. O script continuará sem apagar arquivos existentes."
}

Step "Validando ferramentas"
Require-Command "node" "Instale o Node.js LTS."
Require-Command "corepack" "Reinstale ou atualize o Node.js LTS."
Require-Command "docker" "Instale e abra o Docker Desktop."
Require-Command "git" "Instale o Git para Windows."

$NodeMajor = [int]((node --version).TrimStart("v").Split(".")[0])
if ($NodeMajor -lt 20) {
    throw "O Prumo requer Node.js 20 ou superior. Versão atual: $(node --version)"
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw "O Docker Desktop não está em execução."
}

Step "Ativando pnpm"
corepack enable
corepack prepare pnpm@latest --activate

Step "Criando estrutura do monorepo"
New-Item -ItemType Directory -Force -Path `
    "apps", `
    "packages", `
    "docs" | Out-Null

@'
{
  "name": "prumo",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "format": "prettier --write .",
    "infra:up": "docker compose up -d",
    "infra:down": "docker compose down",
    "infra:logs": "docker compose logs -f",
    "db:generate": "pnpm --filter @prumo/database prisma:generate",
    "db:migrate": "pnpm --filter @prumo/database prisma:migrate",
    "db:studio": "pnpm --filter @prumo/database prisma:studio"
  },
  "devDependencies": {
    "prettier": "latest",
    "turbo": "latest",
    "typescript": "latest"
  }
}
'@ | Set-Content -Encoding UTF8 package.json

@'
packages:
  - "apps/*"
  - "packages/*"
'@ | Set-Content -Encoding UTF8 pnpm-workspace.yaml

@'
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**", "build/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "typecheck": {
      "dependsOn": ["^typecheck"]
    }
  }
}
'@ | Set-Content -Encoding UTF8 turbo.json

@'
node_modules
.pnpm-store
.turbo
.next
dist
build
coverage
.expo
.env
.env.local
*.log
.DS_Store
'@ | Set-Content -Encoding UTF8 .gitignore

@'
DATABASE_URL="postgresql://prumo:prumo@localhost:5432/prumo?schema=public"
REDIS_URL="redis://localhost:6379"

API_PORT=3333
JWT_ACCESS_SECRET="altere-esta-chave-access"
JWT_REFRESH_SECRET="altere-esta-chave-refresh"

NEXT_PUBLIC_API_URL="http://localhost:3333/api"

# Troque pelo IP local do computador ao testar em celular físico.
EXPO_PUBLIC_API_URL="http://192.168.0.10:3333/api"
'@ | Set-Content -Encoding UTF8 .env.example

Copy-Item .env.example .env -Force

@'
services:
  postgres:
    image: postgres:17-alpine
    container_name: prumo-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: prumo
      POSTGRES_USER: prumo
      POSTGRES_PASSWORD: prumo
    ports:
      - "5432:5432"
    volumes:
      - prumo_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U prumo -d prumo"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: prumo-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - prumo_redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  prumo_postgres_data:
  prumo_redis_data:
'@ | Set-Content -Encoding UTF8 docker-compose.yml

Step "Criando painel web com Next.js"
pnpm dlx create-next-app@latest apps/web `
    --typescript `
    --tailwind `
    --eslint `
    --app `
    --src-dir `
    --import-alias "@/*" `
    --use-pnpm `
    --yes

Step "Criando API com NestJS"
pnpm dlx @nestjs/cli@latest new apps/api `
    --package-manager pnpm `
    --skip-git `
    --strict

Step "Criando aplicativo mobile com Expo"
pnpm dlx create-expo-app@latest apps/mobile `
    --template tabs

Step "Ajustando nomes dos pacotes"
$WebPackage = Get-Content apps/web/package.json -Raw | ConvertFrom-Json
$WebPackage.name = "@prumo/web"
$WebPackage | ConvertTo-Json -Depth 100 | Set-Content -Encoding UTF8 apps/web/package.json

$ApiPackage = Get-Content apps/api/package.json -Raw | ConvertFrom-Json
$ApiPackage.name = "@prumo/api"
$ApiPackage | ConvertTo-Json -Depth 100 | Set-Content -Encoding UTF8 apps/api/package.json

$MobilePackage = Get-Content apps/mobile/package.json -Raw | ConvertFrom-Json
$MobilePackage.name = "@prumo/mobile"
$MobilePackage | ConvertTo-Json -Depth 100 | Set-Content -Encoding UTF8 apps/mobile/package.json

Step "Criando pacote Prisma"
New-Item -ItemType Directory -Force -Path `
    "packages/database/prisma", `
    "packages/database/src" | Out-Null

@'
{
  "name": "@prumo/database",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@prisma/client": "latest"
  },
  "devDependencies": {
    "prisma": "latest",
    "typescript": "latest"
  }
}
'@ | Set-Content -Encoding UTF8 packages/database/package.json

@'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
'@ | Set-Content -Encoding UTF8 packages/database/tsconfig.json

@'
export { PrismaClient } from "@prisma/client";
export * from "@prisma/client";
'@ | Set-Content -Encoding UTF8 packages/database/src/index.ts

@'
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum TenantStatus {
  TRIAL
  ACTIVE
  SUSPENDED
  CANCELLED
}

enum MembershipRole {
  PLATFORM_ADMIN
  TENANT_OWNER
  TENANT_ADMIN
  SECRETARY
  FINANCE
  INSTRUCTOR
  STUDENT
}

enum LessonType {
  THEORETICAL
  PRACTICAL
}

enum LessonStatus {
  PENDING
  CONFIRMED
  IN_PROGRESS
  COMPLETED
  CANCELLED
  NO_SHOW
  RESCHEDULED
}

model Tenant {
  id            String         @id @default(uuid()) @db.Uuid
  name          String
  slug          String         @unique
  document      String?
  status        TenantStatus   @default(TRIAL)
  memberships   Membership[]
  students      Student[]
  instructors   Instructor[]
  vehicles      Vehicle[]
  lessons       Lesson[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}

model User {
  id            String         @id @default(uuid()) @db.Uuid
  name          String
  email         String         @unique
  passwordHash  String
  active        Boolean        @default(true)
  memberships   Membership[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}

model Membership {
  id        String         @id @default(uuid()) @db.Uuid
  tenantId  String         @db.Uuid
  userId    String         @db.Uuid
  role      MembershipRole
  active    Boolean        @default(true)
  tenant    Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user      User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  @@unique([tenantId, userId])
  @@index([tenantId, role])
}

model Student {
  id        String    @id @default(uuid()) @db.Uuid
  tenantId  String    @db.Uuid
  name      String
  cpf       String
  email     String?
  phone     String?
  active    Boolean   @default(true)
  tenant    Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  lessons   Lesson[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@unique([tenantId, cpf])
  @@index([tenantId, name])
}

model Instructor {
  id        String    @id @default(uuid()) @db.Uuid
  tenantId  String    @db.Uuid
  name      String
  cpf       String
  license   String?
  active    Boolean   @default(true)
  tenant    Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  lessons   Lesson[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@unique([tenantId, cpf])
  @@index([tenantId, name])
}

model Vehicle {
  id        String    @id @default(uuid()) @db.Uuid
  tenantId  String    @db.Uuid
  plate     String
  brand     String?
  model     String
  year      Int?
  active    Boolean   @default(true)
  tenant    Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  lessons   Lesson[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@unique([tenantId, plate])
}

model Lesson {
  id           String       @id @default(uuid()) @db.Uuid
  tenantId     String       @db.Uuid
  studentId    String       @db.Uuid
  instructorId String?      @db.Uuid
  vehicleId    String?      @db.Uuid
  type         LessonType
  status       LessonStatus @default(PENDING)
  startsAt     DateTime
  endsAt       DateTime
  notes        String?
  tenant       Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  student      Student      @relation(fields: [studentId], references: [id], onDelete: Restrict)
  instructor   Instructor?  @relation(fields: [instructorId], references: [id], onDelete: Restrict)
  vehicle      Vehicle?     @relation(fields: [vehicleId], references: [id], onDelete: Restrict)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  @@index([tenantId, startsAt])
  @@index([tenantId, studentId, startsAt])
  @@index([tenantId, instructorId, startsAt])
  @@index([tenantId, vehicleId, startsAt])
}
'@ | Set-Content -Encoding UTF8 packages/database/prisma/schema.prisma

Step "Criando contratos compartilhados"
New-Item -ItemType Directory -Force -Path "packages/contracts/src" | Out-Null

@'
{
  "name": "@prumo/contracts",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "latest"
  },
  "devDependencies": {
    "typescript": "latest"
  }
}
'@ | Set-Content -Encoding UTF8 packages/contracts/package.json

@'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
'@ | Set-Content -Encoding UTF8 packages/contracts/tsconfig.json

@'
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const tenantContextSchema = z.object({
  tenantId: z.string().uuid(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type TenantContext = z.infer<typeof tenantContextSchema>;
'@ | Set-Content -Encoding UTF8 packages/contracts/src/index.ts

Step "Instalando dependências da API"
pnpm --filter @prumo/api add `
    @nestjs/config `
    @nestjs/jwt `
    @nestjs/passport `
    @nestjs/swagger `
    @prisma/client `
    @prumo/database@workspace:* `
    @prumo/contracts@workspace:* `
    bcrypt `
    class-transformer `
    class-validator `
    passport `
    passport-jwt `
    swagger-ui-express

pnpm --filter @prumo/api add -D `
    @types/bcrypt `
    @types/passport-jwt

Step "Instalando dependências do web"
pnpm --filter @prumo/web add `
    @prumo/contracts@workspace:* `
    @tanstack/react-query `
    axios `
    lucide-react `
    react-hook-form `
    zod `
    @hookform/resolvers

Step "Instalando dependências do mobile"
pnpm --filter @prumo/mobile add `
    @prumo/contracts@workspace:* `
    @tanstack/react-query `
    axios `
    expo-secure-store `
    react-hook-form `
    zod `
    @hookform/resolvers

Step "Criando base funcional da API"
New-Item -ItemType Directory -Force -Path `
    "apps/api/src/database", `
    "apps/api/src/modules/auth", `
    "apps/api/src/modules/tenants", `
    "apps/api/src/modules/users", `
    "apps/api/src/modules/students", `
    "apps/api/src/modules/instructors", `
    "apps/api/src/modules/vehicles", `
    "apps/api/src/modules/schedules", `
    "apps/api/src/modules/lessons", `
    "apps/api/src/modules/exams", `
    "apps/api/src/modules/financial", `
    "apps/api/src/modules/notifications", `
    "apps/api/src/modules/audit" | Out-Null

@'
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
'@ | Set-Content -Encoding UTF8 apps/api/src/database/prisma.service.ts

@'
import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
'@ | Set-Content -Encoding UTF8 apps/api/src/database/database.module.ts

@'
import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return {
      status: "ok",
      service: "prumo-api",
      timestamp: new Date().toISOString(),
    };
  }
}
'@ | Set-Content -Encoding UTF8 apps/api/src/health.controller.ts

@'
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
    }),
    DatabaseModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
'@ | Set-Content -Encoding UTF8 apps/api/src/app.module.ts

@'
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Prumo API")
    .setDescription("API multi-tenant de gestão para autoescolas")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  const port = Number(process.env.API_PORT ?? 3333);
  await app.listen(port);

  console.log(`Prumo API: http://localhost:${port}/api`);
  console.log(`Swagger: http://localhost:${port}/docs`);
}

void bootstrap();
'@ | Set-Content -Encoding UTF8 apps/api/src/main.ts

Step "Criando instruções para o Codex do VS Code"
@'
# AGENTS.md — Prumo

Prumo é um SaaS multi-tenant para gestão de autoescolas, desenvolvido pela Anoar.

## Estrutura

- apps/api: NestJS
- apps/web: Next.js
- apps/mobile: Expo
- packages/database: Prisma e PostgreSQL
- packages/contracts: contratos compartilhados

## Regras obrigatórias

1. Manter a API como monólito modular.
2. Toda entidade pertencente a uma autoescola deve possuir tenantId.
3. Nunca confiar em tenantId enviado pelo frontend para autorização.
4. Validar o tenant por membership do usuário autenticado.
5. Toda consulta de negócio deve filtrar o tenant ativo.
6. Usuários podem participar de múltiplos tenants.
7. Não criar microsserviços nesta fase.
8. Compartilhar schemas e tipos em packages/contracts.
9. Valores financeiros devem ser armazenados em centavos.
10. Datas persistidas em UTC.
11. Criar testes para autenticação, agenda, financeiro e isolamento multi-tenant.
12. Rodar build, lint, typecheck e testes antes de concluir tarefas.
'@ | Set-Content -Encoding UTF8 AGENTS.md

@'
Implemente a primeira fase funcional do Prumo.

Leia primeiro:

- AGENTS.md
- package.json
- docker-compose.yml
- packages/database/prisma/schema.prisma
- toda a estrutura das aplicações

Depois:

1. Corrija qualquer erro de configuração ou compilação.
2. Implemente autenticação NestJS com access token e refresh token.
3. Implemente memberships e seleção segura de tenant.
4. Crie JwtAuthGuard, CurrentUser, CurrentTenant e controle de permissões.
5. Crie seed idempotente com:
   - tenant Autoescola Demonstração;
   - admin@prumo.local;
   - uma senha segura apenas para desenvolvimento;
   - membership TENANT_OWNER.
6. Crie login funcional no Next.js.
7. Crie login funcional no Expo.
8. Crie clientes HTTP com tratamento de erros.
9. Crie testes e2e para login e isolamento multi-tenant.
10. Execute migrations, typecheck, testes e builds.
11. Atualize o README com comandos realmente testados.

Não pare apenas no scaffolding. Faça alterações diretamente e deixe esta fase executável.
'@ | Set-Content -Encoding UTF8 CODEX_PROMPT.md

@'
# Prumo

## Executar

```powershell
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:migrate -- --name init
pnpm dev
```

## Endereços

- Web: http://localhost:3000
- API: http://localhost:3333/api
- Swagger: http://localhost:3333/docs

## Próxima tarefa no Codex

Abra `CODEX_PROMPT.md` no VS Code e peça ao Codex para executar integralmente as instruções.
'@ | Set-Content -Encoding UTF8 README.md

Step "Instalando dependências do monorepo"
pnpm install

Step "Subindo PostgreSQL e Redis"
docker compose up -d

Step "Aguardando PostgreSQL"
$PostgresReady = $false

for ($Attempt = 1; $Attempt -le 30; $Attempt++) {
    docker exec prumo-postgres pg_isready -U prumo -d prumo *> $null

    if ($LASTEXITCODE -eq 0) {
        $PostgresReady = $true
        break
    }

    Start-Sleep -Seconds 2
}

if (-not $PostgresReady) {
    throw "O PostgreSQL não ficou disponível no tempo esperado."
}

Step "Gerando Prisma Client"
pnpm db:generate

Step "Criando migration inicial"
pnpm db:migrate -- --name init

Step "Verificando builds"
pnpm --filter @prumo/api build
pnpm --filter @prumo/web build

Step "Inicializando Git"
if (-not (Test-Path ".git")) {
    git init
}

Write-Host "`nPrumo criado com sucesso em:" -ForegroundColor Green
Write-Host $ProjectRoot -ForegroundColor Green

Write-Host "`nAgora abra o arquivo CODEX_PROMPT.md no VS Code e peça ao Codex:" -ForegroundColor Yellow
Write-Host '"Leia AGENTS.md e CODEX_PROMPT.md e implemente toda a primeira fase."' -ForegroundColor Yellow

Write-Host "`nPara iniciar o projeto:" -ForegroundColor Green
Write-Host "pnpm dev"

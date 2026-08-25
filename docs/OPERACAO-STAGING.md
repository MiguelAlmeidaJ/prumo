# Operação em staging

## Containers

As imagens da API e do web são multi-stage e executam como o usuário não-root
`node`. A imagem final da API recebe somente o deploy de produção do pnpm; a do
web recebe somente a saída standalone do Next.js.

```bash
pnpm container:build:api
pnpm container:build:web
docker compose -f compose.staging.yml up -d
```

Os limites iniciais estão em `compose.staging.yml`: 512 MiB/1 CPU para API e
384 MiB/0,75 CPU para web. Ajuste-os com métricas reais. `NODE_OPTIONS` limita o
heap, mas o limite efetivo deve continuar sendo imposto pelo orquestrador.

SIGTERM e SIGINT acionam o shutdown do Nest, que encerra conexões Prisma,
Redis, workers BullMQ e S3. Configure ao menos 30 segundos de grace period no
orquestrador.

## Storage de documentos

O bucket deve ser privado, com bloqueio de acesso público. A API grava objetos
em `tenants/{tenantId}/students/{studentId}/documents/{uuid}` e valida esse
prefixo antes de assinar ou excluir qualquer objeto. Downloads usam URLs com
validade entre 60 e 900 segundos; o padrão é 300 segundos.

Em AWS, prefira credenciais por IAM Role e deixe as variáveis de access key
vazias. Em R2/MinIO, informe endpoint HTTPS e o par de credenciais. A identidade
da API deve ficar limitada ao bucket da aplicação. Defina
`STORAGE_SERVER_SIDE_ENCRYPTION` como `aws:kms`, `AES256` ou `none`; MinIO local
e provedores que criptografam automaticamente podem usar `none`. A política do
bucket continua sendo a fonte de garantia da criptografia em repouso.

Uploads armazenam tenant, aluno, usuário e nome original como metadados do
objeto. Acesso e upload são registrados em `AuditLog`. O banco nunca recebe URL
assinada, somente a chave privada estável.

O MinIO do `docker-compose.yml` existe apenas para desenvolvimento. O job de
inicialização cria o bucket e garante acesso anônimo desabilitado.

## Probes e métricas

- `GET /health`: liveness; não consulta dependências.
- `GET /ready`: PostgreSQL, Redis, filas e storage; retorna 503 se algum
  componente obrigatório estiver indisponível.
- `GET /metrics`: formato Prometheus e Bearer token obrigatório em staging e
  produção (`METRICS_TOKEN`).

Os logs HTTP são JSON e incluem request ID, usuário, tenant, rota, status,
duração e somente o tipo do erro. Corpos, cabeçalhos de autenticação, JWTs,
documentos e valores financeiros não são registrados.

As regras iniciais estão em `.ops/prometheus/prumo-alerts.yml`. O provedor do
bucket também deve alertar separadamente sobre quota/capacidade, erros 4xx/5xx
e crescimento anormal; S3 não oferece uma métrica portátil de espaço livre.

## Ordem de publicação

1. Provisionar PostgreSQL, Redis, bucket privado, SMTP e coletor Prometheus.
2. Aplicar migrations com `prisma migrate deploy` em job separado.
3. Executar `db:seed:reference`.
4. Executar `db:bootstrap-admin` uma única vez com senha injetada por secret.
5. Subir API e aguardar `/ready`.
6. Subir web, validar `/api/health` e executar smoke tests.
7. Ativar os alertas e verificar a entrega de uma notificação de teste.

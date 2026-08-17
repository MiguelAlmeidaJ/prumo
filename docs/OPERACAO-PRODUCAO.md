# Operação em produção

## Endpoints oficiais

- Web: `https://prumo.anoar.com.br`
- API: `https://aprumo.anoar.com.br/api`
- Health da API: `https://aprumo.anoar.com.br/health`

O `compose.production.yml` publica somente o Caddy nas portas 80 e 443. API e
web permanecem acessíveis apenas na rede interna do Compose. O Caddy solicita e
renova os certificados TLS automaticamente.

## Pré-requisitos

1. Crie registros DNS `A` (e `AAAA`, se aplicável) para `prumo.anoar.com.br` e
   `aprumo.anoar.com.br`, ambos apontando para o servidor de produção.
2. Libere TCP 80/443 e UDP 443 no firewall e no provedor.
3. Provisione PostgreSQL, Redis, SMTP e storage privado fora deste compose.
4. Copie `.env.production.example` para `.env.production` e preencha os secrets.

O DNS precisa estar propagado e as portas 80/443 precisam alcançar o Caddy para
que a emissão inicial dos certificados funcione.

## Validação e publicação

```bash
pnpm prod:config
pnpm prod:build
pnpm prod:up
pnpm prod:logs
```

Antes de iniciar a nova versão, aplique as migrations em um job controlado com
a `DATABASE_URL` de produção injetada explicitamente:

```bash
pnpm db:migrate
```

Esse comando não carrega `.env.production` automaticamente. Confirme a variável
do processo antes de executar para não migrar o banco errado.

Depois da subida, valide:

```bash
curl --fail https://aprumo.anoar.com.br/health
curl --fail https://aprumo.anoar.com.br/ready
curl --fail https://prumo.anoar.com.br/api/health
```

O build mobile dos perfis `preview` e `production` recebe
`EXPO_PUBLIC_API_URL=https://aprumo.anoar.com.br/api` pelo `eas.json`. Essa URL é
pública e não deve ser tratada como secret.

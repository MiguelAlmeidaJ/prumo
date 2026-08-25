# Checklist de homologação da RC1

Use este checklist no staging apontando para o mesmo commit e as mesmas imagens
registradas em [`STATUS-RELEASE.md`](../STATUS-RELEASE.md). Anexe evidência e
responsável a cada item; não registre segredos, tokens ou dados pessoais reais.

## Ambiente

- [ ] PostgreSQL zerado recebeu todas as migrations e o seed de referência.
- [ ] Bootstrap criou exatamente um `PLATFORM_OWNER` e a senha saiu do ambiente.
- [ ] `/ready` validou PostgreSQL, Redis, filas e storage.
- [ ] Bucket S3-compatible é privado; upload e URL assinada curta funcionam.
- [ ] API, web e mobile usam as URLs TLS do staging.
- [ ] SMTP entrega convite, redefinição, lembrete, exame, documento e cobrança.
- [ ] Expo Push entrega em dispositivo físico e registra falhas observáveis.
- [ ] Métricas e alertas de 5xx, latência, filas, PostgreSQL e storage funcionam.

## Personas

- [ ] Platform Owner: tenant → plano → assinatura → migração → suporte → auditoria.
- [ ] Dono/Admin: configuração → unidades → equipe → instrutores → veículos.
- [ ] Secretaria: aluno → processo → documentos → agenda → aulas → exames.
- [ ] Financeiro: contrato → parcelas → pagamento → caixa → despesas → relatórios.
- [ ] Instrutor: login mobile → agenda → aula → presença/status → notificações.
- [ ] Aluno: login mobile → processo → agenda → exames → financeiro → documentos.

## Aceite transversal

- [ ] Em cada fluxo, IDs do Tenant A não podem ser lidos nem alterados pelo Tenant B.
- [ ] Troca de tenant recalcula membership e permissões no servidor.
- [ ] Valores financeiros permanecem em centavos e datas persistidas em UTC.
- [ ] Logs, métricas e erros não expõem CPF, tokens ou conteúdo financeiro.
- [ ] Refresh, reabertura do app, Wi-Fi → rede móvel e fila offline não duplicam ações.

## Concorrência financeira

- [ ] Duas confirmações do mesmo pagamento.
- [ ] Pagamento × cancelamento da mesma parcela.
- [ ] Duas aberturas do mesmo caixa.
- [ ] Fechamento × movimentação do caixa.
- [ ] Pagamento em dinheiro × fechamento do caixa.
- [ ] Pagamento × cancelamento da mesma despesa.
- [ ] Duas gerações de parcelas do mesmo contrato.
- [ ] Dois ajustes no mesmo recebível sem perda de atualização.

## Encerramento

- [ ] Todos os jobs obrigatórios da CI estão verdes no commit candidato.
- [ ] Nenhum bloqueador P0 permanece em `STATUS-RELEASE.md`.
- [ ] Rollback e restore foram ensaiados antes da promoção.
- [ ] Produto, engenharia e operação aprovaram formalmente a RC1.

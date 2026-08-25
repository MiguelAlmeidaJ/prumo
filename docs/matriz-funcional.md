# Matriz funcional do PRUMO

Data da revisão: 25 de agosto de 2026.

| Área         | Funcionalidade               | API | Web | Mobile               | Teste             | Status                 | Observações                                          |
| ------------ | ---------------------------- | --- | --- | -------------------- | ----------------- | ---------------------- | ---------------------------------------------------- |
| Infra        | PostgreSQL                   | sim | n/a | n/a                  | integração        | funcional              | container saudável                                   |
| Infra        | Redis/BullMQ                 | sim | n/a | n/a                  | unitário/inspeção | funcional              | entrega externa depende de ambiente                  |
| Infra        | Mailpit SMTP local           | sim | n/a | n/a                  | inspeção          | funcional              | SMTP externo não homologado                          |
| Auth         | login e bcrypt               | sim | sim | sim                  | E2E               | funcional              | erro genérico e conta inativa coberta                |
| Auth         | refresh com rotação          | sim | sim | sim                  | E2E/unitário      | corrigido              | single-flight nos dois clientes                      |
| Auth         | logout e revogação           | sim | sim | sim                  | E2E               | funcional              | logout local vence offline                           |
| Auth         | seleção de tenant            | sim | sim | sim                  | E2E               | funcional              | membership é a autoridade                            |
| Auth         | usuário sem tenant           | sim | sim | sim                  | E2E               | funcional              | API retorna 403                                      |
| RBAC         | owner/admin tenant           | sim | sim | n/a                  | E2E               | funcional              | acesso limitado ao tenant                            |
| RBAC         | secretário                   | sim | sim | n/a                  | matriz/guards     | funcional              | operações administrativas                            |
| RBAC         | financeiro                   | sim | sim | n/a                  | E2E/guards        | funcional              | escrita financeira, leitura operacional              |
| RBAC         | instrutor                    | sim | n/a | sim                  | E2E               | corrigido              | sem endpoints administrativos gerais                 |
| RBAC         | aluno                        | sim | n/a | sim                  | E2E               | funcional              | somente dados próprios                               |
| RBAC         | console global               | sim | sim | n/a                  | E2E               | funcional              | papéis globais separados                             |
| Navegação    | sidebar por permissão        | n/a | sim | n/a                  | unitário          | corrigido              | fonte central de menu                                |
| Navegação    | proteção por URL direta      | sim | sim | sim                  | unitário/E2E      | corrigido              | web falha fechada e API autoriza                     |
| Cadastros    | alunos                       | sim | sim | próprio perfil       | E2E               | funcional              | CRUD, busca, paginação, status                       |
| Cadastros    | instrutores                  | sim | sim | próprio perfil       | E2E               | funcional              | CRUD, busca, paginação, status                       |
| Cadastros    | veículos                     | sim | sim | leitura operacional  | E2E               | funcional              | placa/RENAVAM tenant-scoped                          |
| Cadastros    | isolamento de CPF/placa      | sim | sim | n/a                  | E2E               | funcional              | duplicado permitido entre tenants                    |
| Estrutura    | unidades                     | sim | sim | leitura contextual   | E2E               | funcional              | CRUD, status e vínculo                               |
| Estrutura    | salas                        | sim | sim | n/a                  | E2E               | funcional              | capacidade e vínculo                                 |
| Agenda       | disponibilidade de instrutor | sim | sim | leitura própria      | E2E               | funcional              | sobreposição rejeitada                               |
| Agenda       | bloqueios de recurso         | sim | sim | leitura contextual   | E2E               | funcional              | tipo exato validado                                  |
| Agenda       | aula prática                 | sim | sim | sim                  | E2E               | corrigido              | transições atômicas                                  |
| Agenda       | reagendamento/cancelamento   | sim | sim | solicitação do aluno | E2E               | funcional              | aluno não muda agenda diretamente                    |
| Agenda       | conflito concorrente         | sim | sim | n/a                  | E2E concorrente   | corrigido              | uma criação e um 409                                 |
| Agenda       | agenda unificada             | sim | sim | sim                  | E2E               | funcional              | filtros e slots ocupados                             |
| Teórico      | turmas                       | sim | sim | sim                  | E2E               | funcional              | status e conflitos                                   |
| Teórico      | participantes/capacidade     | sim | sim | instrutor            | E2E               | funcional              | duplicidade e limite validados                       |
| Teórico      | presença                     | sim | sim | instrutor            | E2E               | funcional              | lote idempotente no mobile                           |
| Processos    | processo de habilitação      | sim | sim | aluno                | E2E               | funcional              | categorias e etapas                                  |
| Processos    | progressão/dependências      | sim | sim | aluno lê             | E2E               | corrigido              | transições atômicas                                  |
| Processos    | timeline/progresso           | sim | sim | aluno                | E2E               | funcional              | histórico tenant-scoped                              |
| Documentos   | requisitos e revisão         | sim | sim | aluno                | E2E               | funcional              | aprovação/rejeição auditadas                         |
| Documentos   | upload e download            | sim | sim | sim                  | E2E               | corrigido              | MIME, tamanho, dono, tenant e uso único              |
| Documentos   | storage de produção          | sim | n/a | sim                  | unitário/config   | parcialmente funcional | S3-compatible privado implementado; staging pendente |
| Exames       | criação e agenda             | sim | sim | aluno                | E2E               | funcional              | pré-requisitos aplicados                             |
| Exames       | resultado/tentativas         | sim | sim | aluno lê             | E2E               | funcional              | histórico imutável de tentativas                     |
| Financeiro   | serviços e planos            | sim | sim | aluno lê             | E2E               | funcional              | valores inteiros em centavos                         |
| Financeiro   | contratos e parcelas         | sim | sim | aluno                | E2E               | funcional              | geração e arredondamento                             |
| Financeiro   | pagamentos parciais          | sim | sim | aluno lê             | E2E               | funcional              | alocação múltipla                                    |
| Financeiro   | caixa e estorno              | sim | sim | n/a                  | E2E               | funcional              | fechamento e auditoria                               |
| Financeiro   | despesas e relatórios        | sim | sim | n/a                  | E2E               | funcional              | inadimplência e relatórios                           |
| Financeiro   | gateway/PIX/boleto           | não | não | não                  | não               | não implementado       | integração externa fora da fase                      |
| Comunicação  | notificações                 | sim | sim | sim                  | E2E               | funcional              | isoladas por tenant e usuário                        |
| Comunicação  | preferências                 | sim | sim | sim                  | E2E               | funcional              | padrão idempotente                                   |
| Comunicação  | templates/campanhas          | sim | sim | n/a                  | E2E               | funcional              | administração por permissão                          |
| Comunicação  | e-mail externo               | sim | sim | recebe               | provider          | bloqueado              | depende de SMTP de produção                          |
| Comunicação  | Expo Push real               | sim | n/a | sim                  | validação local   | bloqueado              | depende de credencial/dispositivo                    |
| Mobile       | home de aluno                | sim | n/a | sim                  | E2E               | funcional              | somente dados próprios                               |
| Mobile       | home de instrutor            | sim | n/a | sim                  | E2E               | funcional              | somente agenda atribuída                             |
| Mobile       | offline/cache                | sim | n/a | sim                  | unitário          | funcional              | allowlist e chave tenant/usuário                     |
| Mobile       | fila idempotente             | sim | n/a | sim                  | unitário/E2E      | funcional              | apenas ações operacionais                            |
| Mobile       | deep links                   | n/a | n/a | sim                  | unitário          | funcional              | validados por papel                                  |
| Mobile       | aparelho físico              | sim | n/a | sim                  | manual pendente   | parcialmente funcional | build passou; smoke físico pendente                  |
| Plataforma   | tenants e lifecycle          | sim | sim | n/a                  | E2E               | funcional              | sem exclusão física                                  |
| Plataforma   | planos/assinaturas           | sim | sim | n/a                  | E2E               | funcional              | billing interno                                      |
| Plataforma   | suporte temporário           | sim | sim | n/a                  | E2E               | funcional              | escopo e auditoria                                   |
| Plataforma   | métricas sem PII             | sim | sim | n/a                  | E2E               | funcional              | agregadas                                            |
| Segurança    | FKs compostas tenant         | sim | n/a | n/a                  | schema            | corrigido              | duas migrations novas                                |
| Segurança    | Swagger em produção          | sim | n/a | n/a                  | build/config      | corrigido              | fechado por padrão                                   |
| Segurança    | rate limit distribuído       | sim | n/a | n/a                  | integração        | funcional              | Redis por IP/identidade com fallback local           |
| Segurança    | sessão web HttpOnly          | sim | sim | n/a                  | cliente/smoke     | funcional              | refresh fica no BFF; cookie HttpOnly/SameSite        |
| Dependências | audit de produção            | n/a | n/a | n/a                  | pnpm audit        | parcialmente funcional | resta cadeia transitiva do Expo                      |

# Auditoria de dependências

Data da revisão: 10/08/2026.

## Resultado

A auditoria inicial encontrou 10 advisories `HIGH` e 2 `MODERATE`. Todas as
dependências afetadas eram transitivas. Após atualizações compatíveis e
overrides controlados, não restaram vulnerabilidades moderadas e restaram dois
advisories altos sobre a mesma dependência de build do mobile.

| Advisory            | Pacote                 | Severidade | Direta? | Contexto                 | Atualização               | Compatibilidade             | Situação                    |
| ------------------- | ---------------------- | ---------- | ------- | ------------------------ | ------------------------- | --------------------------- | --------------------------- |
| GHSA-rgw5-rvv9-x895 | brace-expansion 5.0.8  | HIGH       | Não     | CLI/build                | 5.0.9 disponível          | Patch                       | Corrigida                   |
| GHSA-rgw5-rvv9-x895 | brace-expansion 1.1.16 | HIGH       | Não     | CLI, lint e build        | 1.1.18 disponível         | Patch                       | Corrigida                   |
| GHSA-mh99-v99m-4gvg | brace-expansion 1.1.16 | HIGH       | Não     | CLI, lint e build        | 1.1.17 disponível         | Patch                       | Corrigida                   |
| GHSA-rgw5-rvv9-x895 | brace-expansion 2.1.3  | HIGH       | Não     | Expo/Metro               | 2.1.4 disponível          | Patch                       | Corrigida                   |
| GHSA-7p8r-x3mc-p8w7 | fast-uri 3.1.4         | HIGH       | Não     | Nest CLI/dev             | 3.1.5 disponível          | Patch                       | Corrigida                   |
| GHSA-5p4m-2wfm-xmqj | js-yaml 4.3.0          | HIGH       | Não     | Configuração de build    | 4.3.1 disponível          | Patch                       | Corrigida                   |
| GHSA-5p4m-2wfm-xmqj | js-yaml 3.15.0         | HIGH       | Não     | Teste/build mobile       | 3.15.1 disponível         | Patch                       | Corrigida                   |
| GHSA-2v37-7h3g-55p8 | nanoid 3.3.16          | HIGH       | Não     | Navegação mobile e build | 3.3.17 disponível         | Patch                       | Corrigida                   |
| GHSA-fxqj-rqcc-2cmp | postcss 8.5.22         | MODERATE   | Não     | Build web/mobile/API     | 8.5.23 disponível         | Patch                       | Corrigida                   |
| GHSA-w5hq-g745-h8pq | uuid 7.0.3             | MODERATE   | Não     | Configuração nativa Expo | 11.1.1 disponível         | Major, validada pelos gates | Corrigida                   |
| GHSA-w3rx-r6r6-pgpr | image-size 1.2.1       | HIGH       | Não     | Metro, somente dev/build | 2.0.3 ainda não publicada | Major                       | Risco aceito até 30/09/2026 |
| GHSA-5p2g-fcmc-qvqq | image-size 1.2.1       | HIGH       | Não     | Metro, somente dev/build | 2.0.3 ainda não publicada | Major                       | Risco aceito até 30/09/2026 |

## Justificativa para `image-size`

`image-size` chega ao projeto por `expo -> @expo/metro -> metro`. O uso ocorre
em `metro/src/Assets.js`, durante a leitura de assets que já pertencem ao
checkout. O pacote não é carregado pela API NestJS, pelo servidor Next.js nem
pelo bundle executado no dispositivo e não processa uploads de usuários em
runtime.

O advisory aponta correção em `>=2.0.3`, mas essa versão ainda não está
publicada no registry. Forçar a versão major disponível não corrige a falha e
pode quebrar o Metro. A exceção é limitada aos dois GHSA, ao pacote 1.2.1 e a
caminhos que contenham `metro > image-size`; expira em 30/09/2026.

O comando `pnpm audit:security` falha para qualquer outro `HIGH` ou `CRITICAL`,
inclusive se um dos advisories aceitos aparecer fora do Metro.

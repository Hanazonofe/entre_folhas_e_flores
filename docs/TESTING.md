# Verificação reproduzível

Nunca executar testes na base operacional. Os testes PostgreSQL exigem o destino descartável autorizado pelo runner (`PDV_TEST_TARGET`), nomes de banco de teste e credenciais descartáveis. URLs alternativas, arquivos de secrets e configuração libpq herdada são recusados antes de conectar; não basta chamar um banco de `pdv_test`. O script cria contêiner descartável próprio e recusa substituir um existente. As credenciais explícitas são fixtures sem uso operacional.

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.lock
PYTHON=.venv/bin/python scripts/test-database.sh
docker build -f deployment/Dockerfile.backup -t pdv-test-backup .
scripts/test-backup.sh
docker build -f deployment/Dockerfile.api -t pdv-test-api .
.venv/bin/python scripts/test-compose.py
npm test
npm run check
.venv/bin/ruff check backend/pdv --select F
```

O teste Compose usa projeto descartável pdv-compose-tests e porta 55469; COMPOSE_BIN permite apontar o executável Compose. Nunca reutilize esse nome em produção. O teste de backup usa porta 55459.

O script de banco usa Docker e porta loopback 55449, configurável por PDV_TEST_PORT. Cria esquema inicial e o atualiza até head, verifica diferença com metadados, aplica papéis reais e executa testes. A API usa pdv_api; worker usa pdv_backup. Não usa SQLite como substituto.

## Cobertura automatizada

As provas de aceitação da leitura automática de código de barras são
determinísticas e executam `pdv.js` contra uma superfície de navegador simulada,
com relógio e requisições controlados. Para executá-las diretamente, use:

```sh
node --test test/leitura-automatica-codigo-barras.spec.test.js
```

Elas cobrem os critérios AC-001 a AC-014, incluindo leitura sem foco na busca,
fila de leituras, bloqueios da venda, janelas sobrepostas e preservação de
campos financeiros. Não substituem o piloto com leitor físico.

## Gate final — leitura automática de código de barras

**Estado em 27/09/2026: pendente de piloto físico e de execução completa do
runner em ambiente que permita processos-filhos do Node.** Não há evidência de
leitor físico nesta estação; portanto esta entrega não declara compatibilidade
com um modelo de hardware nem considera a feature pronta para operação.

Os parâmetros efetivos em `barcode-scanner.js` a validar no piloto são: intervalo
máximo entre caracteres de 35 ms, silêncio de 80 ms, mínimo de cinco dígitos,
máximo de 100 caracteres e proteção de Enter tardio de 150 ms. Eles são uma
heurística para leitores que emulam teclado, não garantia de compatibilidade
universal.

### Evidência automatizada registrada

Em 27/09/2026 foi executado `./scripts/test-onp.sh`. A fase JavaScript aprovou
cinco arquivos, incluindo `tests/barcode-scanner.test.js`, mas o gate parou no
teste de segredos (`tests/secrets.test.js`) antes da etapa PostgreSQL. A causa
reproduzida é `spawnSync git EPERM`: o sandbox impede que o processo Node invoque
`git`. Não é uma falha atribuída à leitura de código de barras, mas impede um
resultado PASS completo e, por isso, não foi criada prova em
`.spec/verification/leitura-automatica-codigo-barras.json`.

Reexecutar o comando acima em um ambiente que permita o processo-filho e somente
aceitar o gate quando toda a suíte terminar com código zero. A prova JSON deve ser
gerada pelo fluxo de verificação; não deve ser preenchida manualmente.

### Roteiro do piloto físico pendente

Registrar para cada execução: data/hora, responsável, navegador e versão,
sistema operacional, modelo/configuração do leitor, código interno usado,
resultado observado e evidência anexada. Repetir os casos abaixo sem alterar os
parâmetros durante a rodada:

- Ler sem foco na busca, reler o mesmo produto e ler dois produtos em sequência
  (AC-001, AC-002 e AC-007).
- Manter busca filtrada, ler código com zeros iniciais fora do filtro e confirmar
  igualdade exata de `code`, sem usar prefixo, nome ou `barcode` (AC-003 e AC-006).
- Confirmar os avisos e a continuidade após código desconhecido e produto inativo
  (AC-004 e AC-011).
- Abrir uma janela durante leituras pendentes, verificar o aviso para reler e
  confirmar que respostas tardias não alteram o carrinho; fechar e reler (AC-005
  e AC-014).
- Digitar lentamente dentro e fora da busca, inclusive Enter, e confirmar que só
  o clique adiciona produto (AC-008 e AC-009).
- Repetir a leitura com venda bloqueada por processamento ou confirmação pendente
  (AC-010).
- Ler com foco em desconto e pagamento: o valor anterior deve voltar, totais não
  podem receber valores provisórios e digitação lenta continua editável (AC-012).
- Durante consulta/fila pendente, confirmar que conferir e fechar ficam bloqueados
  enquanto novas leituras continuam sendo capturadas; ao terminar ou cancelar,
  os bloqueios normais devem voltar (AC-013).

20 testes Python: pagamentos inválidos/zero/divididos, troco, desconto, rollback, histórico/autoria, edição/cancelamento/reativação, ciclos, estoque negativo, versões concorrentes, idempotência concorrente/resposta perdida, preço modificado, snapshots, código duplicado, permissões, cookies, CSRF, expiração/rate limit, último administrador, calendário São Paulo, fila offline, reenvio, upload retomável/resposta perdida e quota recusada e retenção de 30 arquivos sem apagar pendentes.

40 testes JavaScript: 37 de preservação do módulo legado e backup JSON do PR #2; três da nova camada API/comprovante/recursos locais. Os testes legados não significam que as páginas novas usam localStorage. O adaptador de rede simula falha antes da repetição; a integração PostgreSQL prova a unicidade da operação após confirmação no servidor.

## Conferências realizadas nesta entrega

- Build das imagens API/backup; Compose com banco vazio, migrações e contas sem seed; API com UID 10001 e papel restrito.
- API em rede Docker interna sem rota externa: login/venda por HTTPS e idempotência após reinício do processo.
- HTTPS Caddy com CA interna verificada explicitamente pelo cliente de teste (sem instalar confiança no sistema do usuário).
- Dump real customizado, age, descriptografia e pg_restore em banco isolado; dados de teste recuperados com uma venda e duas parcelas.
- Navegador local: login, carregamento de catálogo, pagamentos Pix+dinheiro, recebido insuficiente e confirmação posterior, comprovantes ativo/cancelado, recusa de confirmação de cancelamento, retirada dos totais ativos e escape de HTML; produtos conferidos em viewport 390px; queda real do servidor no navegador manteve carrinho/pedido e nova tentativa confirmou uma única venda.
- Auditoria das dependências fixadas com pip-audit: nenhuma vulnerabilidade conhecida reportada na execução.

Os testes de transporte Google usam respostas simuladas. Não houve OAuth da conta da loja, envio/download real no Drive nem instalação nos dispositivos do usuário. Não afirmar conclusão desses critérios com mocks.

## Piloto obrigatório antes da operação

1. Revisão/aprovação do PR #2 e deste PR; preservar backups do navegador. Confirmar mudança de fluxo (cadastro por API, sem importação CSV/JSON na nova UI).
2. Linux/IP local/DNS/fuso/CA confiável em dois dispositivos; dois usuários distintos. Banco inicia vazio; cadastrar apenas dados de piloto em instância separada.
3. Desligar conexão WAN mantendo LAN: login, venda e impressão devem funcionar. Retirar acesso ao servidor: manter carrinho/pedido, restaurar conexão, repetir com mesma chave e confirmar exatamente uma venda.
4. Operador tenta chamadas administrativas diretas (403). Dois administradores editam mesma versão: um sucesso e um 409. Comparar estoque antes/depois.
5. Conferir layout estreito, comprovantes de 80 mm e impressora real, venda ativa/alterada/cancelada. Recusar confirmação não deve alterar registro.
6. Reiniciar servidor Linux e verificar volumes, sessão/validade e serviços automáticos. Testar data das 23h e agendamento perdido, espaço insuficiente e fila sem rede.
7. Autorizar Drive, gerar/enviar/baixar/descriptografar/restaurar cópia real. Revogar credencial e simular quota: vendas continuam, pendências alertam, nada pendente é excluído. Medir tempo de recuperação, conferir 30 cópias remotas e sete dias locais usando dados descartáveis.
8. Registrar evidências, responsáveis e decisão explícita de entrada em operação. Nenhum merge, troca de base ou publicação automática.


## Provas mínimas da Constituição (P-002 a P-007)

Executar `./scripts/test-onp.sh` e, com o pacote 0.9.0 já disponível no cache,
`npm_config_offline=true npx @onovoprogramador/onp-spec@0.9.0 audit`.
O runner usa projeto Compose exclusivo, PostgreSQL descartável em tmpfs e rede
interna sem rota externa. Não lê `.env` operacional. Reutiliza a imagem local
`entre-folhas-pdv-test-test:latest` (ou `PDV_TEST_IMAGE`) com backend, testes e
scripts de implantação atuais montados somente para leitura. As dependências
da imagem devem corresponder a `backend/requirements-dev.lock` e seu lock base.
Sem imagem pronta, tenta build sem rede; dependências/imagens ausentes são uma
falha de preparação, não motivo para baixar durante a prova offline.

- P-002: `tests/secrets.test.js` examina blobs do índice, cópias de trabalho
  rastreadas e arquivos novos não ignorados. Detecta literais de credenciais,
  URLs autenticadas, chaves privadas e assinaturas de tokens; só relata
  localizações. Valores descartáveis terminados em `test-only` e uma lista
  explícita de fixtures antigas/placeholders são permitidos. As regras têm
  controles positivos e negativos. Não é prova universal contra segredos
  ofuscados, formatos desconhecidos ou presentes apenas no histórico Git.
- P-003: `tests/database/test_migrations.py` exige banco vazio, executa a cadeia
  de migrations, `alembic check`, confere revisão e triggers/funções de
  integridade. Executa antes das fixtures e grants; roles/grants são
  provisionamento do ambiente. Não reutilizar um banco preenchido nessa etapa.
- P-004: `tests/safety/test_database_isolation.py` verifica recusa anterior à
  conexão, inclusive overrides por arquivo/query/libpq. `backend/test_support.py`
  protege fixtures e conexões SQLAlchemy da aplicação durante os testes.
  `PDV_TEST_TARGET` é autorização fornecida pelo runner que provisiona o
  contêiner, não um mecanismo para tornar uma base operacional segura.
- P-005: testes existentes de entrada, planilha e CSV, mais inspeção dos tipos
  e valores no PostgreSQL e dos snapshots before/after e de idempotência.
  O escopo é o domínio PostgreSQL atual, não a persistência legada do navegador.
- P-006: testes existentes de histórico, snapshots, idempotência e concorrência,
  ampliados com rejeição de desequilíbrio/exclusão e rollback de edição após
  escrita real do evento. Asserções de estado são feitas após a falha.
- P-007: `test_operator_sale_and_session_expiry` autentica usuário local,
  consulta produtos, registra e consulta a venda com rede externa bloqueada;
  mantém as verificações anteriores de permissão e expiração. A verificação
  estática das páginas ativas permanece em `tests/ui.test.js`. Não há navegador
  automatizado nem prova de instalação offline.

O runner inclui `tests/importer/` sem skips por falta de banco. O roteiro
`backup_roundtrip.py` continua separado, executado por `scripts/test-backup.sh`.
As tags são comentários/títulos reconhecidos pelo ONP. O `audit` 0.9.0 verifica
sua presença, mas não substitui o resultado da suíte nem gera uma prova PASS
individual de cada princípio; a saída Python continua sendo a saída do pytest.

# Verificação reproduzível

Nunca executar testes na base operacional. Os testes PostgreSQL recusam banco cujo nome não seja `pdv_test`; o script cria contêiner descartável próprio e recusa substituir um existente. As credenciais explícitas são fixtures sem uso operacional.

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

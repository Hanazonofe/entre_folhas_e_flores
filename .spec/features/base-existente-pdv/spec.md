# Spec: Base existente do PDV

> feature: base-existente-pdv
> status: auditada

## Contexto

Registro retrospectivo das funcionalidades anteriores à adoção das Specs, solicitado para regularizar os apontamentos ARQUIVO_ORFAO. Não introduz funcionalidades, não altera regras operacionais e não afirma que cada arquivo tenha cobertura completa. Os critérios abaixo descrevem comportamentos já verificados pelos testes existentes; as tarefas documentam a responsabilidade dos arquivos de cada domínio.

Fontes: README.md, docs/INSTALL.md, docs/BACKUP.md, código e testes relacionados nas tarefas. Os módulos store.js, catalog.js e backup.js são legados preservados, não utilizados pelas páginas atuais.

## Histórias

### US-006 — Manter rastreável a base existente

Como mantenedor, quero relacionar os arquivos existentes às funcionalidades que suportam e às provas de regressão disponíveis, para que a auditoria identifique novos arquivos sem responsabilidade documentada.

#### AC-040 — Sessões e permissões locais

- **Dado** um operador autenticado
- **Quando** ele consulta recursos administrativos ou envia uma requisição sem proteção CSRF válida
- **Então** o servidor rejeita o acesso; ao sair, a sessão deixa de autorizar consultas

#### AC-041 — Histórico íntegro de vendas

- **Dado** uma venda confirmada
- **Quando** um administrador edita, cancela e reativa essa venda
- **Então** o histórico preserva as transições, versões desatualizadas são rejeitadas e o estoque cadastral permanece inalterado

#### AC-042 — Importação de planilha com confirmação

- **Dado** uma planilha de produtos selecionada
- **Quando** o operador solicita prévia e depois confirma a aplicação
- **Então** a interface não envia a importação antes da confirmação e trocar o arquivo invalida a prévia

#### AC-043 — Importador CSV começa em simulação

- **Dado** um CSV válido e o banco de testes
- **Quando** o importador é chamado sem opção de aplicação
- **Então** ele apresenta o resultado da simulação sem gravar produtos

#### AC-044 — Reconstrução do schema por migrations

- **Dado** um banco de testes vazio
- **Quando** as migrations são executadas até a versão atual
- **Então** o schema corresponde aos modelos e contém os gatilhos de integridade esperados

#### AC-045 — Backup pendente sobrevive à indisponibilidade

- **Dado** um backup gerado e o destino remoto indisponível
- **Quando** o serviço tenta enviá-lo e depois repete com o destino disponível
- **Então** o registro permanece pendente durante a falha e passa a enviado na retomada sem gerar novamente o arquivo

#### AC-046 — Proteção da restauração legada do navegador

- **Dado** um backup legado selecionado
- **Quando** o usuário tenta substituir os dados locais
- **Então** a interface exige exportação prévia e confirmação explícita antes da substituição

#### AC-047 — Comprovante com valores e conteúdo escapado

- **Dado** uma venda cancelada com pagamentos divididos e textos contendo HTML
- **Quando** o comprovante é renderizado
- **Então** o cancelamento, os meios e o troco aparecem, e o texto do usuário não vira HTML executável

#### AC-048 — Páginas atuais isoladas da persistência legada

- **Dado** as páginas atuais do PDV
- **Quando** seus recursos executáveis são inspecionados
- **Então** elas não carregam scripts externos nem os módulos de persistência legada, e os módulos atuais de operação não usam localStorage

## Restrições e limites da prova

- Manter a detecção de arquivos órfãos e todos os srcGlobs atuais.
- Excluir somente caches Python e de pytest, além das exclusões padrão do motor.
- Preservar as asserções dos testes existentes; acrescentar apenas identificadores de rastreabilidade.
- A associação de scripts de implantação, autorização externa e restauração aos seus domínios não comprova execução em produção. Configuração Google, HTTPS em dispositivos e restauração externa real continuam dependendo dos procedimentos e validações descritos em docs/INSTALL.md, docs/BACKUP.md e docs/TESTING.md.
- Não apagar código legado nem o histórico de sinais da auditoria.

## Fora de escopo

Novas funcionalidades, publicação, migração de dados operacionais e eliminação de código legado.

## Suposições

Nenhuma. Este documento descreve somente comportamentos observados no código e nas asserções existentes.

## Perguntas em aberto

Nenhuma para a regularização da rastreabilidade.

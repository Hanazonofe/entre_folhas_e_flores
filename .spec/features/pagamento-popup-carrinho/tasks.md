# Tasks: Cobrança em popup e carrinho abaixo do total

> feature: pagamento-popup-carrinho

Projeto técnico registrado em design.md; T-029 em andamento e implementação pendente. Este arquivo propõe o trabalho futuro; não autoriza execução nem define modelos, esforços ou paralelismo. Os caminhos novos são propostas a revisar no projeto técnico.

## T-029 — Projetar layout e ciclo de vida da venda [em-andamento]

- Refs: US-015, US-016, US-017, US-018, AC-075, AC-080, AC-083, AC-086, AC-087, AC-088, AC-089
- Arquivos: .spec/features/pagamento-popup-carrinho/design.md
- Notas: Projeto inicial registrado; a exceção de aviso está confirmada: obrigatório nos links internos, sem garantia nos controles do navegador. Faltam ensaios técnicos de identidade/transferência de aba e recuperação pelo histórico conforme design.md. Definir recuperação por aba e conta, links e histórico versus recarga, limpeza de rascunho e prioridade do pedido enviado. Documentar decisão de persistência e compatibilidade com cache de navegação; levantar necessidade de ADR. Referenciar Garden e os contratos de pagamentos/leitor. Antes da implementação, apresentar plano e confirmar modo de execução, modelos e esforços.

## T-030 — Compor resumo fixo e cobrança em diálogo Garden [pendente]

- Refs: US-015, US-016, US-018, AC-075, AC-076, AC-077, AC-078, AC-079, AC-089, AC-090
- Arquivos: pdv.html, pdv.js, ui.css, tests/pdv-payment-dialog.test.js
- Notas: Depende de T-029. Total e ação acima dos itens; popup inicialmente fechado em todos os tamanhos. Testar rolagem e viewport real; não alterar regras financeiras nem estilos de outras páginas.

## T-031 — Integrar saída da cobrança e proteção de fechamento [pendente]

- Refs: US-016, AC-080, AC-081, AC-082, AC-083, AC-084
- Arquivos: pdv.js, tests/pdv-payment-dialog.test.js, tests/pdv-payments.test.js, test/leitura-automatica-codigo-barras.spec.test.js, tests/helpers/pdv-harness.js
- Notas: Depende de T-030. Limpar cobrança somente quando abandonada sem pedido pendente; manter validação no servidor, idempotência, recuperação e leitor suspenso. Não alterar o comportamento financeiro do editor compartilhado.

## T-032 — Preservar produtos em navegação confirmada e limpar na recarga [pendente]

- Refs: US-017, AC-083, AC-084, AC-085, AC-086, AC-087, AC-088
- Arquivos: pdv.js, sale-navigation.js, api.js, pdv.html, produtos.html, vendas.html, admin.html, backend/pdv/app.py, package.json, tests/pdv-navigation.test.js, tests/helpers/pdv-harness.js
- Notas: Depende de T-031. Após resolver os ensaios bloqueantes de T-029, implementar a estratégia do projeto técnico, cobrindo cancelar/confirmar saída, links, histórico, login e separação de abas. Não reutilizar armazenamento do pedido enviado como rascunho genérico. Testar retorno com e sem restauração da página pelo navegador.

## T-033 — Validar critérios e regressões no navegador e auditar [pendente]

- Refs: US-015, US-016, US-017, US-018, AC-075, AC-076, AC-077, AC-078, AC-079, AC-080, AC-081, AC-082, AC-083, AC-084, AC-085, AC-086, AC-087, AC-088, AC-089, AC-090
- Arquivos: tests/pdv-payment-dialog.test.js, tests/pdv-navigation.test.js, docs/TESTING.md, .spec/features/pagamento-popup-carrinho/validacao.md, .spec/verification/pagamento-popup-carrinho.json
- Notas: Depende de T-032. Provar comportamento e acessibilidade em 360, 768 e 1440 px, desktop e celular, com teclado e toque. Rodar testes e gates; registrar limitações reais e problemas globais preexistentes sem declarar sucesso indevido.

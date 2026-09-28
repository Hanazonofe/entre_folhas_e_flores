# Tasks: Ajuste dos meios de pagamento

> feature: ajuste-meios-pagamento

## Estratégia

Implementar primeiro o contrato do editor compartilhado, depois integrar os dois fluxos e fechar a verificação. Todas as tarefas estão pendentes; este documento não autoriza execução automática. Os testes devem verificar comportamento observável e usar as referências de aceite nos títulos. Valores monetários serão calculados em centavos inteiros.

A tarefa T-009 pode ocorrer em paralelo com T-010. Após T-009, T-011 e T-012 podem ocorrer em paralelo entre si. T-013 depende de todas. O agrupamento automático por arquivos deve ser conferido contra essas dependências antes da execução.

## T-009 — Ajustar distribuição e conferência no editor compartilhado [pendente]

- Refs: US-004, AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-024, AC-025, AC-029, AC-030
- Arquivos: payments.js, ui.css, tests/payment-editor.test.js
- Dependências: nenhuma.
- Entrega: receber o total da venda em centavos separadamente da lista de pagamentos; carregar pagamentos existentes sem redistribuição durante a montagem.
- Entrega: novos meios zerados; alterações nos demais recalculam o primeiro; edição manual do primeiro é preservada; excesso nos demais mantém o último valor válido do primeiro e apresenta erro.
- Entrega: remoção recalcula o primeiro restante; um único restante assume o total. Não alterar o tipo do meio nem preencher automaticamente o valor recebido em dinheiro.
- Entrega: botão Recalcular e indicador acessível adjacente para falta, excesso ou igualdade; esse botão não altera pagamentos. Calcular a diferença mesmo com valores zerados, sem confundir igualdade da soma com distribuição válida.
- Entrega: impedir extração de pagamentos para conclusão quando houver valores não positivos ou divergência da soma; manter as validações existentes de dinheiro e troco.
- Validação: testes comportamentais para todos os critérios referenciados, incluindo três meios, edição manual, remoção do primeiro, excesso e recuperação após correção; conferir layout nos dois contêineres existentes.

## T-010 — Comprovar rejeição de pagamentos inválidos no servidor [pendente]

- Refs: US-004, AC-024, AC-025, AC-026, AC-031
- Arquivos: backend/tests/test_payment_validation.py, backend/pdv/schemas.py, backend/pdv/services.py
- Dependências: nenhuma.
- Entrega: testar criação e edição com meio zerado e soma divergente, confirmando rejeição e ausência de persistência parcial; na edição, conferir que a venda original e seus pagamentos permanecem intactos.
- Entrega: testar distribuição válida e manter regras de dinheiro, troco e integridade existentes. O schema já exige applied_cents positivo: alterar produção somente se os testes demonstrarem lacuna real.
- Validação: executar testes de API em banco isolado conforme a constituição; nunca usar banco de produção. Não introduzir migration sem necessidade demonstrada.

## T-011 — Preservar os pagamentos na confirmação do PDV [pendente]

- Refs: US-004, AC-024, AC-025, AC-026, AC-027, AC-028
- Arquivos: pdv.js, payments.js, tests/pdv-payments.test.js, tests/helpers/pdv-harness.js
- Dependências: T-009 (contrato do editor estabilizado).
- Entrega: separar atualização do total retornado pelo servidor de substituição da lista; preservar ordem, tipos, valores aplicados, valores recebidos e linhas zeradas nas novas confirmações.
- Entrega: inicializar o pagamento padrão apenas no fluxo inicial sem pagamentos, preservando o comportamento existente; nova confirmação de uma lista preenchida nunca deve reinicializá-la.
- Entrega: atualizar o indicador quando o servidor retornar outro total sem redistribuir pagamentos; bloquear fechamento inválido e permitir fechamento válido.
- Entrega: preservar bloqueios durante consulta, confirmação de preços, pedido pendente e proteção contra duplicação. Falha de consulta não deve apagar o preenchimento.
- Validação: testes com resposta de total igual, maior e menor, dinheiro recebido, linha zerada e repetição da confirmação; executar regressões do leitor de código de barras e pedido pendente afetadas pelo fluxo.
- Notas: payments.js está mapeado para sinalizar a dependência de contrato ao agrupador; ajustes no editor pertencem prioritariamente a T-009.

## T-012 — Aplicar as regras na edição administrativa [pendente]

- Refs: US-004, AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-024, AC-025, AC-029, AC-030, AC-031
- Arquivos: vendas.js, payments.js, tests/admin-payments.test.js
- Dependências: T-009 (contrato do editor estabilizado).
- Entrega: carregar os pagamentos da venda sem redistribuí-los na abertura; fornecer o total atual ao editor para os cálculos e para a conferência.
- Entrega: integrar inclusão, edição manual, recálculo informativo e remoção com as regras compartilhadas; validar soma e valores positivos antes do envio para salvar.
- Entrega: preservar os controles de versão, permissões e restrições de vendas canceladas. Não criar um botão adicional de confirmação no servidor para este fluxo.
- Validação: testes comportamentais da abertura, distribuição, edição do primeiro, excesso, remoção e salvamento válido/inválido, verificando os dados enviados e a preservação do formulário quando houver erro.
- Notas: payments.js sinaliza a dependência ao agrupador; caso esta tarefa e T-011 sejam paralelizadas após T-009, nenhuma delas deve alterar o editor compartilhado simultaneamente.

## T-013 — Verificar cobertura, regressões e auditar a entrega [pendente]

- Refs: US-004, AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-024, AC-025, AC-026, AC-027, AC-028, AC-029, AC-030, AC-031
- Arquivos: tests/payment-editor.test.js, tests/pdv-payments.test.js, tests/admin-payments.test.js, backend/tests/test_payment_validation.py, tests/BROWSER-CHECKLIST.md, .spec/features/ajuste-meios-pagamento/spec.md, .spec/features/ajuste-meios-pagamento/tasks.md, .spec/verification/ajuste-meios-pagamento.json
- Dependências: T-009, T-010, T-011, T-012.
- Entrega: conferir que os 17 critérios têm testes anotados com @spec:AC-xxx e prova real de aprovação, incluindo evidência nos dois fluxos para os critérios compartilhados.
- Entrega: documentar e executar verificação visual do botão, indicador, mensagens e navegação por teclado no PDV e no modal administrativo.
- Validação: executar npm run check, testes relevantes e o runner configurado por onp-spec verify ajuste-meios-pagamento; concluir com onp-spec audit --ci e registrar a saída real.
- Notas: não enfraquecer testes, não marcar tarefas concluídas sem prova e não alterar pendências de outras features para simular aprovação. Relatar separadamente problemas preexistentes que bloqueiem a auditoria global.

## Definição de conclusão

Todos os critérios com testes aprovados, nenhuma gravação de pagamento zerado, distribuição válida nos dois fluxos, confirmação no servidor preservando o preenchimento e auditoria final sem erros. A etapa atual entrega somente o detalhamento; modelos, esforço e modo de execução devem ser definidos antes de executar.

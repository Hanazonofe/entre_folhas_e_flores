# Spec: Ajuste dos meios de pagamento

> feature: ajuste-meios-pagamento
> status: implementada

## Contexto

O operador precisa distribuir o total da compra entre vários meios de pagamento, ajustar valores manualmente e visualizar diferenças. Atualmente, o editor não ajusta o primeiro meio e a ação Confirmar valores no servidor substitui os pagamentos preenchidos. Esta especificação registra o escopo confirmado no /grill; não representa implementação concluída.

## Regras confirmadas

- As regras de distribuição, edição manual, remoção, conferência de diferença e validação se aplicam tanto ao PDV quanto à edição administrativa de vendas.

- Cada novo meio nasce com valor aplicado de R$ 0,00.
- Preencher ou alterar os demais meios recalcula o primeiro como total da venda menos a soma dos demais. Se a soma dos demais ultrapassar o total, preservar o último valor válido do primeiro, mostrar erro e bloquear a conclusão até a correção.
- O primeiro meio continua editável manualmente.
- Ao remover um meio, recalcular o primeiro da lista restante para cobrir o saldo; se restar apenas um meio, ele assume automaticamente o total da venda. Se o primeiro for removido, considerar o primeiro da lista restante.
- Recalcular apenas informa a diferença, sem redistribuir valores.
- Um indicador junto ao botão mostra quanto falta, quanto excede ou que os valores conferem.
- Confirmar valores no servidor preserva os meios e valores preenchidos, mesmo quando o total retornado muda; nesse caso, atualiza a diferença exibida.
- A conclusão exige todos os valores aplicados positivos e soma exatamente igual ao total. Zero, excesso ou falta impedem a conclusão com erro.

## Histórias

### US-004 — Distribuir e conferir os pagamentos sem perder o preenchimento

Como operador do PDV ou administrador editando uma venda, quero distribuir os valores entre meios de pagamento e conferir a diferença para concluir ou salvar a venda com a soma correta, sem perder os dados ao consultar o servidor.

Os critérios de distribuição e validação abaixo devem ser verificados nos dois fluxos. Na edição administrativa, concluir significa salvar as alterações. Os critérios de confirmação de valores no servidor descrevem essa ação no PDV, sem exigir criar um novo botão de confirmação na edição administrativa.

#### AC-015 — Novo meio começa zerado

- **Dado** uma venda de R$ 100,00 com o primeiro meio em R$ 100,00
- **Quando** o operador adiciona outro meio
- **Então** o novo meio exibe R$ 0,00 e o primeiro permanece em R$ 100,00; adicionar a linha não conclui a venda

#### AC-016 — Preenchimento desconta do primeiro meio

- **Dado** uma venda de R$ 100,00 e um segundo meio zerado
- **Quando** o operador informa R$ 30,00 no segundo meio
- **Então** o primeiro passa a R$ 70,00 e a soma permanece em R$ 100,00

#### AC-017 — Alterações consideram todos os demais meios

- **Dado** uma venda de R$ 100,00 com valores de R$ 50,00, R$ 30,00 e R$ 20,00
- **Quando** o operador altera o segundo para R$ 40,00
- **Então** o primeiro passa a R$ 40,00 e o terceiro permanece em R$ 20,00

#### AC-018 — Primeiro meio permite ajuste manual

- **Dado** uma venda de R$ 100,00 com pagamentos de R$ 70,00 e R$ 30,00
- **Quando** o operador altera manualmente o primeiro para R$ 60,00
- **Então** o primeiro mantém R$ 60,00 e o segundo mantém R$ 30,00, permitindo conferir a diferença sem redistribuição automática causada por essa edição

#### AC-019 — Recalcular mostra falta sem alterar valores

- **Dado** uma venda de R$ 100,00 com pagamentos de R$ 60,00 e R$ 30,00
- **Quando** o operador clica em Recalcular
- **Então** o indicador junto ao botão mostra Faltam R$ 10,00 e ambos os valores permanecem iguais

#### AC-020 — Recalcular mostra excesso sem alterar valores

- **Dado** uma venda de R$ 100,00 com pagamentos de R$ 80,00 e R$ 30,00
- **Quando** o operador clica em Recalcular
- **Então** o indicador junto ao botão mostra Excedem R$ 10,00 e ambos os valores permanecem iguais

#### AC-021 — Recalcular informa soma correta

- **Dado** uma venda de R$ 100,00 com pagamentos de R$ 70,00 e R$ 30,00
- **Quando** o operador clica em Recalcular
- **Então** o indicador junto ao botão mostra Valores conferem e mantém os valores digitados

#### AC-022 — Valor individual acima do total gera erro

- **Dado** uma venda de R$ 100,00
- **Quando** o operador informa R$ 110,00 em um meio
- **Então** o sistema mostra erro de valor acima do total e impede concluir enquanto a distribuição for inválida

#### AC-023 — Soma dos demais acima do total gera erro

- **Dado** uma venda de R$ 100,00 com pagamentos de R$ 20,00, R$ 60,00 e R$ 20,00
- **Quando** o operador altera o terceiro para R$ 50,00, fazendo os demais meios somarem R$ 110,00
- **Então** o primeiro mantém seu último valor válido de R$ 20,00, o segundo permanece em R$ 60,00 e o terceiro mantém os R$ 50,00 digitados
- **E** o sistema mostra erro de excesso e impede concluir até a correção
- **E** Recalcular informa Excedem R$ 30,00, considerando a soma efetivamente exibida, sem alterar os valores
- **E** ao corrigir o terceiro para R$ 10,00, o primeiro volta a ser recalculado automaticamente e passa a R$ 30,00

#### AC-024 — Meio zerado impede conclusão

- **Dado** uma venda com qualquer meio zerado, inclusive o primeiro quando os demais cobrem todo o total
- **Quando** o operador tenta concluir
- **Então** o sistema mostra erro exigindo valores positivos, bloqueia a conclusão e não persiste nenhum meio com valor aplicado zero no banco de dados
- **E** não ignora nem remove silenciosamente o meio zerado; o operador deve preencher ou remover a linha antes de concluir
- **E** o servidor também rejeita uma tentativa de salvar pagamento zerado, mesmo que a validação da tela seja contornada

#### AC-025 — Soma diferente impede conclusão

- **Dado** uma venda de R$ 100,00 com todos os meios positivos mas soma de R$ 90,00 ou R$ 110,00
- **Quando** o operador tenta concluir
- **Então** o sistema mostra erro de divergência e impede finalizar

#### AC-026 — Distribuição válida permite prosseguir

- **Dado** uma venda com valores confirmados no servidor e demais validações satisfeitas
- **Quando** o operador conclui com todos os meios positivos e soma exatamente igual ao total
- **Então** a distribuição é aceita e os meios e valores informados são enviados para concluir a venda

#### AC-027 — Confirmação no servidor preserva pagamentos

- **Dado** uma venda com vários meios preenchidos, incluindo seleção do meio e valor recebido em dinheiro quando houver
- **Quando** o operador confirma valores no servidor e o total permanece igual
- **Então** todos os meios permanecem na mesma ordem com seus valores aplicados, seleções e valores recebidos preservados, inclusive linhas zeradas ainda em edição

#### AC-028 — Novo total do servidor apenas atualiza diferença

- **Dado** uma venda com pagamentos de R$ 70,00 e R$ 30,00
- **Quando** a confirmação no servidor retorna total de R$ 120,00 ou R$ 90,00
- **Então** os pagamentos permanecem em R$ 70,00 e R$ 30,00 e o indicador junto a Recalcular mostra respectivamente Faltam R$ 20,00 ou Excedem R$ 10,00, sem ajustar o primeiro meio

#### AC-029 — Remoção recalcula o primeiro entre os meios restantes

- **Dado** uma venda de R$ 100,00 com pagamentos de R$ 50,00, R$ 30,00 e R$ 20,00
- **Quando** o operador remove o segundo meio
- **Então** o primeiro passa a R$ 80,00 e o outro permanece em R$ 20,00
- **E** se, em vez do segundo, remover o primeiro da distribuição original, o novo primeiro passa a R$ 80,00 e o último permanece em R$ 20,00

#### AC-030 — Único meio restante assume o total automaticamente

- **Dado** uma venda de R$ 100,00 com pagamentos de R$ 70,00 e R$ 30,00
- **Quando** o operador remove qualquer um dos dois meios
- **Então** o único meio restante assume automaticamente R$ 100,00, preservando o tipo de pagamento selecionado

#### AC-031 — Edição administrativa aplica as mesmas regras de pagamento

- **Dado** um administrador editando uma venda de R$ 100,00
- **Quando** adiciona um meio, preenche R$ 30,00 nele e depois usa Recalcular
- **Então** o novo meio nasce zerado, o preenchimento ajusta o primeiro para R$ 70,00 e Recalcular informa Valores conferem sem alterar os valores
- **E** a edição manual do primeiro, a remoção de meios e a preservação do último valor válido em caso de excesso seguem as mesmas regras do PDV
- **E** salvar com qualquer meio zerado ou soma diferente do total mostra erro e não grava as alterações inválidas; o servidor também rejeita pagamentos zerados na edição

## Restrições

- Calcular e comparar dinheiro em centavos inteiros, conforme P-005.
- A soma considera os valores aplicados; valor recebido em dinheiro e troco continuam sujeitos às regras existentes.
- Preservar validações do servidor, confirmação de preços e proteção contra vendas duplicadas.
- A mensagem Valores conferem indica igualdade da soma; não dispensa a validação de meios zerados.

## Fora de escopo

- Novos tipos de pagamento, integrações financeiras, mudanças de banco de dados ou nas regras de troco.
- Implementação, criação de testes e execução de tarefas nesta etapa de especificação.

## Suposições

Nenhuma. As decisões de comportamento registradas abaixo foram confirmadas pelo usuário.

## Perguntas em aberto

Nenhuma pendente. Histórico das decisões:

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
| Q-001 | Ao remover um meio, o primeiro deve voltar a cobrir automaticamente o restante, inclusive quando o próprio primeiro for removido? | respondida | Sim: recalcular sempre o primeiro da lista restante quando houver mais de um meio. |
| Q-004 | Se a remoção deixar somente um meio, ele deve assumir o total ou manter seu valor para ajuste manual? | respondida | O único meio restante assume automaticamente o total da venda. |
| Q-002 | Quando os demais meios excedem o total, qual valor deve permanecer visível no primeiro: último válido, zero ou saldo negativo apenas informativo? | respondida | Manter o último valor válido do primeiro enquanto o operador corrige o excesso; mostrar erro e impedir a conclusão. |
| Q-003 | As novas regras também devem valer na edição administrativa de vendas, que compartilha o editor? | respondida | Sim, as regras também se aplicam à edição administrativa de vendas. |

## Referências para o detalhamento

- payments.js: editor compartilhado, inclusão de linhas, valores e resumo.
- pdv.js: confirmação no servidor substitui hoje a lista via payments.set; fechamento valida a soma.
- vendas.js: aplicar as regras confirmadas ao editor administrativo e à validação de salvamento.

## Próxima etapa

Detalhar tarefas e testes rastreáveis para o PDV e a edição administrativa. A implementação está concluída; a auditoria global ainda tem pendências registradas em tasks.md. Cada critério deverá ter teste anotado antes de a feature ser considerada implementada ou auditada.

# Spec: Layout do PDV no mobile

> feature: layout-pdv-mobile
> status: auditada

## Contexto

No mobile, o catálogo aparece abaixo da busca e empurra o carrinho para o final da lista. O operador precisa percorrer os produtos disponíveis para conferir os itens adicionados e o total. Escopo refinado via /grill e confirmado pelo usuário: priorizar carrinho e total, pesquisar produtos sob demanda e expandir pagamento na mesma tela.

## Histórias

### US-005 — Operar a venda com o carrinho acessível

Como operador, quero acompanhar os produtos adicionados e o total no mobile, buscar o próximo produto e acessar o pagamento na mesma tela, para concluir a venda sem percorrer todo o catálogo.

#### AC-032 — Carrinho como conteúdo principal no mobile

- **Dado** o PDV no layout mobile e a busca vazia
- **Quando** o operador acessa a venda
- **Então** a busca aparece antes do carrinho, os itens adicionados e o total ficam acessíveis sem atravessar o catálogo, e o catálogo fica oculto

#### AC-033 — Produtos disponíveis durante a busca mobile

- **Dado** o PDV no mobile
- **Quando** o operador pesquisa um produto
- **Então** os resultados da busca aparecem para seleção; ao esvaziar a busca, os resultados e o catálogo ficam ocultos

#### AC-034 — Preparar a próxima busca em ambas as telas

- **Dado** uma busca no mobile ou desktop com produto disponível
- **Quando** o operador adiciona o produto com sucesso pelo botão Adicionar da busca ou de um resultado
- **Então** o carrinho e o total são atualizados, a busca é limpa, os resultados da busca fecham e o campo fica pronto para a próxima entrada; no mobile, o catálogo volta a ficar oculto

#### AC-035 — Preservar a disposição do desktop

- **Dado** o PDV no layout desktop
- **Quando** o operador acessa a tela e adiciona produtos
- **Então** o catálogo, o carrinho e o pagamento mantêm sua disposição e apresentação atuais, aplicando apenas a limpeza e o fechamento dos resultados da busca após adicionar

#### AC-036 — Pagamento inicialmente recolhido no mobile

- **Dado** uma nova venda no mobile
- **Quando** o operador visualiza o carrinho
- **Então** os campos de pagamento ficam recolhidos abaixo do total e há um botão “Ir para pagamento”

#### AC-037 — Expandir pagamento na mesma tela

- **Dado** uma venda em andamento no mobile
- **Quando** o operador aciona “Ir para pagamento”
- **Então** os campos e ações necessários ao pagamento ficam acessíveis na própria tela, sem navegação e sem ocultar ou perder os itens do carrinho e o total

#### AC-038 — Preparar nova venda após sucesso

- **Dado** o pagamento expandido no mobile
- **Quando** a venda é concluída com sucesso
- **Então** o pagamento volta a ficar recolhido e a busca fica limpa e pronta para a próxima venda, preservando o comportamento existente de conclusão e acesso ao comprovante

#### AC-039 — Preservar venda após erro

- **Dado** um carrinho com itens e o pagamento expandido no mobile
- **Quando** a tentativa de concluir a venda apresenta erro
- **Então** o carrinho é preservado e o pagamento permanece aberto para correção e nova tentativa

## Restrições

- Reorganização de catálogo, carrinho e pagamento exclusiva do mobile.
- Limpar a busca e fechar seus resultados após adicionar também no desktop.
- Exibir no mobile uma estimativa do total antes da conferência, identificada como “Total estimado”; após conferir, usar o total confirmado pelo servidor.
- Preservar regras existentes de quantidade, desconto, conferência, meios de pagamento, validação e integridade da venda.
- Não alterar o fluxo existente de leitura por leitor de código de barras, incluindo a preservação do texto e do foco do campo em uso. A limpeza após adição se aplica aos botões de busca e catálogo.
- “Ver os produtos como um todo” significa exibir os itens do carrinho como conteúdo principal; não exige acomodar um carrinho arbitrariamente longo inteiro na altura da tela.

## Fora de escopo

- Leitura de código de barras pela câmera do celular: será refinada em uma feature futura, por decisão explícita do usuário.
- Redesenho do desktop ou mudanças nas regras financeiras.

## Suposições

Nenhuma de produto. Como orientação de implementação, reutilizar o breakpoint responsivo existente do PDV (até 920 px), evitando detecção por modelo de aparelho.

## Perguntas em aberto

Nenhuma para o escopo de produto aprovado.

## Validação planejada

Verificar cada critério com testes de comportamento anotados, exercitar os caminhos existentes de adição e validar visualmente mobile e desktop. Conferir busca sem resultados, carrinho vazio e longo, teclado virtual e transição de largura sem perda da venda. Provas geradas por verify; validação visual em Chrome headless com dados simulados. A verificação do teclado virtual em aparelho físico continua manual.

## Validação do usuário

O usuário confirmou que testou o layout no ambiente local e que está OK, autorizando o envio ao Git.

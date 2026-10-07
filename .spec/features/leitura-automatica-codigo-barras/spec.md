# Spec: Leitura automática de código de barras na tela de vendas

> feature: leitura-automatica-codigo-barras
> status: pronta

## Contexto

O operador precisa passar produtos no leitor e adicioná-los ao carrinho sem
clicar na barra de busca nem pressionar Enter, como em um caixa de supermercado.
A entrada manual pelo teclado continua filtrando a lista e exige clique para
adicionar. Requisitos refinados em /grill e confirmados pelo usuário em 26/09/2026.
Esta revisão registra as decisões posteriores do projeto técnico, autorizadas pelo
usuário. A implementação permanece pendente. Ver [design.md](design.md) e
[tasks.md](tasks.md). O nome da feature é preservado para manter a rastreabilidade;
o código impresso lido pelo scanner identifica o campo interno `Product.code`,
e não o campo `Product.barcode`.

## Decisões confirmadas

- Distinguir leitura e digitação pelo tempo entre caracteres: leitura rápida,
  digitação manual mais lenta. A identificação é uma heurística, não uma
  garantia absoluta de reconhecer a origem física da entrada.
- Não exigir marca específica, configuração inicial do leitor ou Enter manual.
- Capturar leituras na tela de vendas sem depender do foco na barra de busca.
- Consultar somente o código interno completo (`Product.code`), por igualdade,
  preservando zeros iniciais; não procurar no campo `barcode` nem usar fallback.
- O usuário confirmou que os códigos lidos terão mais de quatro dígitos: mínimo
  de cinco. Isso delimita a captura; não altera a validação geral do cadastro.
- Cada leitura adiciona uma unidade, inclusive quando o produto já está no carrinho.
- Manter uma única barra de busca manual; não criar campo exclusivo para scanner.
- Manter leitura ativa com foco em desconto ou pagamento embutidos na página.
  Nesses campos numéricos, caracteres podem aparecer brevemente, mas não podem
  afetar desconto, pagamento ou totais antes da classificação. Ao reconhecer o
  scanner, restaurar o valor anterior e adicionar o produto.
- Desabilitar temporariamente conferência e fechamento enquanto existirem leituras
  pendentes de consulta/aplicação, mantendo a captura de novas leituras ativa.
- Ao abrir janela sobreposta, cancelar leituras pendentes com aviso para reler os
  produtos; manter produtos já adicionados e ignorar respostas canceladas.
- Para código interno cadastrado em produto inativo, exibir “Produto inativo”,
  sem adição. Falha de rede é erro de comunicação, não ausência de cadastro.
- Preservar o texto e o filtro da barra de busca durante a leitura.
- Suspender a adição automática enquanto uma janela sobreposta estiver aberta.
- Produto não cadastrado gera o aviso “Produto não encontrado”.
- A digitação manual exige foco na busca, filtra os produtos e só adiciona por clique.

## Histórias

### US-001 — Adicionar produtos com o leitor

Como operador, quero ler códigos sem selecionar a busca, para registrar produtos
no carrinho com continuidade.

#### AC-001 — Ler sem selecionar a busca

- **Dado** a tela de vendas ativa, sem janela sobreposta, com adição de produtos liberada e foco fora da busca
- **Quando** o leitor envia uma sequência rápida correspondente ao código interno completo de um produto ativo cadastrado, sem Enter
- **Então** uma unidade desse produto é adicionada ao carrinho após a identificação do fim da sequência, sem clique ou tecla adicional

#### AC-002 — Incrementar a quantidade

- **Dado** um produto já no carrinho e captura automática ativa
- **Quando** o mesmo código interno é lido novamente
- **Então** a quantidade desse produto aumenta em uma unidade, sem criar uma segunda linha para o mesmo produto

#### AC-003 — Preservar a busca e encontrar fora do filtro

- **Dado** texto digitado na busca, um filtro aplicado e foco no campo de busca
- **Quando** o leitor envia o código completo de um produto cadastrado que não aparece na lista filtrada
- **Então** esse produto é adicionado uma única vez e o texto e o filtro anteriores permanecem preservados, sem incorporar os caracteres do leitor

#### AC-004 — Avisar sobre produto não encontrado

- **Dado** captura automática ativa e um código interno sem produto cadastrado
- **Quando** o leitor envia esse código completo
- **Então** a tela exibe “Produto não encontrado”, não altera o carrinho e permite a próxima leitura

#### AC-005 — Suspender com janela aberta

- **Dado** uma janela sobreposta aberta na tela de vendas, como autenticação ou confirmação; os campos embutidos de pagamento e desconto não são janelas
- **Quando** um código é lido enquanto a janela está aberta e depois ela é fechada
- **Então** essa leitura não adiciona produto nem fica pendente para adição ao fechar; uma nova leitura completa após o fechamento volta a adicionar normalmente

#### AC-006 — Resolver o código completo

- **Dado** produtos cadastrados com códigos diferentes e captura ativa
- **Quando** o leitor envia o código interno completo de um deles
- **Então** somente o produto ativo cujo campo `code` corresponde exatamente ao código completo é adicionado; prefixo, nome, campo `barcode` ou primeiro resultado de busca não são usados como substitutos

#### AC-007 — Processar leituras consecutivas

- **Dado** captura ativa e carrinho editável
- **Quando** duas leituras completas e distintas são identificadas em sequência, inclusive antes de terminar a consulta da primeira
- **Então** cada leitura adiciona exatamente uma unidade do produto correspondente, sem perda nem duplicação

### US-002 — Buscar manualmente e escolher por clique

Como operador, quero digitar na barra de busca para restringir a lista e escolher
o produto por clique, sem que a busca manual altere o carrinho automaticamente.

#### AC-008 — Digitação manual apenas filtra

- **Dado** foco na barra de busca e entrada com intervalos classificados como digitação manual
- **Quando** o operador digita progressivamente um nome ou código, mesmo que corresponda exatamente a um produto, e pressiona Enter
- **Então** a lista acompanha o filtro digitado e o carrinho permanece inalterado; um clique de adição inclui o produto escolhido

#### AC-009 — Não transformar digitação fora da busca em pesquisa

- **Dado** foco fora da barra de busca
- **Quando** o operador digita uma sequência classificada como manual
- **Então** a barra de busca não recebe essa digitação e nenhum produto é adicionado automaticamente

#### AC-010 — Preservar bloqueios existentes da venda

- **Dado** a venda bloqueada por processamento ou pedido pendente de confirmação
- **Quando** um código interno é lido
- **Então** o carrinho continua bloqueado e a leitura não altera os dados do pedido em processamento ou pendente

### US-003 — Preservar valores e informar impedimentos durante a leitura

Como operador, quero que a captura preserve os valores da venda e informe
impedimentos, para concluir somente com os produtos e valores corretos.

#### AC-011 — Informar produto inativo

- **Dado** um código interno correspondente a produto cadastrado inativo
- **Quando** esse código completo é reconhecido como leitura
- **Então** a tela exibe “Produto inativo”, mantém o carrinho inalterado e permite a próxima leitura

#### AC-012 — Preservar campos financeiros durante a leitura

- **Dado** foco em desconto ou valor de pagamento embutido na página, com um valor anterior e captura ativa
- **Quando** uma sequência rápida é reconhecida como código interno de produto ativo
- **Então** o produto é adicionado uma vez e o valor anterior do campo é restaurado; caracteres podem aparecer transitoriamente, mas não são aplicados ao desconto, pagamentos ou totais
- **E** uma entrada classificada como manual continua editando normalmente o campo; a adição do produto invalida a conferência anterior dos valores, conforme a regra existente

#### AC-013 — Aguardar leituras antes de conferir ou fechar

- **Dado** uma ou mais leituras reconhecidas ainda aguardando consulta ou aplicação
- **Quando** o operador tenta conferir valores ou fechar a venda
- **Então** essas ações permanecem temporariamente desabilitadas, há indicação de leituras em processamento e novas leituras continuam sendo capturadas
- **E** quando a fila e a consulta em andamento terminam ou são canceladas, os botões voltam a seguir os bloqueios normais da venda, sem habilitar fechamento sem conferência válida

#### AC-014 — Cancelar leituras pendentes ao abrir janela

- **Dado** leituras na fila ou em consulta e produtos já adicionados ao carrinho
- **Quando** uma janela sobreposta é aberta
- **Então** as leituras pendentes são canceladas, a tela avisa que os produtos pendentes precisam ser lidos novamente e os produtos já adicionados permanecem no carrinho
- **E** respostas das consultas canceladas não adicionam produtos, mesmo após fechar a janela; somente novas leituras completas podem gerar adições

## Diretrizes técnicas e validação

- A tela operacional atual é `pdv.html`, com comportamento em `pdv.js`.
  Hoje `add` depende da lista filtrada e Enter adiciona seu primeiro resultado.
  A leitura precisará localizar o produto independentemente dessa lista.
- O limite entre caracteres, o tempo de silêncio para encerrar a leitura sem
  Enter e as condições mínimas de uma sequência serão definidos e validados
  na etapa técnica, conforme autorizado no resumo do Grill. Não se fixa aqui
  um valor definitivo em milissegundos nem uma marca ou comprimento único de EAN.
  Os valores iniciais propostos estão em design.md; o mínimo aprovado é cinco dígitos.
- Os testes devem usar relógio controlado e parâmetros explícitos para cobrir
  sequências rápidas, lentas e limites da classificação, término sem Enter,
  leituras consecutivas e interrupção por janela sobreposta. Um eventual Enter
  enviado automaticamente pelo leitor não deve duplicar a adição.
- Validar também em leitor físico antes de considerar a implementação concluída.
  Leitores que emulam teclado e tenham o mesmo padrão temporal são indistinguíveis
  para o navegador: não prometer compatibilidade universal com qualquer hardware.
- A classificação não pode corromper o texto manual enquanto aguarda distinguir
  a origem da sequência. Preservar a busca inclusive com o campo focado.
- A consulta por código deve respeitar as regras existentes de elegibilidade dos
  produtos. Falha de comunicação não prova ausência de cadastro e não deve ser
  apresentada como “Produto não encontrado”.
- Manter os bloqueios de processamento e pedido pendente existentes, a invalidação
  dos valores conferidos ao alterar o carrinho e os princípios da constituição.
- Cada critério terá teste anotado com `@spec:AC-xxx`. Conclusão da implementação
  exige `verify` e `audit --ci`, sem testes pulados como evidência.

## Fora de escopo

- Cadastro automático de produtos a partir de uma leitura desconhecida.
- Configuração por marca de leitor, instalação de drivers ou integração específica
  de hardware que não emule entrada de teclado.
- Captura fora da tela de vendas ou com a aplicação fora de foco.
- Reformulação de pagamentos, descontos, estoque ou persistência das vendas, além
  das proteções de captura e bloqueios explicitamente definidos nesta Spec.
- Mudança de esquema ou restrição dos códigos do cadastro geral para cinco dígitos.

## Suposições

Nenhuma decisão de negócio adicional assumida. A compatibilidade técnica é
limitada a leitores que enviam caracteres como teclado; os parâmetros temporais
permanecem trabalho de projeto e validação, sem alegação de eficácia já comprovada.

## Perguntas em aberto

Nenhuma pergunta de negócio pendente após o resumo confirmado. A definição dos
parâmetros temporais e sua validação em hardware pertencem à etapa técnica.

## Linguagem do domínio

Leitor, código de barras, produto, carrinho, barra de busca, tela de vendas,
janela sobreposta, código interno, “Produto não encontrado” e “Produto inativo”.

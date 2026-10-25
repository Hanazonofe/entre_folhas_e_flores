# Spec: Cobrança em popup e carrinho abaixo do total

> feature: pagamento-popup-carrinho
> status: auditada

## Contexto

O operador precisa acompanhar o total sem percorrer a lista de produtos e abrir a cobrança somente ao fechar a compra. Requisitos refinados em `/grill` e confirmados em 24/10/2026. Implementação sequencial concluída em worktree isolado, com provas PASS por critério e auditoria global limpa. Evidências e limites estão em [validacao.md](validacao.md).

## Decisões confirmadas

- Desktop e celular têm total sempre visível acima do carrinho e botão “Ir para pagamento”. Toda a lista de produtos do carrinho fica abaixo desse resumo.
- Desconto, conferência, pagamentos, recebido, troco, observações e fechamento ficam em popup separado, fechado inicialmente.
- Sair do pagamento descarta desconto, pagamentos e observações, mantendo produtos e quantidades. Esta decisão substitui a proposta anterior de preservar esses campos.
- Acionar links internos do sistema na mesma aba exige aviso de confirmação e preserva produtos e quantidades ao retornar. Ao usar Voltar/Avançar do navegador, preservar o carrinho ao retornar pelo histórico, sem garantir aviso antes da saída. Fechar a aba ou sair do site também não exige aviso garantido nem recuperação do carrinho. Recarregar a página da venda limpa o rascunho. Exceção confirmada pelo usuário em 24/10/2026.
- A proteção de venda já enviada e sem confirmação tem prioridade sobre a limpeza de rascunhos.
- O leitor continua ativo na tela de venda e fica suspenso com popup aberto.
- Usar o design system Garden como referência obrigatória.

## Referências e restrições

- [Design system Garden](../../../docs/DESIGN_SYSTEM.md): cores e tokens, tipografia, espaçamento, moeda em pt-BR, controles de pelo menos 44 px e diálogo nativo acessível. Referência visual executável em `/design-system.html`.
- `design-tokens.css` fornece tokens; `ui.css` concentra estilos operacionais. Não copiar classes exclusivas `.ds-*` do catálogo nem criar um tema paralelo.
- Valores de domínio em centavos inteiros; preços, descontos e pagamentos continuam sujeitos às regras existentes e à conferência no servidor.
- Sem mudanças de schema, dependências externas, alteração da edição administrativa ou publicação automática nesta etapa.
- A implementação deve distinguir navegação interna, recarga, retorno pelo histórico e pedido enviado sem confirmação; não confiar somente no cache de páginas do navegador.
- Propostas de arquitetura de persistência ficam para o projeto técnico. Produtos recuperados não autorizam finalizar com preços antigos: a conferência continua obrigatória.

## Histórias

### US-015 — Acompanhar total e produtos

Como operador, quero ver o total acima dos produtos, para acompanhar a compra no desktop e no celular.

#### AC-075 — Total sempre visível e carrinho abaixo

- **Dado** uma venda aberta em desktop ou celular
- **Quando** o operador adiciona produtos e rola uma lista longa
- **Então** o total e o botão “Ir para pagamento” permanecem visíveis acima da lista, sem sobrepor seus controles, e todos os itens do carrinho ficam abaixo do resumo.

#### AC-076 — Cobrança recolhida e total atualizado

- **Dado** a tela de nova venda aberta, com ou sem produtos
- **Quando** o operador adiciona, remove ou altera quantidades
- **Então** apenas o total e a ação de pagamento aparecem no resumo de cobrança; o total corresponde à soma dos itens, em reais, inclusive R$ 0,00 no carrinho vazio; desconto, pagamentos e observações permanecem ocultos.

#### AC-077 — Total informado antes da conferência

- **Dado** um carrinho alterado e ainda sem conferência válida
- **Quando** o operador observa o total
- **Então** vê o valor identificado como estimado até a conferência no servidor, sem indicação de venda concluída.

### US-016 — Cobrar em popup separado

Como operador, quero realizar a cobrança em popup, para manter a tela principal concentrada nos produtos.

#### AC-078 — Abrir cobrança completa

- **Dado** um carrinho com produtos e sem processamento pendente
- **Quando** o operador aciona “Ir para pagamento”
- **Então** abre um único popup com subtotal, desconto, total, conferência no servidor, formas de pagamento, valor recebido, troco, observações e fechamento; nenhuma venda é enviada pela simples abertura.

#### AC-079 — Impedir pagamento de carrinho vazio

- **Dado** um carrinho vazio
- **Quando** o operador tenta iniciar o pagamento
- **Então** a cobrança não pode ser iniciada e a tela orienta a adicionar produtos.

#### AC-080 — Sair do pagamento limpa somente a cobrança

- **Dado** um popup de pagamento aberto com desconto, pagamentos ou observações preenchidos e sem pedido enviado pendente
- **Quando** o operador sai por Fechar, Voltar ou Escape
- **Então** o popup fecha e descarta desconto, pagamentos, observações e conferência anterior; produtos e quantidades permanecem; o resumo retorna à soma sem desconto e reabrir inicia uma cobrança limpa.

#### AC-081 — Conferir antes de fechar

- **Dado** um popup aberto ou reaberto após alteração no carrinho
- **Quando** o operador tenta concluir a compra
- **Então** o fechamento exige conferência válida no servidor e distribuição válida dos pagamentos; abertura ou reabertura não reutiliza uma autorização de fechamento anterior.

#### AC-082 — Suspender leituras com popup aberto

- **Dado** o popup de pagamento ou o aviso de saída aberto
- **Quando** o leitor envia um código
- **Então** nenhum produto é adicionado ou enfileirado e nenhum campo de cobrança é preenchido pela leitura; respostas de leituras canceladas não alteram o carrinho; após fechar o popup, uma nova leitura completa volta a funcionar.

#### AC-083 — Preservar pedido enviado sem confirmação

- **Dado** um fechamento em processamento ou cujo resultado ainda é desconhecido
- **Quando** o operador tenta sair, recarrega ou tenta concluir novamente
- **Então** o sistema não descarta o pedido enviado nem permite iniciar outro fechamento que o duplique; mantém a recuperação existente com a mesma chave e permite resolver o resultado; a limpeza de cobrança só se aplica a rascunhos sem pedido enviado pendente.

#### AC-084 — Concluir e preparar próxima venda

- **Dado** uma cobrança válida
- **Quando** o servidor confirma a venda
- **Então** a interface informa a confirmação e disponibiliza o comprovante; carrinho, cobrança e qualquer rascunho recuperável são limpos, e retornar à tela não restaura produtos da venda concluída.

### US-017 — Navegar sem perder os produtos

Como operador, quero visitar outras páginas do sistema com aviso, para retornar aos produtos da compra em andamento.

#### AC-085 — Cancelar navegação mantém a venda

- **Dado** um carrinho com produtos e sem pedido enviado pendente
- **Quando** o operador aciona um link para outra página do sistema e cancela o aviso de saída
- **Então** continua na tela atual, sem perder produtos nem alterar uma cobrança que ainda não foi abandonada.

#### AC-086 — Recuperar produtos por navegação interna ou histórico

- **Dado** um carrinho com produtos e sem pedido enviado pendente
- **Quando** o operador confirma o aviso de um link interno e retorna à nova venda, ou usa os controles Voltar/Avançar para sair e retornar pelo histórico
- **Então** recupera os mesmos produtos e quantidades, sem duplicar itens; desconto, pagamentos, observações e conferência não são recuperados; o aviso dos links internos explica que produtos serão mantidos e dados de cobrança descartados; os controles do navegador não exigem aviso garantido, mas preservam os produtos ao retornar pelo histórico.

#### AC-087 — Recarregar limpa rascunho

- **Dado** um carrinho em edição sem pedido enviado pendente, inclusive recuperado após navegação
- **Quando** o operador recarrega a página de nova venda
- **Então** a página inicia com carrinho vazio e sem desconto, pagamentos, observações ou conferência anterior; uma navegação posterior não ressuscita o rascunho descartado.

#### AC-088 — Separar operadores e abas

- **Dado** um rascunho criado por um operador em uma aba
- **Quando** há saída da conta, troca de operador ou abertura de uma aba independente
- **Então** o rascunho não aparece para outro operador nem mistura carrinhos entre abas; a recuperação por navegação fica restrita à aba e à conta de origem.

### US-018 — Operar com o design system Garden

Como operador, quero uma interface consistente e acessível, para cobrar com teclado ou toque.

#### AC-089 — Diálogo acessível no desktop e no celular

- **Dado** a tela renderizada em 360, 768 e 1440 px
- **Quando** o operador abre, percorre e fecha o popup usando teclado ou toque
- **Então** encontra título e descrição associados ao diálogo nativo, foco inicial no fechamento, foco contido durante abertura, Escape conforme as regras de pedido pendente e retorno ao acionador ao fechar; o conteúdo longo rola dentro do popup sem ocultar permanentemente ações e sem rolagem horizontal da página.

#### AC-090 — Aplicar linguagem visual Garden

- **Dado** o resumo, carrinho, popup e aviso de saída disponíveis
- **Quando** o operador usa a tela, inclusive com zoom e textos longos
- **Então** encontra tokens e componentes operacionais Garden, controles de pelo menos 44 px, foco visível, valores em pt-BR com dígitos tabulares e mensagens compreensíveis sem depender apenas de cor; contrastes seguem 4,5:1 para texto comum e 3:1 para limites e foco.

## Fora de escopo

- Implementar a câmera mobile, alterar cadastro ou identificação de produtos.
- Compartilhar carrinhos entre operadores, abas, dispositivos ou sessões de login.
- Salvar rascunho para sobreviver à recarga da página de venda.
- Alterar regras de pagamentos divididos, integrações bancárias, estoque, descontos autorizados ou comprovantes.

## Suposições

Nenhuma suposição de produto adicional adotada. A estratégia técnica de recuperação seletiva será definida no projeto, preservando os comportamentos acima.

## Perguntas em aberto

Nenhuma decisão de produto pendente. Em 24/10/2026 o usuário confirmou aviso obrigatório nos links internos, sem garantia nos controles do navegador, fechamento de aba ou saída do site, mantendo recuperação pelo histórico. O projeto técnico deverá demonstrar a distinção entre navegação e recarga nos navegadores atendidos, incluindo histórico e restauração de página.

## Definição de pronto e validação

Cada critério exige teste comportamental anotado com seu código de aceite. Validar no navegador real a rolagem, o foco e o ciclo link → outra página → retorno; comparar com recarga normal e forçada. Cobrir popup, leitor, cobrança inválida, falha de rede e recuperação do mesmo pedido enviado. Executar regressões de pagamentos e leitor, `npm test`, `npm run check`, verificação da feature e auditoria global sem enfraquecer gates. Não declarar esta feature implementada com base apenas na documentação.

Validação executada: 16/16 critérios desta feature PASS; auditoria global exit 0 com 79/79 critérios provados e nenhum aviso. Consulte [validacao.md](validacao.md) para testes, ensaios no Chrome e limites da evidência.

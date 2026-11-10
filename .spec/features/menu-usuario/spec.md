# Spec: Menu do usuário

> feature: menu-usuario
> status: em-implementacao

## Contexto

Reunir nome do usuário, Minha conta e Sair em um menu no canto superior direito, à direita do logo. Escopo refinado via grill-with-docs e confirmado pelo pedido de criação da Spec em 09/11/2026. Apenas documentação nesta etapa.

## Histórias

### US-022 — Acessar as opções do usuário

Como usuário conectado, quero encontrar minha identificação, Minha conta e Sair em um menu compacto, para acessar essas opções pelo cabeçalho.

#### AC-108 — Menu nas telas autenticadas

- **Dado** um usuário conectado, administrador ou operador
- **Quando** acessa PDV, Produtos, Vendas, Minha conta ou Comprovante conforme suas permissões
- **Então** encontra o botão do menu no canto superior direito, à direita do logo, substituindo nome e ações avulsos

#### AC-109 — Estado inicial compacto

- **Dado** uma tela autenticada em desktop ou celular
- **Quando** o cabeçalho é exibido
- **Então** o menu está fechado e somente o ícone de pessoa aparece no botão

#### AC-110 — Abrir as opções

- **Dado** o menu fechado
- **Quando** o usuário clica ou toca no ícone de pessoa
- **Então** abre um pequeno pop-up abaixo do botão, alinhado à direita, com nome do usuário conectado, Minha conta e Sair nessa ordem vertical; o nome é identificação e as duas opções são acionáveis

#### AC-111 — Abrir Minha conta

- **Dado** o menu aberto
- **Quando** o usuário seleciona Minha conta
- **Então** o menu fecha e aciona o acesso existente à tela de conta, mantendo as permissões atuais

#### AC-112 — Sair

- **Dado** o menu aberto
- **Quando** o usuário seleciona Sair
- **Então** o menu fecha e aciona o fluxo de saída existente, preservando suas confirmações, proteções de operação pendente e tratamento de falhas

#### AC-113 — Fechar ao clicar fora

- **Dado** o menu aberto
- **Quando** o usuário clica ou toca fora do botão e da lista
- **Então** o menu fecha sem navegar ou encerrar a sessão

#### AC-114 — Fechar com Esc

- **Dado** o menu aberto
- **Quando** o usuário pressiona Esc
- **Então** o menu fecha sem navegar ou encerrar a sessão

#### AC-115 — Layout no celular

- **Dado** uma tela autenticada em largura de celular
- **Quando** o usuário abre o menu
- **Então** o botão permanece no topo à direita do logo e a lista cabe na largura visível, com nome e opções legíveis e acionáveis

## Restrições

- Preservar autenticação, autorização, destino atual de Minha conta e comportamento de Sair.
- Usar os textos Minha conta e Sair e o nome da sessão autenticada como texto seguro.
- Respeitar identidade visual e acessibilidade existentes: botão com nome acessível, estado expandido informado e opções alcançáveis pelo teclado.
- Não apresentar o menu na tela de login.
- No comprovante, integrar o menu aos controles de tela, sem incluí-lo no conteúdo impresso.
- Não alterar regras de vendas, pagamentos, leitura de códigos ou dados persistidos.

## Casos de exceção

- Nomes longos devem permanecer legíveis sem causar transbordamento horizontal da página.
- Cancelamento ou falha de saída mantém o comportamento existente; abrir e fechar o menu não encerra a sessão.
- O menu também deve funcionar na própria tela Minha conta e no comprovante, adaptando seus cabeçalhos se necessário.

## Fora de escopo

- Novas configurações, edição de perfil e reformulação da tela Minha conta.
- Mudanças de backend, banco e permissões.
- Implementação nesta etapa.

## Suposições

Nenhuma pendente de produto. As orientações de acessibilidade, texto seguro e impressão preservam as responsabilidades existentes da interface.

## Perguntas em aberto

Nenhuma para o comportamento aprovado.

## Validação planejada e definição de pronto

Na implementação, criar testes de comportamento anotados com @spec:AC correspondente para cada critério. Cobrir administrador e operador, desktop e celular, clique externo, Esc, acesso à conta e saída com suas proteções. Conferir visualmente alinhamento, nome longo, ausência de transbordamento e impressão do comprovante. A implementação só será concluída com verify e audit --ci aprovados; esta entrega não declara comportamentos implementados.

## Registro de implementação — 09/11/2026

Menu implementado em api.js e ui.css, com integração no comprovante via receipt.js. Os oito testes em test/menu-usuario.spec.test.js passam quando executados diretamente, e npm run check passa. O teste de largura verifica regras CSS; não substitui inspeção visual em navegador. A suíte global encontrou EPERM ao executar Python no teste de homologação e não forneceu prova completa. Chrome headless também não iniciou neste ambiente. A tarefa permanece em andamento até validação visual e verify/audit aprovados.

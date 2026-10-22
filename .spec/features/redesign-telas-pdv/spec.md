# Spec: Redesenho das telas do PDV Garden

> feature: redesign-telas-pdv
> status: em-implementacao

## Contexto

Aplicar o design system e o logo já existentes às seis telas do PDV. Plano aprovado em 21/10/2026, com execução sequencial nesta sessão e sua configuração atual. A base de dados, APIs e regras financeiras permanecem existentes.

## Histórias

### US-008 — Acessar o sistema

Como operador, quero entrar e navegar com a identidade oficial da loja, para atender com consistência e segurança.

#### AC-067 — Acesso e navegação consistentes

- **Dado** um operador na tela de login ou em uma tela operacional
- **Quando** visualiza e percorre a interface
- **Então** encontra a marca oficial sem distorção, campos de acesso identificados, título correto e indicação da página atual nas telas operacionais

### US-009 — Registrar vendas

Como operador, quero encontrar produtos e acompanhar o carrinho com clareza, para atender com consistência e segurança.

#### AC-068 — Caixa responsivo sem perda de venda

- **Dado** uma venda com itens no desktop ou celular
- **Quando** busca, adiciona produtos e alterna a largura
- **Então** mantém catálogo e resumo em duas colunas no desktop, catálogo sob demanda e pagamento expansível no mobile, preservando quantidades e valores

#### AC-069 — Conclusão e falhas preservam o pedido

- **Dado** uma venda conferida pelo servidor
- **Quando** confirma pagamentos ou recebe uma falha
- **Então** mantém validações, pedido pendente e nova tentativa existentes; só informa confirmação após sucesso

### US-010 — Gerenciar produtos

Como administrador, quero cadastrar e consultar produtos em seções claras, para atender com consistência e segurança.

#### AC-070 — Cadastro, consulta e planilha preservados

- **Dado** produtos cadastrados e uma planilha de importação
- **Quando** pesquisa, edita, valida e confirma a importação
- **Então** mantém formulário, estados, paginação e validação prévia; cadastro e planilhas têm seções próprias e são utilizáveis no celular

### US-011 — Consultar vendas

Como operador autorizado, quero consultar e administrar registros com segurança, para atender com consistência e segurança.

#### AC-071 — Consulta e edição acessíveis

- **Dado** vendas e uma conta com as permissões necessárias
- **Quando** filtra, expande e abre uma edição
- **Então** visualiza totais e ações existentes; a edição abre em diálogo com foco contido, fecha por Escape ou Fechar e devolve foco ao acionador

### US-012 — Administrar a loja

Como usuário autorizado, quero gerenciar minha conta e as rotinas permitidas, para atender com consistência e segurança.

#### AC-072 — Conta, usuários e backup organizados

- **Dado** uma sessão de operador ou administrador
- **Quando** acessa administração e os diálogos compartilhados
- **Então** encontra seções e controles legíveis, mantém restrições por papel, autenticação e confirmação com nomes acessíveis

### US-013 — Conferir comprovantes

Como operador, quero visualizar e imprimir comprovantes legíveis, para atender com consistência e segurança.

#### AC-073 — Comprovante em tela e em papel térmico

- **Dado** uma venda concluída, alterada ou cancelada
- **Quando** abre o comprovante e solicita impressão
- **Então** vê valores e estado textual preservados; a impressão usa papel de 80 mm sem cabeçalho de navegação ou dependência de cores e imagens

### US-014 — Usar componentes locais acessíveis

Como operador, quero operar por toque ou teclado sem depender da internet, para atender com consistência e segurança.

#### AC-074 — Componentes e recursos distribuídos

- **Dado** telas em 360, 768 e 1440 pixels e servidor local sem WAN
- **Quando** navega com teclado e visualiza textos longos, estados e pagamentos múltiplos
- **Então** não encontra rolagem horizontal da página; tem foco visível, alvos de 44 pixels, contraste de texto comum de 4,5:1 e recursos estáticos locais disponíveis

## Fora de escopo

- Câmera mobile, novas regras financeiras, banco, permissões novas, merge e publicação.

## Suposições

Nenhuma de produto em aberto. Tema claro, logo fornecido, desktop e celular e inclusão do comprovante confirmados no plano aprovado. Fontes do sistema e breakpoint do caixa em 920 px seguem a base existente.

## Perguntas em aberto

Nenhuma. Abrangência e execução sequencial confirmadas pelo usuário.

## Compatibilidade

Esta feature permite substituir a aparência antiga do desktop descrita em AC-035; preserva a disposição funcional em duas colunas. Mantém busca, leitor físico, pagamento dividido, conferência no servidor, recuperação de pedido e impressão. Não declara implementação da feature de câmera.

## Definição de pronto

Critérios com testes anotados e prova de verify; revisão visual responsiva; audit --ci sem erros. Bloqueios globais preexistentes são reportados e não autorizam encerrar a feature.

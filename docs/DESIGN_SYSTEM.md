# Garden — Design system v1

Base visual do PDV Entre Folhas e Flores, para desktop e celular. Abra `/design-system.html` no servidor do PDV para consultar o catálogo. Os exemplos usam dados fictícios e não acessam APIs nem registram vendas.

## Marca e princípios

O arquivo `garden-logo.jpg` é a arte oficial fornecida pelo usuário, copiada do JPG de maior definição (823 × 145). O PNG alternativo tem menor resolução, margens e borda azul. A arte original não foi redesenhada, recortada ou recolorida. Preservar proporção, fundo branco e respiro mínimo de 8 px; não usar filtros nem esticar. Usar texto alternativo “Entre Folhas e Flores — Garden Center”. Não extrair o trevo como símbolo independente sem aprovação de uma variante oficial.

A marca substitui a identificação com emoji em login, caixa, produtos, vendas e administração. O comprovante usa o logo somente na barra de ferramentas em tela e mantém a marca textual na impressão térmica. O logo deve reduzir junto com o cabeçalho, sem ultrapassar o contêiner. Não ampliar além da resolução original.

Clareza no balcão: produto, quantidade e total em evidência, uma ação principal por etapa. Linguagem direta e feedback após a confirmação efetiva da operação. O verde funcional é mais escuro que o verde da arte para permitir texto legível; os tokens de marca são referências aproximadas, não extração colorimétrica. Vermelho decorativo fica restrito à arte; erros sempre têm texto e contexto.

## Fundamentos e contrato CSS

`design-tokens.css` define os tokens `--ds-*`, compartilhados pelo catálogo e pelas telas. `design-system.css` define a apresentação e as classes `.ds-*` exclusivas do catálogo. `ui.css` concentra os componentes operacionais; as telas não mantêm cópias inline dos estilos. Carregar tokens antes da folha específica.

| Categoria | Tokens e valores |
| --- | --- |
| Superfícies | `--ds-bg: #f5f7f2`, `--ds-surface: #fff`, `--ds-subtle: #edf3ec` |
| Ação | `--ds-primary: #2f6b45`, `--ds-primary-hover: #245538` |
| Texto | `--ds-text: #1f2a23`, `--ds-muted: #526158` |
| Limites | `--ds-border: #c4cfc5` decorativo; `--ds-control-border: #758779` para controles |
| Semântica | sucesso `#245538`, erro `#a62424`, atenção `#775000`, informação/foco `#245b80` |
| Marca | `--ds-brand-red: #d51620`, `--ds-brand-green: #279b24`; não usar como texto funcional sobre branco |
| Tipografia | fonte do sistema; auxiliar 14, corpo 16, subtítulo 20, título 28, destaque 32–48 px |
| Espaçamento | `--ds-space-1` a `--ds-space-7`: 4, 8, 12, 16, 24, 32, 48 px |
| Bordas | `--ds-radius-sm/md/lg`: 6, 12, 20 px |
| Elevação e tempo | `--ds-shadow: 0 8px 24px #1f2a230c`; `--ds-duration: 140ms` |

Tema claro, sem fontes, bibliotecas ou serviços externos. Respeitar preferência por movimento reduzido. Desktop usa duas colunas quando útil; até 920 px a navegação do catálogo entra no fluxo; até 600 px as composições ficam em uma coluna. Tabelas têm rolagem própria e região focalizável.

## Componentes e comportamento

- **Ações:** `.ds-button`, variantes `-secondary` e `-danger`. Controles com altura e largura mínimas de 44 px. Usar botão para ação, link para navegação. Durante processamento, texto explícito, `disabled` e `aria-busy`; não anunciar sucesso antes da confirmação.
- **Formulários:** `.ds-field`, `.ds-input`, `.ds-help` e `.ds-error`. Rótulos associados por `for`/`id`; obrigatório indicado em texto e atributo; erro com `aria-invalid` e `aria-describedby`. Placeholder não substitui rótulo. Preservar o valor após falha.
- **Seleção:** checkbox para escolhas independentes; rádio com `fieldset` e `legend` para escolha exclusiva. Nome acessível e rótulo clicável de 44 px.
- **Feedback:** `.ds-alert` e variantes `-success`, `-warning`, `-danger`; texto identifica o estado. Atualizações dinâmicas usam `role="status"`; falhas urgentes podem usar `role="alert"`. Exemplos estáticos não precisam de live region.
- **Dados:** `.ds-card`, `.ds-badge`, `.ds-list`, `.ds-table`, `.ds-money`. Código é texto, preservando zeros. Moeda em pt-BR, dígitos tabulares, coluna à direita. Não converter regras de arredondamento de negócio em estilos.
- **Estados vazios:** explicar o ocorrido e indicar próximo passo pertinente. Paginação com botões indisponíveis nos limites. Nenhuma ação visual pode aparentar concluir uma operação real no catálogo.
- **Diálogo:** elemento `dialog`, título/descrição associados, foco inicial no fechamento, Escape e retorno ao acionador pelo comportamento nativo. Confirmações destrutivas na aplicação devem explicar a consequência e oferecer cancelamento.

O JavaScript do catálogo apenas abre um diálogo, exibe um aviso e valida nome obrigatório. Não contém persistência, consultas, código de venda ou integração com câmera. Busca, carrinho e pagamentos são composições estáticas identificadas como exemplos. Pagamento demonstrativo: total R$ 24,00; Pix R$ 14,00; dinheiro aplicado R$ 10,00; recebido R$ 20,00; troco R$ 10,00.

## Acessibilidade e validação

Meta de contraste: 4,5:1 para texto comum, 3:1 para limites de controles e foco. Exceções normativas para logotipo e componentes desabilitados; não usar essas exceções em texto informativo. Não depender só de cor. Permitir zoom, quebra de textos longos e navegação por teclado.

Conferir em 360, 768 e 1440 px, sem rolagem horizontal da página. Verificar foco, abertura/fechamento do diálogo, formulário vazio/válido, estados e formatação monetária. Conferir `/design-system.html`, `/design-system.css`, `/design-system.js` e `/garden-logo.jpg` no backend e na imagem de distribuição. Executar `npm test`, `npm run check` e `node --check design-system.js`.

A migração visual das telas está registrada em `.spec/features/redesign-telas-pdv/`. As interfaces de negócio, banco e regras financeiras são preservadas. Sem publicação automática. O catálogo é público como os demais arquivos estáticos e contém somente dados fictícios.

### Verificação realizada — 21/10/2026

Catálogo inspecionado no Chrome em 360, 768 e 1440 px, sem overflow horizontal da página; logo carregado na resolução original. Diálogo e validação de nome vazio/válido verificados no navegador. Contraste calculado para pares principais de texto, avisos e borda de controle. `npm run check`, `node --check design-system.js`, `npm test` e `git diff --check` passaram. A suíte completa precisou de execução fora do sandbox para permitir os servidores locais dos testes.

Referências locais, existência de arquivos, lista `SAFE_FILES` e regra de cópia Docker conferidas. Não houve build Docker nem teste HTTP do FastAPI: o Python disponível não tem as dependências do backend instaladas. A prévia foi verificada com servidor estático local, sem uso de dados operacionais.

### Migração das telas — 21/10/2026

As telas usam `design-tokens.css` e `ui.css`, com estilos duplicados removidos. O catálogo mantém sua folha específica. Login e navegação corrigidos; caixa com duas colunas no desktop e fluxo mobile preservado; produtos separados em cadastro, planilha e lista; vendas com edição em diálogo nativo; administração por seções. O comprovante tem apresentação própria em tela e regras térmicas isoladas em `@media print`.

Testes anotados AC-067 a AC-074 executam os fluxos e verificam recursos, contraste e impressão. O teste de incremento do leitor agora conta linhas do carrinho em vez das ocorrências do nome, pois o nome também aparece nos rótulos acessíveis dos botões. Nenhuma asserção de quantidade ou unicidade foi removida. Consulte `.spec/features/redesign-telas-pdv/validacao.md` para provas e bloqueios do gate global.

A regra de página usa tamanho CSS válido de 80 × 297 mm e margens de 4 mm. A altura é paginável; o driver da impressora define o avanço e corte da bobina. O antigo `size: 80mm auto` não é uma combinação válida para o descritor CSS de tamanho de página. Validar corte/avanço no piloto da impressora.

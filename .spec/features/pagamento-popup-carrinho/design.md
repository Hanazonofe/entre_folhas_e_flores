# Projeto técnico — Cobrança em popup e carrinho abaixo do total

> feature: pagamento-popup-carrinho
> etapa: implementação sequencial autorizada em 24/10/2026
> referência: [spec.md](spec.md), decisões confirmadas em 24/10/2026

## Estrutura da tela e referência Garden

Referência obrigatória: [Garden](../../../docs/DESIGN_SYSTEM.md) e `/design-system.html`. Reutilizar `design-tokens.css`, `ui.css` e o editor `PaymentEditor`, sem alterar as regras compartilhadas com a edição administrativa.

Na tela principal, a coluna da venda contém, nesta ordem: resumo compacto com “Total estimado” e “Ir para pagamento”; região de avisos; lista completa dos itens. No desktop, manter busca/catálogo na outra coluna. No celular, usar uma coluna e posicionar o resumo antes da busca e dos itens, preservando sua precedência visual sobre o carrinho. A lista fica no fluxo, sem altura fixa e sem uma segunda rolagem interna.

O resumo usa `position: sticky; top: 0`, superfície opaca e camada acima do catálogo, dentro de um contêiner que acompanha toda a altura da venda. Nenhum ancestral pode limitar sua aderência com `overflow`. No desktop, a coluna precisa se estender à altura da região de venda; no celular, o resumo deve ser filho da região que inclui busca e carrinho. Não usar um card curto como limite do sticky. Reservar espaço normal no fluxo; foco e âncoras devem considerar a altura do resumo. Validar 360, 768 e 1440 px, zoom, textos longos e teclado virtual. O cabeçalho geral continua no fluxo.

Cobrança sai do card e passa para `dialog#paymentDialog`, fora da região sticky. Nome e descrição associados por `aria-labelledby` e `aria-describedby`; botão Fechar recebe foco inicial. Corpo rolável com limite baseado em `100dvh`, margens e respiro Garden. Controles de pelo menos 44 px, moeda em pt-BR com dígitos tabulares e uma ação principal por etapa. Não copiar classes `.ds-*` exclusivas do catálogo.

Mover os controles existentes, preservando os IDs do desconto, conferência, editor, observações e fechamento. Não duplicar IDs do total: usar um valor de resumo e um valor próprio do diálogo, derivados do mesmo cálculo. Remover `paymentExpanded` e a lógica de expandir cobrança por breakpoint. O mesmo diálogo atende todos os tamanhos.

## Estados e transições

| Estado | Ações permitidas | Saída |
|---|---|---|
| Carrinho em edição | Buscar, ler produtos, alterar itens e iniciar cobrança | Abrir cobrança ou confirmar navegação |
| Cobrança sem conferência | Editar desconto, conferir e sair | Conferência válida ou limpeza da cobrança |
| Cobrança conferida | Distribuir pagamentos, editar observações e enviar | Mudança financeira invalida conferência conforme regras existentes |
| Conferência em processamento | Aguardar; impedir envio e saída que invalide a resposta | Erro preserva campos; sucesso habilita etapa seguinte |
| Fechamento enviado | Aguardar resultado; impedir novo pedido e descarte | Confirmação, rejeição definitiva ou resultado desconhecido |
| Resultado desconhecido | Repetir o mesmo pedido protegido | Mesmo resultado/idempotência; nunca gerar outra chave |

`pending` e seu armazenamento atual têm prioridade sobre qualquer rascunho. A abertura do popup não envia venda nem realiza conferência implícita. Carrinho vazio deixa a ação indisponível com orientação visível; o handler também valida essa condição.

Ao sair da cobrança sem pedido enviado: limpar desconto, observações, quote e mensagens da etapa; esvaziar pagamentos e reinicializar o editor para não conservar `totalCents` da compra anterior. Pode-se reinstanciar `PaymentEditor` na abertura, após remover o conteúdo anterior. Não modificar sua API compartilhada somente para este fluxo. O resumo externo volta à soma dos produtos, sem desconto. Preços atualizados pela conferência podem permanecer nos itens; a próxima cobrança exige nova conferência.

Escape e Fechar passam pelo mesmo guardião. Durante requisições financeiras em andamento, bloquear fechamento com mensagem explícita; não deixar uma resposta tardia reabilitar uma cobrança abandonada. Depois de erro de conferência, permitir sair e limpar. Erros de validação preservam campos enquanto o operador permanecer no popup.

Com resultado desconhecido, manter diálogo/ação de recuperação, chave, usuário e corpo original do pedido. Na inicialização, restaurar primeiro `pdv-pending-checkout` e abrir recuperação; nunca aplicar sobre ele o rascunho. Recarga não altera essa regra. Após confirmação, limpar ambos os estados, invalidar restauração por histórico e disponibilizar comprovante na tela principal.

## Leitor e isolamento dos campos

Abrir pagamento ou confirmação de saída chama explicitamente `cancelPendingScans()` antes de `showModal()`, sem depender apenas do MutationObserver. Incrementar geração cancela respostas tardias. Ao fechar, cancelar buffer e snapshot antes de retomar captura.

O `dialogOpen()` existente impede consulta/adição, mas sozinho não impede que caracteres cheguem a um input do popup. O listener de captura deve usar uma instância isolada do classificador temporal e snapshot do campo para descartar a sequência reconhecida como leitor e restaurar conteúdo/seleção. Essa instância nunca chama `enqueueScan`. Digitação manual continua editando normalmente. Impedir também Enter de sufixo de acionar conferência ou fechamento. Testar códigos numéricos e alfanuméricos, campos monetários e observações. Não prometer distinção absoluta da origem física: continua sendo a heurística temporal existente.

O leitor da câmera permanece fora desta entrega. O futuro projeto mobile deve respeitar o mesmo guardião de diálogo e cancelamento.

## Decisão de arquitetura: rascunho de navegação separado do pedido enviado

Adotar um módulo local `sale-navigation.js`, carregado nas páginas autenticadas, para coordenar navegação da mesma aba. Não usar banco nem `localStorage`. `sessionStorage` serve somente como transporte temporário de rascunho entre documentos da mesma aba; não é autorização para restaurar indiscriminadamente.

Contrato proposto para `pdv-cart-navigation-v1`: versão, usuário, identificador do contexto e itens com id, código textual, nome, preço estimado em centavos e quantidade. Não guardar desconto, pagamentos, observações, quote, CSRF ou credenciais. Validar formato, limites e números inteiros seguros antes de montar o Map; renderizar texto com escape. A conferência no servidor decide preço/atividade/permissão; dados locais não autorizam fechar venda.

O módulo usa uma lease exclusiva de Web Locks por identidade aleatória gravada no `sessionStorage`. Todas as páginas autenticadas adquirem a lease, liberam em `pagehide` (permitindo transferência para o próximo documento e BFCache) e readquirem em `pageshow`. Um documento copiado enquanto a aba original está ativa recebe outra identidade e descarta a cópia do snapshot. A aquisição usa `ifAvailable`: nunca espera uma aba diferente fechar. A revisão do armazenamento é relida ao retornar do BFCache, substituindo o Map e limpando cobrança. A conta é validada antes de restaurar. Sem Web Locks ou armazenamento acessível, a recuperação falha explicitamente; navegação confirmada não promete conservação sem snapshot escrito.

A identidade pertence à sequência ativa de documentos autenticados da aba, não a uma propriedade global de usuário. `sessionStorage` transporta apenas produtos; o pedido enviado permanece no contrato existente. A primitiva existe no Chrome disponível no ambiente. O ensaio headless inicial foi impedido pelo sandbox (`setsockopt: Operation not permitted`); a validação nativa foi realizada no Chrome via CUA e está registrada em `validacao.md`, sem confundir mock com prova de navegador. Não há dependência nova nem serviço externo.

### Ciclo de navegação

0. Sincronizar o snapshot dos produtos a cada alteração efetiva do carrinho, vinculado ao contexto com lease exclusiva, para permitir retorno mesmo quando a saída não passar por um link interceptado. Não gravar cobrança. Recarga explícita invalida esse snapshot; pedido enviado permanece separado. Não depender de gravação em `beforeunload`.
1. Capturar apenas links internos da navegação na mesma aba, sem modificadores ou `target` externo. Com itens e sem pending, impedir a saída e abrir aviso Garden: “Os produtos serão mantidos ao voltar. Desconto, pagamentos e observações serão descartados. Deseja sair?”. Cancelar não altera o estado atual.
2. Confirmar limpa cobrança e scans, confirma a gravação do snapshot, então navega. Falha de gravação impede saída e informa que não foi possível preservar o carrinho; não prometer conservação sem escrita confirmada.
3. Páginas intermediárias validam conta/contexto e mantêm a lease somente em navegação da mesma aba. Visitar várias páginas não perde o snapshot. Links para nova aba não transferem autorização de restauração.
4. Ao retornar por link, restaurar somente com lease exclusiva, identidade e conta iguais. Reconstruir o Map substituindo seu conteúdo, nunca somando a um carrinho já restaurado. Marcar conferência inválida.
5. Ao carregar nova venda com `PerformanceNavigationTiming.type === 'reload'`, apagar rascunho antes de montar o carrinho; preservar pending. Depois de recarga, visitas posteriores não podem recuperar revisões antigas.
6. Em `pageshow`, inclusive `persisted`, reconciliar conta e snapshot atual; ausência do snapshot invalida o Map antigo de venda concluída/rascunho descartado. BFCache pode restaurar DOM e memória antigos: não confiar somente no bootstrap. Nunca duplicar callbacks ou itens.
7. Logout confirmado e mudança de conta removem autorização e rascunho; autenticação de outro usuário nunca recebe produtos anteriores. A lógica especial de pending em `API.header()` continua preservando seu pedido original.

Decisão confirmada em 24/10/2026: aviso obrigatório somente nos links internos controlados pela aplicação na mesma aba. Voltar/Avançar, fechar a aba e sair do site não exigem aviso garantido; não instalar armadilhas de histórico. Sair e retornar por Voltar/Avançar deve recuperar produtos e quantidades e descartar cobrança. Fechar aba ou sair do site não exige recuperação. O ensaio comprova essa recuperação com e sem BFCache; não há decisão de produto pendente sobre o aviso. Não usar `beforeunload` para gravar rascunhos nem como única prova de aviso.

## Arquivos e integração

| Arquivo | Responsabilidade |
|---|---|
| `pdv.html` | Resumo, ordem dos itens e diálogo de cobrança |
| `pdv.js` | Estados, conferência, limpeza, guardiões e integração do leitor |
| `ui.css` | Sticky e popup com tokens Garden, estilos limitados ao PDV |
| `sale-navigation.js` (novo) | Snapshot, identidade/lease, navegação e restauração |
| Páginas autenticadas e `api.js` | Carregar transporte e invalidar rascunho no logout/troca de conta |
| `backend/pdv/app.py`, `package.json` | Servir módulo via SAFE_FILES e incluir no check sintático |
| `deployment/Dockerfile.api` | Conferir inclusão pelo COPY de `*.js`, sem alterar se já coberto |

Adicionar o módulo antes do código consumidor. A chave do pedido enviado e o transporte de navegação não se substituem. Nenhuma migration é necessária. Esta decisão de armazenamento deve permanecer documentada e ser revista se o ensaio mudar a estratégia; não criar ADR separado antes dessa validação.

## Matriz de provas

- AC-075–077: carrinho vazio/longo, adição/remoção, centavos e estimativa em desktop/mobile; geometria real do sticky e zoom.
- AC-078–081: abrir/fechar/reabrir; Escape; campo inválido; conferência tardia; limpeza completa do editor; ausência de envio na abertura.
- AC-082: leituras antes/durante/depois de cada diálogo, numéricas e alfanuméricas, campos focados, sufixo Enter e respostas antigas.
- AC-083–084: offline após envio, recarga, mesma chave, rejeição definitiva, confirmação e retorno pelo histórico sem ressuscitar compra.
- AC-085–088: cancelar/confirmar saída, várias páginas, retorno por links/histórico, BFCache ligado/desligado, recarga normal/forçada, armazenamento indisponível/corrompido, logout, troca de conta, nova aba e duplicação.
- AC-089–090: navegador real em 360/768/1440 px, teclado/toque, foco e leitor de tela, conteúdo longo, contraste e teclado virtual. Mocks não comprovam esses comportamentos nativos.

Testes novos: `tests/pdv-payment-dialog.test.js` e `tests/pdv-navigation.test.js`, com testes anotados por critério. Estender harness para diálogos, navegação e eventos de ciclo de vida; manter regressões de pagamentos e leitor. Registrar ensaio de contexto e evidências visuais em `validacao.md`; executar `npm test`, `npm run check`, verify da feature e audit global, distinguindo falhas preexistentes.

## Resultado técnico e limites

Web Locks e `sessionStorage` foram exercitados no Chrome conectado: link → Produtos → Nova venda preservou produtos; recarga limpou; Voltar/Avançar preservou produtos e limpou cobrança; aba nova e Ctrl+clique com opener iniciaram vazias. O harness determinístico prova também cópia do armazenamento, transferência da lease, `pageshow.persisted`, troca de conta, corrupção/falha de armazenamento, ausência de Web Locks e respostas tardias.

Não há ticket separado nem histórico artificial: a lease e o contexto transportados por todas as páginas autenticadas são a autorização de leitura; `pagehide` encerra scans e invalida quote em voo; `pageshow.persisted` autentica novamente e substitui o Map pelo snapshot atual. Uma venda confirmada apaga o snapshot e o pedido pendente. Uma página antiga com pending em memória reconcilia a existência do pedido em sessionStorage antes de recuperar produtos.

O suporte validado é o Chrome disponível. Sem Web Locks, a interface informa indisponibilidade de recuperação e bloqueia links internos com produtos quando não consegue preservá-los. Não foi comprovado o teclado virtual físico, leitor físico nem tecnologia assistiva; o isolamento do leitor usa a heurística temporal existente e seus testes de relógio controlado. Fechar aba/sair do site não exige recuperação ou aviso. Nenhum serviço externo, schema ou regra financeira foi acrescentado.

# Projeto técnico — leitura automática de código de barras

> feature: leitura-automatica-codigo-barras
> fase: projeto técnico; implementação não iniciada

## Escopo e decisões aprovadas

A Spec é o contrato de comportamento. O usuário autorizou registrar este projeto,
decompor tarefas e revisar a Spec, sem implementar, alterar scaffolds, fazer commit,
push ou deploy. A Constituição permanece intacta.

Decisões finais: uma busca manual; captura global por tempo; consulta somente pelo
código interno exato; códigos lidos com mais de quatro dígitos; captura ativa nos
campos financeiros; efeito visual transitório nesses campos permitido, sem aplicar
valores provisórios; espera antes de conferir/fechar enquanto há leituras pendentes;
cancelamento com aviso quando uma janela abre; aviso específico de produto inativo.

## Estado atual e mudanças propostas

| Tema | Situação atual | Mudança e motivo | Risco / trade-off |
|---|---|---|---|
| Busca | pdv.js: search consulta q por input, até 100 ativos; searchSequence protege contra respostas antigas | Manter busca manual e proteção; classificar antes de pesquisar | Pequeno atraso na digitação manual |
| Enter | Busca adiciona products[0] no keydown | Retirar adição por Enter; tratar sufixo do scanner uma vez | Preservar ações de teclado fora desse contexto |
| Carrinho | add(id) depende de products filtrados, incrementa Map e invalida quote | Centralizar addProduct(product), usado pelo catálogo e scanner | Não duplicar regras de bloqueio |
| Bloqueios | pending ou busy impedem mutações; quote sozinho não bloqueia | Manter regras e conferir estado antes/depois de awaits | Resposta antiga não pode afetar outra venda |
| Janelas | API cria dialog para autenticação e confirmação; pagamentos/desconto são embutidos | Bloquear por dialog[open], cancelar buffer/fila ao abrir | Não confundir foco em pagamento com janela |
| Consulta | q faz icontains em nome, code e barcode, paginado | Filtro code exato no servidor, independente de q/lista | Não usar barcode como fallback |
| Financeiro | input de desconto invalida quote; PaymentEditor trata input/change | Adiar efeitos de edição provisória até classificação | Campos numéricos exigem validação em navegador |
| Testes | Node 18/CommonJS; npm test roda tests/*.test.js; scaffold ESM em test/ | Converter scaffold futuramente para CommonJS e incluir test/*.test.js | Preservar tags e testes existentes |
| Distribuição | HTML carrega scripts clássicos; backend usa SAFE_FILES | Novo script clássico local, incluir em HTML e SAFE_FILES | Referência HTML sozinha daria 404 |

## Componentes e fluxo

1. `barcode-scanner.js`: classificador temporal testável, buffer, identificação única
   de sequências e temporizadores injetáveis. Sem conhecimento de produtos ou DOM.
2. `pdv.js`: adaptador DOM, estado de elegibilidade, consulta, fila FIFO e integração
   com a função comum de adição. Instancia uma única captura por tela.
3. Backend: filtro exato no endpoint de produtos existente.

Fluxo: evento → classificação → leitura identificada → fila FIFO → consulta exata
→ verificar geração e elegibilidade → adicionar / avisar → processar próxima.

Não carregar o scanner nas outras páginas. O Dockerfile.api já copia *.js; incluir
barcode-scanner.js em SAFE_FILES e no check sintático do package.json.

## Captura e edição provisória

Escutar keydown em captura no document e coordenar beforeinput/input/change quando
necessário. Receber tempo do evento, sem inferir rapidez a partir da resposta HTTP.

Na busca e nos campos textuais compatíveis, reter caracteres elegíveis em memória,
guardando valor e seleção. Se manual, aplicar edição na seleção correta e executar
o fluxo normal de input; se scanner, descartar a edição e preservar o conteúdo.

Em campos numéricos, permitir edição nativa provisória, reter o valor anterior e
adiar efeitos financeiros e handlers de domínio. Se scanner, restaurar o valor sem
aplicar o conteúdo provisório; se manual, executar os efeitos da edição uma vez.
`input[type=number]` não suporta as mesmas APIs de seleção de campos textuais.
Não simular edição numérica com setRangeText nem alterar o tipo do campo sem novo
projeto. A aceitação do efeito visual não dispensa provar ausência de efeitos no
modelo financeiro, totais, quote e pagamentos.

Tratar também select de meio de pagamento e textarea: a captura não pode deixar
seleção ou observações alteradas pelo scanner. Adaptadores devem preservar mudanças
manuais; não adotar bloqueio global indiscriminado de eventos. Se necessário,
PaymentEditor receberá um ponto explícito de integração para confirmar/cancelar a
edição; essa possibilidade está mapeada na tarefa de integração.

Atalhos Ctrl/Meta, colagem, composição/IME, teclas de navegação e repetição não são
leitura automática. Shift isolado usado pelo dispositivo não é caractere nem deve
quebrar a sequência. Resolver edição pendente antes de mudanças de foco/seleção,
e nunca restaurar snapshot antigo sobre uma edição manual posterior.

## Heurística proposta, ainda sujeita a validação

| Parâmetro | Inicial | Justificativa |
|---|---:|---|
| Máximo intervalo entre caracteres | 35 ms | Separar rajada rápida de digitação comum |
| Silêncio para encerrar | 80 ms | Encerrar sem Enter com margem para variações |
| Mínimo de dígitos | 5 | Usuário confirmou mais de quatro dígitos |
| Máximo de caracteres | 100 | Limite atual do campo code |
| Proteção de Enter tardio | 150 ms | Evitar sufixo ativar controle após finalização |

Os números temporais são hipóteses de engenharia, não resultados medidos nem
preferências exigidas ao usuário. A captura automática prevista aceita sequências
de dígitos dentro do domínio aprovado, preservadas como string. O cadastro e a
busca manual continuam aceitando seus formatos atuais; não haverá nova migration.

Estados: ocioso → candidato → leitura finalizada ou entrada manual → ocioso;
bloqueio interrompe a sequência e invalida sua aplicação. Um intervalo acima de
35 ms antes do silêncio de encerramento desqualifica a sequência inteira; não
aproveitar seu sufixo como produto. Timer e chegada de evento verificam o instante
atual e a identidade da sequência, para evitar aplicação de callbacks antigos.

Enter pode finalizar candidato já elegível; o timer dessa sequência é cancelado.
A finalização é idempotente por identificador. Enter tardio dentro da proteção é
consumido sem adicionar novamente; nova interação manual encerra a proteção.
Nunca deduplicar por código: duas leituras iguais significam duas unidades.

Duas leituras sem terminador e sem pausa distinguível são indistinguíveis de uma
sequência única. Não cortar por prefixos cadastrados. Um leitor mais lento pode
ser classificado como manual; uma pessoa muito rápida pode parecer scanner.
Relógio controlado prova a lógica, não elimina esses limites físicos.

## Consulta exata e elegibilidade

Acrescentar parâmetro opcional `code` ao GET /api/products, validado com limite de
100 caracteres. Comparar por igualdade em Product.code, mantendo q e active_only
com suas semânticas atuais (filtros combinados por interseção quando fornecidos).

O scanner consulta `/products?code=<encodeURIComponent(codigo)>`, sem q e sem
active_only=true, para distinguir ausência de cadastro de produto inativo.
O campo code já é único. Resposta vazia: “Produto não encontrado”; produto inactive:
“Produto inativo”; produto ativo: adicionar. Mais de um resultado ou código que
não corresponda exatamente: erro de contrato, nunca escolher o primeiro.

Manter autenticação e product_view. Não converter para número, eliminar zeros ou
consultar barcode. Erros de rede/servidor são informados como falha de comunicação.
Estoque zero/negativo não ganha novo bloqueio; manter as regras existentes.

## Fila, estados e cancelamento

Usar fila FIFO com consumidor único. Cada item recebe id de leitura e geração da
venda. Consulta do scanner não define busy: captura permanece ativa enquanto a
rede responde. A função comum addProduct verifica pending/busy novamente.

Enquanto a fila ou consulta estiver pendente, desabilitar quoteSale e finishSale
com indicação de processamento. A guarda precisa existir também nos handlers,
não somente no atributo disabled. Ao terminar, recalcular a habilitação pelas
regras existentes: não habilitar fechamento sem quote válido ou em estado busy.
Candidato ainda em classificação deve ser resolvido/cancelado de forma consistente
antes de uma ação de conferência, impedindo aplicação tardia na venda fechada.

Diálogo aberto cancela buffer, fila e geração em andamento, avisa para reler os
produtos pendentes e preserva o carrinho existente. Verificar dialog[open] em cada
fronteira e observar mudanças DOM para cancelar imediatamente, mesmo se o diálogo
abrir e fechar antes da resposta. Autenticação por API.call pode abrir um diálogo
no meio da consulta: a repetição automática HTTP não autoriza adição cancelada.

Cancelar aplicação de respostas antigas é obrigatório; abortar HTTP é opcional.
API.request hoje controla seu próprio AbortController, portanto não confiar apenas
em um signal passado por fora. Após cada await, validar geração e estado. Falha de
um item não deve paralisar o consumidor; tratar por item e continuar se elegível.

Perda de foco da janela, página oculta, saída da tela ou bloqueio de venda também
invalidam captura/aplicações pendentes para não adicionar fora de contexto. Avisar
quando leituras reconhecidas precisarem ser refeitas. Na reativação, descartar
restos da sequência interrompida e aceitar apenas uma nova sequência completa.

Avisos do scanner não podem desaparecer por uma resposta antiga da busca manual;
separar a região de avisos do scanner ou usar propriedade/versionamento de mensagens.

## Estratégia de testes

Injetar now, setTimeout, clearTimeout e tempos dos eventos. Relógio virtual avança
sem sleep; promessas controladas representam respostas HTTP. Exercitar código real
do classificador e de pdv.js, não reimplementar suas regras no harness.

| Critério | Evidência automatizada planejada |
|---|---|
| AC-001 | Foco fora da busca, cinco ou mais dígitos rápidos, sem Enter; uma adição |
| AC-002 | Repetir código; uma linha com quantidade dois |
| AC-003 | Busca preenchida/seleção; código fora do filtro; busca e catálogo intactos |
| AC-004 | Código ausente; aviso, nenhuma mutação e próxima leitura funciona |
| AC-005 | Diálogo aberto; leitura descartada; fechar não reaplica |
| AC-006 | Igualdade em code, zeros iniciais, prefixos/nomes/barcode não substituem |
| AC-007 | Resposta A retida, leitura B recebida; processar A/B sem perdas |
| AC-008 | Digitação lenta filtra; Enter não adiciona; clique adiciona |
| AC-009 | Entrada manual fora da busca não muda busca/carrinho |
| AC-010 | busy/pending no início e durante consulta; respostas antigas sem efeito |
| AC-011 | Produto inativo; aviso específico e nenhuma adição |
| AC-012 | Valor financeiro anterior restaurado; nenhum efeito provisório; manual funciona |
| AC-013 | Fila pendente bloqueia conferência/fechamento, mas não captura; restauração correta |
| AC-014 | Abrir diálogo cancela fila e consulta; aviso; resposta tardia ignorada |

Testes de fronteira: intervalos 34/35/36 ms, silêncio 79/80 ms, 4/5 dígitos,
limite 100, Enter antes/depois do timer, leitura repetida, falha de rede, IME,
colagem, edição no meio do texto, seleção e troca de foco. Testar uma busca manual
em andamento simultaneamente ao scanner e a propriedade dos avisos.

Backend: PostgreSQL descartável via runner existente; igualdade, ausência,
inatividade, zeros, autenticação e independência de paginação. Sem base operacional.

O scaffold existente em test/ permanece intocado nesta entrega. Na implementação,
converter para CommonJS, manter tags AC-001..010, atualizar enunciados e acrescentar
AC-011..014. Incluir test/*.test.js no npm test e novo script no npm run check.
Não alterar type do package.json para migrar todo o projeto a ESM.

Mocks de DOM não provam seleção, ação padrão, undo ou edição numérica de navegador.
Fazer verificação no navegador e piloto com leitor físico antes de encerrar. Registrar
resultados reais; hardware indisponível mantém essa tarefa pendente.

## Sequência e limites de autorização

Ver tasks.md. Recomenda-se execução sequencial inicialmente; consulta de backend e
classificador têm potencial de desenvolvimento independente após o harness, mas
integração compartilha contratos e arquivos. Não há paralelismo, modelo ou esforço
autorizado para execução nesta etapa. Definir isso no plano de execução posterior.

Nenhuma alteração estrutural de banco ou ADR separado é necessária: as decisões
ficam rastreadas aqui e na Spec, sem introduzir dependência externa de runtime.

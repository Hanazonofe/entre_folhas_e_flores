# Conferência no navegador

O roteiro atual da aplicação centralizada está em [docs/TESTING.md](../docs/TESTING.md).
A versão anterior deste arquivo no PR #2 descreve a aplicação localStorage.
Não executar rotinas antigas de restauração JSON contra a nova instalação.

## Ajuste dos meios de pagamento (AC-015 a AC-031)

Execute este roteiro em uma instalação de teste, com uma venda de R$ 100,00,
registrando data/hora, responsável, navegador/versão, viewport e evidência
(captura de tela ou gravação) para cada fluxo. Não use uma instalação
operacional ou uma venda real.

### PDV

- Adicione um segundo meio: ele deve iniciar em R$ 0,00, o primeiro deve
  permanecer em R$ 100,00 e a conclusão deve ficar bloqueada até a correção.
- Informe R$ 30,00 no segundo meio e confirme que o primeiro passa a
  R$ 70,00. Com três meios, altere o segundo e confirme que o primeiro usa a
  soma de todos os demais, sem alterar o terceiro.
- Edite o primeiro manualmente e use **Recalcular** com falta, excesso e soma
  exata. Confirme as mensagens `Faltam`, `Excedem` e `Valores conferem`, sem
  alteração dos valores digitados.
- Informe valor individual maior que o total e faça os demais meios excederem
  o total. Confirme a mensagem de erro, bloqueio de conclusão, preservação do
  último primeiro valor válido e recuperação ao corrigir o excesso.
- Remova um meio intermediário e depois o primeiro; o primeiro restante deve
  cobrir o saldo. Ao restar um único meio, ele deve assumir R$ 100,00 sem
  trocar o tipo selecionado.
- Confirme os valores no servidor com pagamentos já preenchidos, inclusive
  dinheiro com valor recebido e uma linha zerada. Repita quando o servidor
  retornar R$ 120,00 e R$ 90,00: a lista não pode ser redistribuída e o
  indicador deve mostrar a diferença.
- Use apenas o teclado: `Tab` alcança adicionar meio, cada campo, remover,
  Recalcular e concluir em ordem visível; `Enter`/`Espaço` acionam os botões;
  o foco permanece perceptível e mensagens de erro/resumo podem ser lidas por
  tecnologia assistiva.

### Edição administrativa

- Abra uma venda existente e repita inclusão, preenchimento, ajuste manual do
  primeiro, Recalcular, excesso/recuperação e remoção. Os resultados devem
  coincidir com o PDV.
- Tente salvar com meio zerado e com soma diferente do total: a mensagem deve
  permanecer no modal, o formulário não pode ser fechado nem enviado.
- Salve uma distribuição positiva cuja soma seja igual ao total e confirme que
  os valores enviados permanecem na venda.
- Use `Tab`, `Shift+Tab`, `Enter` e `Espaço` no modal: nenhum controle de
  pagamento deve ficar inacessível ou ocultar o foco; o resumo e os erros
  devem continuar disponíveis após cada ação.


## Layout do PDV no mobile — T-014

Validação automatizada em Chrome headless com API simulada e os arquivos reais de HTML/CSS/JS:

- [x] Catálogo oculto com busca vazia e resultados visíveis ao pesquisar.
- [x] Adicionar limpa a busca, retorna foco e mostra o carrinho atualizado.
- [x] Pagamento expande na mesma tela; sucesso recolhe e mantém comprovante.
- [x] Erro de venda mantém carrinho e pagamento abertos.
- [x] Larguras 320, 390, 600, 920, 921 e 1440 px sem overflow horizontal; troca de largura mantém itens.
- [x] Desktop conserva catálogo e pagamento visíveis.
- [x] Desconto temporariamente vazio não interrompe a renderização.
- [ ] Conferência em aparelho físico com teclado virtual real (não emulado nesta validação).

Provas automatizadas de comportamento: `tests/pdv-mobile.test.js`. Capturas da sessão em `/tmp/pdv-mobile-{cart,payment,desktop,narrow}.png` (temporárias, não versionadas).

Validação manual: o usuário testou a feature no ambiente local e confirmou que está OK antes de solicitar o envio ao Git. Não foram informados aparelho, navegador ou detalhes específicos do teclado virtual.

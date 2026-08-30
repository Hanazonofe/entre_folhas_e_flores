# Conferência no navegador

Use uma origem HTTP local exclusiva e dados fictícios. Nunca execute este roteiro
contra o armazenamento de produção. Não há dependências externas de frontend.

1. Abra o PDV. Adicione uma Suculenta (R$ 18,90), selecione dinheiro e informe R$ 10.
   Fechar deve manter o carrinho e informar insuficiência. Com R$ 20, deve gravar
   uma única venda, limpar o carrinho e mostrar troco de R$ 1,10 no comprovante.
2. Abra vendas, expanda o registro e edite o preço para R$ 25. Salvar com recebido
   de R$ 20 deve manter o formulário aberto. Informe R$ 30: troco R$ 5,00.
3. Nas observações e no nome de produto, use `<img src=x onerror=alert(1)> " &`.
   Salve, reabra, pesquise e confira a impressão. O conteúdo deve ser texto, sem
   elementos injetados ou diálogos. Teste também aspas no código de um produto.
4. Troque dinheiro por Pix e salve: recebido igual ao total, troco zero. Ao mudar
   novamente para dinheiro, é obrigatório preencher recebido. Recarregue para
   conferir a persistência.
5. Recuse o cancelamento: nada muda. Aceite: total ativo exclui a venda, Alterar
   fica desabilitado e o comprovante destaca VENDA CANCELADA. Reative: restaura
   Alterada e inclui novamente a venda nos totais.
6. Repita o ciclo e abra o histórico. Eventos anteriores permanecem e editar as
   observações não os apaga. O aviso sobre histórico local deve estar visível.
7. Exporte o backup. Selecione um JSON inválido: restauração desabilitada, dados
   inalterados. Selecione um válido: conferir contagens e confirmação de troca.
   Cancele a confirmação primeiro; depois restaure e confira após recarregar.
8. Altere uma venda depois de exportar e tente restaurar: deve exigir nova exportação.
9. Confira cadastro, edição/inativação de produtos e importação CSV. Compare o
   estoque antes/depois dos testes de venda: nenhuma movimentação deve ocorrer.
10. Confira a página em tela estreita e o comprovante de 80 mm com nomes longos.

Os testes automatizados adicionais simulam falhas de gravação, corrupção de dados,
falha entre as duas gravações do backup, recuperação pendente, registro inexistente,
edição desatualizada e compatibilidade com vendas antigas sem histórico.

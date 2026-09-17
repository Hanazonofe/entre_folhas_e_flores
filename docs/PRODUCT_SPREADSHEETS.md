# Produtos em Excel

Na aba Produtos, todos os usuários autenticados (administradores e operadores)
podem cadastrar/editar individualmente, exportar e importar produtos.
Permissões de usuários, backups e alterações de vendas continuam restritas como antes.

1. Clique **Exportar produtos (.xlsx)**: inclui todos os produtos, ativos e inativos,
   independentemente da busca ou paginação atual.
2. Edite a aba Produtos no Excel. Preserve CODIGO e BARCODE como Texto para manter
   zeros à esquerda. CODIGO é a chave: mudar o código cria outro produto.
3. Selecione o XLSX e clique **Validar planilha**. Nada é gravado nessa etapa.
4. Confira os totais e os erros por aba/linha. Opcionalmente marque **Ignorar produtos
   inválidos** e valide novamente. Todas as ocorrências de códigos/barcodes duplicados
   são inválidas; não se escolhe uma arbitrariamente.
5. Clique **Confirmar importação** e confirme os totais apresentados.

| Coluna | Tratamento |
| --- | --- |
| CODIGO | Obrigatória; texto único, até 100 caracteres; determina criação/atualização |
| PRODUTO | Obrigatória; nome até 300 caracteres |
| VALOR | Obrigatória; moeda brasileira ou ponto decimal, até duas casas, não negativo |
| BARCODE | Opcional; texto único; célula vazia limpa o barcode para NULL |
| ESTOQUE | Opcional; até três casas decimais, inclusive negativo |
| ATIVO | Opcional; sim/não (também true/false, 1/0, ativo/inativo) |

Colunas opcionais ausentes mantêm os valores de produtos existentes. Em produtos
novos, os padrões são barcode=NULL, estoque=0 e ativo=true. Colunas presentes mas
vazias são inválidas, exceto BARCODE. Remover linhas não exclui produtos.
O arquivo exportado usa valores numéricos para preço/estoque usuais; valores que
excedam a precisão de 15 dígitos do Excel são exportados como texto exato.
Identificadores devem ser armazenados como texto, não apenas exibidos com máscara.
Não são aceitas fórmulas: use Colar especial → Valores antes da importação.

Todas as abas com dados devem seguir os mesmos cabeçalhos. Limites: 5 MB de upload,
30 MB descompactado e 20.000 linhas. Cabeçalhos desconhecidos são rejeitados.
Barcodes pertencentes a outro código são rejeitados, inclusive trocas entre produtos.
Faça essas mudanças separadamente para resolver a unicidade.

A prévia vincula os bytes do arquivo e o estado atual do catálogo. Se algum produto
mudar entre prévia e aplicação, a confirmação é recusada e exige nova validação.
Todas as linhas válidas são aplicadas em uma transação com lock da tabela products;
falhas revertem toda a carga. As demais tabelas e o schema não são alterados.
Em caso de perda de conexão após confirmar, confira o catálogo/exportação antes de
validar novamente: a resposta perdida pode corresponder a um commit concluído.

Endpoints autenticados: GET /api/products/export e POST /api/products/import.
O POST recebe XLSX cru com Content-Type do XLSX, Origin e token CSRF. Sem apply=true
retorna apenas prévia. A aplicação exige o fingerprint preview retornado; skip_invalid
precisa ser igual ao usado na prévia. O importador CLI de carga inicial continua
separado, recusando banco não vazio.

Testes: npm test; npm run check; scripts/test-database.sh
(ou scripts/test-database.sh backend/tests/test_api.py backend/tests/test_product_spreadsheet.py).

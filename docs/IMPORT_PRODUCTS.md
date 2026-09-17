# Carga inicial de produtos

Execute na raiz do projeto com as dependências de `backend/requirements.lock`.
A conexão usa `DATABASE_URL` ou `DATABASE_URL_FILE`, como o backend. Nunca passe
credenciais na linha de comando. O CLI não cria tabelas nem executa migrações.

```sh
PYTHONPATH=backend python -m pdv.import_products '/caminho/produtos.csv' --dry-run
# Somente após revisar o resultado e escolher explicitamente aplicar:
PYTHONPATH=backend python -m pdv.import_products '/caminho/produtos.csv' --apply
```

Sem opção de modo, funciona como `--dry-run`. Os modos são mutuamente exclusivos.
O dry-run usa transação PostgreSQL READ ONLY, sem INSERT ou consumo de IDs.
Saída JSON e código de saída 0 indicam validação bem-sucedida; 1 indica erro
ou impedimento. `validos`/`invalidos` contam registros, não mensagens de erro.
Erros de leitura/cabeçalho impedem a validação completa do arquivo.

## Formato

CSV UTF-8 (BOM opcional), delimitado por vírgula, ponto e vírgula ou tabulação.
Cabeçalhos são sensíveis a maiúsculas; espaços nas extremidades são removidos.
Colunas desconhecidas ou repetidas são rejeitadas para evitar perda silenciosa.

| Coluna | Campo | Regra |
| --- | --- | --- |
| CODIGO | code | Obrigatório, texto de até 100 caracteres |
| PRODUTO | name | Obrigatório, texto de até 300 caracteres |
| VALOR | price_cents | Obrigatório, Decimal com até 2 casas; não arredonda |
| BARCODE | barcode | Opcional, texto de até 100 caracteres; vazio/ausente vira NULL |
| ESTOQUE | stock | Opcional; ausente vira 0.000; até 3 casas, Numeric(16,3) |
| ATIVO | active | Opcional; ausente vira true; true/false, 1/0, sim/não, ativo/inativo |

Números aceitam ponto decimal (`4.50`) ou vírgula decimal (`4,50`), incluindo
milhar brasileiro (`1.234,56`). Valores monetários aceitam prefixo `R$`.
Ponto sem vírgula é sempre decimal, nunca separador de milhar. Valores negativos
são proibidos para preço; estoque segue o modelo, que permite saldo negativo.
Campos opcionais presentes mas vazios são inválidos, exceto BARCODE.
Códigos e barcodes nunca são convertidos em números. Nomes repetidos são permitidos.
Os defaults do modelo geram ID, datas e version. Nenhum schema é alterado.

O CSV fornecido tem somente CODIGO, PRODUTO e ` VALOR`: portanto barcode=NULL,
stock=0.000, active=true. A grafia dos nomes é preservada.

## Segurança e transação

Qualquer produto já existente bloqueia toda a carga, sem opção de sobrescrever
ou ignorar esse bloqueio. Códigos/barcodes duplicados no arquivo e conflitos no
banco são informados por linha; todas as ocorrências duplicadas são inválidas.
Uma falha em qualquer registro impede a carga inteira.

Em --apply, um lock SHARE ROW EXCLUSIVE em products protege a contagem e a
inserção contra gravações concorrentes. O tempo de espera do lock é de 5 segundos.
Todas as inserções fazem parte de uma única transação; inseridos só é atualizado
depois do commit. Somente products é consultada/modificada. É necessário um papel
com permissões de SELECT e INSERT em products (e para o lock requerido).
O dry-run é uma fotografia; --apply repete a validação do arquivo e do banco.

## Testes

```sh
PYTHONPATH=backend python -m pytest tests/importer -q
```

Para também executar os testes de integração, configure
`IMPORT_TEST_DATABASE_URL` para um PostgreSQL **descartável**, cujo banco se chame
`pdv_import_test`. A fixture cria apenas products e limpa essa tabela antes de
cada teste. Não use o banco do PDV. Sem essa variável os testes de integração são
marcados como skipped. Os testes ficam fora de backend/tests para não herdar a
fixture existente que limpa usuários e vendas.

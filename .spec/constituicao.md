# Constituição — v1.2.0

<!--
  Princípios inegociáveis do PDV Entre Folhas e Flores.
  P-xxx = princípio rastreável.
  Níveis: [DEVE] obrigatório · [RECOMENDADO] forte · [PODE] permitido.
-->

## P-001 [DEVE] Todo requisito tem prova executável

Nenhuma feature é considerada concluída sem critérios de aceite verificáveis,
testes correspondentes e audit em modo CI sem erros.

- verificação(gate): intrínseca ao audit


## P-002 [DEVE] Segredos nunca são versionados

Senhas, chaves, tokens e outras credenciais não devem ser armazenados no
código-fonte versionado. Devem ser fornecidos pelo ambiente de execução ou
por mecanismo apropriado de secrets.

- verificação(teste): @principle:P-002


## P-003 [DEVE] Mudanças de schema são feitas por migrations

Toda alteração estrutural no banco de dados deve ser representada por uma
migration versionada. A aplicação não deve depender de alterações manuais
de schema para funcionar.

- verificação(teste): @principle:P-003


## P-004 [DEVE] Testes automatizados nunca usam o banco de produção

Testes automatizados devem utilizar bancos isolados e descartáveis ou
ambientes explicitamente destinados a testes. Nenhum teste automatizado
pode modificar dados do ambiente de produção.

- verificação(teste): @principle:P-004


## P-005 [DEVE] Valores monetários são representados em centavos inteiros

Valores monetários persistidos pelo domínio do PDV devem utilizar centavos
inteiros, evitando representação monetária persistida por ponto flutuante.

- verificação(teste): @principle:P-005


## P-006 [DEVE] A integridade das vendas deve ser preservada

Uma venda confirmada deve manter seus dados essenciais e relacionamentos
consistentes. Alterações posteriores não podem silenciosamente corromper,
apagar ou tornar incoerente o registro histórico da venda.

- verificação(teste): @principle:P-006


## P-007 [DEVE] O modo local não depende de serviços externos para operar

Quando implantado em modo local, a indisponibilidade da Internet ou de
serviços externos não pode impedir as operações essenciais do PDV que
dependem apenas da infraestrutura local.

- verificação(teste): @principle:P-007

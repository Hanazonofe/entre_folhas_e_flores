# Validação — redesenho das telas Garden

Data local: 21/10/2026. Entrega local, sem commit, merge ou publicação automática.

## Resultado da implementação

Login, caixa, produtos, vendas, administração e comprovante migrados. Tokens compartilhados entre catálogo e aplicação; sem CSS inline duplicado nas cinco telas principais. Diálogos de autenticação e confirmação nomeados; edição de vendas com dialog nativo e restauração de foco. Regras financeiras e contratos API preservados. Feature de câmera permanece independente.

## Provas executadas

- `npm run check` e `git diff --check`: PASS.
- `verify redesign-telas-pdv`: exit 0, todos os oito critérios com prova PASS. O comando configurado executou as suítes JavaScript e Python/PostgreSQL descartável, sem acesso à base operacional. O número de testes lidos pelo ONP é o número de registros TAP coletados, não o total de casos pytest.
- Inspeção real no Chrome das seis telas em 360, 768 e 1440 px: sem overflow horizontal; logo carregado em todas. Pagamento dividido no celular, abertura/fechamento por Escape da edição e retorno do foco observados. Detalhes em `tests/BROWSER-CHECKLIST.md`.
- Build de produção local: `garden-pdv-redesign-review:latest`, imagem 436c3e05458e. Construção sem rede não tinha dependências em cache; repetição com rede usou os requirements fixados e passou. Comparação SHA-256 dos 12 recursos empacotados com os locais: PASS.
- Rota FastAPI dos recursos CSS/JS/JPG validada com conteúdo, MIME e recusa de arquivo fora da allowlist.
- Impressão: estados e conteúdo testados; página CSS válida de 80 × 297 mm com margens de 4 mm. Sem teste em impressora física; corte e avanço dependem do driver.

## Saída do verify

```text
verify redesign-telas-pdv: 8/8 critério(s) de aceite com prova PASS · 157 teste(s) lidos · exit 0
  ✔ AC-067 — @spec:AC-067 login envia credenciais, conserva falha e só navega após sucesso; marca e navegação são locais
  ✔ AC-068 — @spec:AC-068 caixa mantém item e controles acessíveis ao alternar desktop e celular
  ✔ AC-069 — @spec:AC-069 falha após conferência preserva pedido e repete a mesma chave antes de confirmar
  ✔ AC-070 — @spec:AC-070 produtos mantém busca, edição, validação e confirmação de importação
  ✔ AC-071 — @spec:AC-071 edição abre diálogo, preserva pagamentos e fecha pelo controle
  ✔ AC-072 — @spec:AC-072 administração preserva restrição por papel e seções de conta, usuários e backup
  ✔ AC-073 — @spec:AC-073 comprovante preserva valores, escape e situação nas três variantes com print independente
  ✔ AC-074 — @spec:AC-074 recursos locais compartilham tokens, têm contraste e controles de 44 pixels
  princípios:
  ✔ P-002 — @principle:P-002 tracked files contain no detected operational secrets
prova gravada em .spec/verification/redesign-telas-pdv.json — rode `onp-spec audit`
```

## Gate global e estado da feature

A auditoria global anterior à entrega encontrou 43 erros e 13 avisos, sem apontamentos atribuídos a esta feature. São 38 erros na especificação pendente de câmera (IDs duplicados e falta de provas) e cinco verificações antigas desatualizadas em outras features. Não renumeramos a câmera, não fabricamos provas e não enfraquecemos gates. A saída integral da auditoria final está em `audit.txt`.

T-022 a T-027 têm critérios provados e estão concluídas. T-028 e a feature permanecem em andamento enquanto o gate global não passar. Pilotos físicos pendentes estão registrados, sem alegação de validação em hardware.

## Preparação para Git e homologação

Envio solicitado pelo usuário após a implementação. Commit inclui somente o design system e a migração das telas; a especificação local de câmera e suas alterações em docs/TESTING.md e sinais.json ficam preservadas fora do commit. Os números de auditoria acima descrevem o workspace local que contém essa especificação pendente. Acrescentada normalização de leitura de garden-logo.jpg ao deploy de homologação, com teste de permissões sob umask restritiva, sem abrir secrets.

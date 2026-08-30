# Entre Folhas e Flores — PDV local

As páginas `pdv.html`, `vendas.html` e `produtos.html` são uma aplicação estática.
O bot Telegram em `main.py` é independente e não foi alterado por estas correções.

## Executar e testar

Sirva a pasta por HTTP, por exemplo com `python3 -m http.server 8765`, e abra
`http://localhost:8765/pdv.html`. Não é necessário instalar dependências JavaScript.
Com Node.js 18 ou superior, rode `npm test` e `npm run check`.

Os testes usam `node:test`, armazenamento em memória com injeção de falhas e um
adaptador de eventos para executar os scripts reais das páginas. Esse adaptador
não substitui o navegador para layout, parsing do DOM e validação nativa de inputs.
O roteiro de conferência visual está em `tests/BROWSER-CHECKLIST.md`.

## Dados, compatibilidade e limites

- As chaves `entre-folhas-produtos` e `entre-folhas-vendas` continuam sendo listas
  JSON. Não há migração automática nem alteração dos valores de vendas antigas.
- O catálogo de exemplo só é usado quando a chave de produtos não existe. Uma
  lista explicitamente vazia permanece vazia. Ler uma página não grava exemplos.
- Dados inválidos impedem gravações em ambas as coleções e geram aviso. Preserve
  os dados originais para diagnóstico; não apague o armazenamento para resolver
  um erro. Um backup inválido não pode substituir os dados atuais.
- O histórico opcional `history` contém eventos `{id, type, at, changes}`. Os tipos
  são `created`, `edited`, `cancelled` e `reactivated`; `changes.before` e
  `changes.after` guardam os campos da venda sem seu histórico. Na criação,
  `before` é `null`. Eventos antigos não são inferidos das observações.
- O histórico é somente leitura na interface, mas pode ser manipulado pelas
  ferramentas do navegador. Não há login, autoria autenticada ou auditoria de servidor.
- Novos cálculos monetários usam centavos inteiros, sem recalcular valores antigos
  durante leitura, cancelamento ou reativação. Edições aplicam as regras atuais.
- Nenhuma operação de venda altera estoque, nem bloqueia por saldo zero/negativo.
- Os dados pertencem à origem do site e ao perfil do navegador. Outro endereço,
  porta, dispositivo ou perfil terá armazenamento separado. Limpar os dados do
  navegador pode apagar os registros. Não há sincronização ou backup automático.
- Use apenas uma aba de operação por vez, especialmente durante restauração.
  O armazenamento local não oferece transações entre abas nem operação multi-caixa.
  A edição rejeita uma venda/produto que mudou desde a abertura do formulário,
  mas isso não constitui controle de concorrência distribuído.

## Backup e recuperação

O painel de backup aparece nas três páginas. Exporte e guarde o arquivo antes de
restaurar; confirme o download no navegador. O aplicativo consegue iniciar o
download, mas não comprovar que o arquivo foi guardado fora do navegador.

O formato é `{version: 1, exportedAt, products, sales}`. A seleção valida todo o
arquivo e mostra as contagens antes de permitir a substituição. Não há mesclagem.
Se os dados mudarem desde a exportação, é necessário exportar novamente. A
restauração também descarta o carrinho e os formulários abertos na página atual.

Antes de substituir as duas coleções, o aplicativo grava uma cópia exata das
chaves originais em `entre-folhas-backup-recovery-v1`. Uma falha reverte as duas
chaves; se a reversão também falhar, essa cópia permanece e bloqueia novas
operações até que a recuperação seja possível. Após liberar espaço ou acesso ao
armazenamento, recarregue a página. Não remova a chave de recuperação manualmente.
Essa cópia temporária exige espaço adicional; sem espaço, a importação não começa.

O arquivo contém produtos, vendas, observações e históricos. Guarde-o com cuidado.

## Entrega

Estas correções partem de `codex/add-pagina-de-vendas-pdv` (base `e84b566`).
O PR destina-se à revisão nessa branch; não publica o site nem altera a `main`.

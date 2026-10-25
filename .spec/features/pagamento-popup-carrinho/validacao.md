# Validação — Pagamento em popup e carrinho

Implementação na branch `spec/pagamento-popup-carrinho`, em worktree isolado. Execução sequencial autorizada com `gpt-6.1-sol`, esforço `high`. Não houve push, merge ou publicação. O executor CLI recusou o modelo antes de editar código; a implementação foi executada pelo agente nativo conforme a autorização já registrada.

## Comportamento implementado

- Resumo Garden sticky acima do carrinho no desktop e antes da busca/carrinho no mobile; valores estimados em centavos e pt-BR até a conferência.
- Diálogo nativo inicialmente fechado. Fechar/Voltar/Escape descartam somente desconto, pagamentos, observações e conferência; o editor é reconstruído sem total antigo.
- Pedido enviado prevalece sobre qualquer limpeza: chave e corpo permanecem iguais na repetição após falha desconhecida; recarga recupera primeiro esse pedido. Confirmação limpa produtos, cobrança e snapshot e oferece comprovante.
- Scanner temporal separado dentro de diálogos: input temporário não chega aos handlers do editor; sequências reconhecidas são restauradas e Enter é protegido. Scans pendentes e respostas tardias são cancelados ao abrir diálogos e em pagehide. Digitação manual segue funcionando.
- Snapshot contém apenas produtos e quantidades, preço estimado, código e nome, vinculado à conta e ao contexto com lease Web Locks. Todas as páginas autenticadas transferem a lease em pagehide; pageshow persistido autentica novamente e substitui o carrinho pelo snapshot atual. Recarga invalida rascunho; cópia de aba ativa recebe identidade nova. Falha de gravação impede navegação que prometa preservar produtos.

## Provas automatizadas

`tests/pdv-payment-dialog.test.js`: 14 testes PASS, incluindo abertura, total, abandono, nova conferência, scanner numérico/alfanumérico, valor aplicado/recebido sem redistribuição temporária, pending idempotente, sucesso e remoção do aviso de carregamento.

`tests/pdv-navigation.test.js`: 14 testes PASS, incluindo cancelar/confirmar link, transferência entre documentos, pageshow persistido, reload, cópia de sessionStorage com lease ocupada, conta/logout, corrupção/indisponibilidade, pending prioritário, quote tardia, pedido resolvido em outro documento e cancelamento de lookup na saída pelo histórico.

Os testes anteriores de mobile e redesign mantêm provas de busca, valores, erros e pedido pendente. Somente os contratos de apresentação inline e preservação da cobrança ao recolher foram substituídos pela decisão posterior explicitamente confirmada em AC-080. O detector de segredos não foi alterado; a fixture de quote usa valor descartável terminado em `test-only`.

- `npm test`: PASS fora do sandbox, também executado em cada verificação completa.
- `npm run check`: PASS, incluindo `sale-navigation.js`.
- `git diff --check`: PASS.
- `verify pagamento-popup-carrinho`: exit 0, **16/16 critérios PASS**, **189 títulos de testes parseados** pelo reporter TAP. O runner real também executou backend e PostgreSQL descartável offline. Prova: `.spec/verification/pagamento-popup-carrinho.json`.
- A inclusão de `sale-navigation.js` em `SAFE_FILES` e no check foi verificada; `deployment/Dockerfile.api` já copia `*.js`, sem mudança de imagem ou build de produção.

## Chrome real — dados simulados locais

Verificações feitas pelo agente coordenador via CUA em uma aba local separada, com servidor mock em `127.0.0.1:8765`, sem acessar serviços operacionais:

| Cenário | Observação |
| --- | --- |
| 360 × 740 e 1440 × 900, carrinho com 15 linhas | Total R$ 143,68; ao rolar até scrollY 2003, resumo permaneceu em top 0; sem rolagem horizontal da página. |
| 360, 768 × 1024 e 1440 px | Diálogo Garden com título/Fechar e ações acessíveis; conteúdo longo rola no corpo. Foco inicial em Fechar; Escape fecha e retorna ao acionador. |
| Abandonar cobrança | Flor a R$ 12,34, desconto R$ 2,00 e observação, conferência R$ 10,34; fechar/reabrir limpou desconto, observação, pagamentos e autorização, mantendo Flor e R$ 12,34. |
| Navegação interna | Produtos abriu aviso; Voltar cancelou preservando venda; confirmar saiu para Produtos e Nova venda recuperou Flor 1 × R$ 12,34. |
| Voltar/Avançar | Recuperou produtos sem aviso garantido; cobrança preenchida antes da saída reapareceu fechada e limpa ao reabrir. |
| Recarga normal | Voltou ao carrinho vazio e R$ 0,00. |
| Abas | Aba direta e Ctrl+clique em Nova venda com opener começaram vazias; aba original conservou seu carrinho. |

## Limites da evidência

O Chrome headless inicial foi bloqueado pelo sandbox (`setsockopt: Operation not permitted`), e a solicitação de execução foi abortada; não houve instalação de dependências. A inspeção nativa foi feita depois via CUA. Screenshots ficaram no histórico das ferramentas, sem arquivo de imagem versionado.

Não houve prova com leitor físico, teclado virtual de aparelho, leitor de tela ou outros navegadores. `pressSequentially` via CUA não garante intervalo de leitor; por isso não é usado como evidência de scanner. O scanner permanece uma heurística temporal, testada com relógio controlado. O diálogo usa o foco modal nativo; a possibilidade de focar a interface do próprio navegador não equivale a ativar controles de fundo. A recarga forçada não foi comprovada via CUA porque o atalho não acionou reload; o teste determinístico cobre a classificação `reload` usada tanto pela recarga normal quanto forçada.

Sem Web Locks ou armazenamento disponível, a recuperação fica indisponível com mensagem e a navegação confirmada com produtos é bloqueada se não houver gravação válida. Fechar a aba e sair do site não têm promessa de aviso ou recuperação. Nenhum beforeunload ou histórico artificial foi introduzido.

## Gate global

O primeiro audit encontrou seis provas antigas desatualizadas, pois o gate compara todo código/testes com o timestamp de cada feature. Todos os 79 critérios já tinham testes e prova PASS; não havia falha funcional nem problema desta feature. As seis provas foram renovadas sequencialmente pelo runner real, sem edição manual de JSON nem alteração dos gates. Pagamentos 17/17, base 9/9, homologação 7/7, mobile 8/8, leitor 14/14 e redesign 8/8: todos PASS e exit 0. T-029 a T-033 concluídas.


Saída final de `onp-spec audit --ci` (exit 0):

```text
resumo: 7 feature(s) · 18 história(s) de usuário · 79 critério(s) de aceite · 79/79 com teste · 79/79 provados
✔ auditoria limpa (0 aviso(s))
```

O plano foi regenerado pelo motor para refletir o escopo final de validação, sem executar novamente o executor CLI. As provas ficam em `.spec/verification/`; o histórico de sinais foi preservado. Nenhum teste foi pulado ou enfraquecido e nenhum JSON de prova foi editado manualmente.
